-- Migration: Add transactions table and listing status for transaction flow

CREATE TYPE transaction_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id uuid REFERENCES users(id),
  seller_id uuid REFERENCES users(id),
  status transaction_status NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add status to listings to control visibility
ALTER TABLE listings ADD COLUMN status text NOT NULL DEFAULT 'active';

-- Optionally, add an index for faster queries
CREATE INDEX idx_transactions_listing_id ON transactions(listing_id);