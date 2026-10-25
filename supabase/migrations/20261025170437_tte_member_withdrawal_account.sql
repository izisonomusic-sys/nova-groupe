-- Save a member's default payout destination in the existing profile row.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS withdrawal_country_code text,
  ADD COLUMN IF NOT EXISTS withdrawal_operator text,
  ADD COLUMN IF NOT EXISTS withdrawal_phone text,
  ADD COLUMN IF NOT EXISTS withdrawal_account_name text;

COMMENT ON COLUMN public.profiles.withdrawal_phone IS
  'Saved member withdrawal destination phone in international format; read and written only by the authenticated server API.';
