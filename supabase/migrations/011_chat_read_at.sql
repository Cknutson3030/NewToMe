-- Run this in Supabase SQL Editor
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS buyer_last_read_at  timestamptz,
  ADD COLUMN IF NOT EXISTS seller_last_read_at timestamptz;
