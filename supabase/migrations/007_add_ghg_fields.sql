-- Add GHG emissions data to listings (kg CO2e estimates from AI analysis)
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS ghg_manufacturing_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS ghg_materials_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS ghg_transport_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS ghg_end_of_life_kg NUMERIC;

-- Add GHG credit balance to profiles (accumulated from buying/selling)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ghg_balance NUMERIC NOT NULL DEFAULT 0;

-- RPC function to safely increment a user's GHG balance (upserts profile row if missing)
CREATE OR REPLACE FUNCTION increment_ghg_balance(user_id UUID, amount NUMERIC)
RETURNS void AS $$
BEGIN
  INSERT INTO profiles (id, ghg_balance)
    VALUES (user_id, amount)
  ON CONFLICT (id) DO UPDATE
    SET ghg_balance = profiles.ghg_balance + EXCLUDED.ghg_balance,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
