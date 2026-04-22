-- 009: Fix signup failures caused by broken auth.users -> profiles trigger logic
-- This migration is defensive and idempotent so it can be safely reapplied.

-- Ensure profiles table exists with required columns.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(100),
  ghg_balance NUMERIC NOT NULL DEFAULT 0,
  wallet_balance NUMERIC NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ghg_balance NUMERIC,
  ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.profiles
SET
  ghg_balance = COALESCE(ghg_balance, 0),
  wallet_balance = COALESCE(wallet_balance, 1000),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW());

ALTER TABLE public.profiles
  ALTER COLUMN ghg_balance SET DEFAULT 0,
  ALTER COLUMN wallet_balance SET DEFAULT 1000,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN ghg_balance SET NOT NULL,
  ALTER COLUMN wallet_balance SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- Keep updated_at in sync.
CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profiles_updated_at();

-- Drop all user-defined triggers on auth.users to prevent legacy/broken trigger conflicts.
DO $$
DECLARE
  trigger_row RECORD;
BEGIN
  FOR trigger_row IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND NOT tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users;', trigger_row.tgname);
  END LOOP;
END;
$$;

-- Recreate a safe profile trigger that never blocks auth signup.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (
      id,
      ghg_balance,
      wallet_balance,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      0,
      1000,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
      SET
        ghg_balance = COALESCE(public.profiles.ghg_balance, 0),
        wallet_balance = COALESCE(public.profiles.wallet_balance, 1000),
        updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN
    -- Never fail auth signup because of a profile write issue.
    RAISE WARNING 'handle_new_user_profile failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();
