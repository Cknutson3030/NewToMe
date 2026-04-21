-- 008: Finance (wallet balance, dual confirmation) + Rewards (GHG history, discount)

-- 1. Add wallet_balance to profiles (demo starter balance: $1000)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC NOT NULL DEFAULT 1000;

-- Ensure default applies going forward even if the column already existed
ALTER TABLE profiles ALTER COLUMN wallet_balance SET DEFAULT 1000;

-- 2. Add new transaction_status value 'completed' for dual confirmation flow
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'completed';

-- 3. Add dual-confirmation flags + ghg_discount to transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS buyer_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS seller_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ghg_discount NUMERIC NOT NULL DEFAULT 0;

-- 4. GHG history table — per-transaction record of credits earned
CREATE TABLE IF NOT EXISTS public.ghg_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  listing_title TEXT,
  role TEXT NOT NULL CHECK (role IN ('buyer', 'seller')),
  kg_saved NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ghg_history_user_id ON public.ghg_history(user_id);

-- 5. Atomic wallet transfer function (deduct buyer, credit seller)
--    Raises an exception if buyer has insufficient funds.
CREATE OR REPLACE FUNCTION transfer_wallet_balance(
  p_buyer_id UUID,
  p_seller_id UUID,
  p_amount NUMERIC
) RETURNS void AS $$
DECLARE
  buyer_bal NUMERIC;
BEGIN
  -- Lock buyer row to prevent race conditions
  SELECT wallet_balance INTO buyer_bal
    FROM profiles
    WHERE id = p_buyer_id
    FOR UPDATE;

  IF buyer_bal IS NULL THEN
    RAISE EXCEPTION 'Buyer profile not found';
  END IF;

  IF buyer_bal < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  -- Deduct from buyer
  UPDATE profiles
    SET wallet_balance = wallet_balance - p_amount,
        updated_at = NOW()
    WHERE id = p_buyer_id;

  -- Credit seller (upsert in case profile row is missing)
  INSERT INTO profiles (id, wallet_balance)
    VALUES (p_seller_id, p_amount)
  ON CONFLICT (id) DO UPDATE
    SET wallet_balance = profiles.wallet_balance + EXCLUDED.wallet_balance,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 6. Seed $1000 starter balance for demo / science fair
--    Backfills existing profiles and creates missing profile rows for auth users.
UPDATE profiles SET wallet_balance = 1000 WHERE wallet_balance = 0;

INSERT INTO profiles (id, wallet_balance)
SELECT u.id, 1000
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE p.id IS NULL;

-- 7. Auto-create profile with $1000 starter balance on new signup
CREATE OR REPLACE FUNCTION handle_new_user_wallet()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, wallet_balance)
    VALUES (NEW.id, 1000)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_wallet ON auth.users;
CREATE TRIGGER on_auth_user_created_wallet
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_wallet();
