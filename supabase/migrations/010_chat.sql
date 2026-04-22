-- ============================================================
-- Chat feature: conversations + messages
-- Run this in Supabase SQL Editor
-- ============================================================

-- Conversations: one per (listing, buyer). Seller is the listing owner.
create table if not exists conversations (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references listings(id),
  buyer_user_id   uuid not null,
  seller_user_id  uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Prevent duplicate conversations for the same buyer+listing
  constraint conversations_unique_buyer_listing unique (listing_id, buyer_user_id)
);

-- Messages within a conversation
create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  sender_user_id   uuid not null,
  body             text not null check (char_length(body) > 0 and char_length(body) <= 2000),
  created_at       timestamptz not null default now()
);

-- Indexes for common query patterns
create index if not exists idx_conversations_buyer  on conversations(buyer_user_id);
create index if not exists idx_conversations_seller on conversations(seller_user_id);
create index if not exists idx_messages_conversation on messages(conversation_id, created_at);

-- Auto-update conversations.updated_at when a message is inserted
create or replace function update_conversation_updated_at()
returns trigger language plpgsql as $$
begin
  update conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_messages_update_conversation on messages;
create trigger trg_messages_update_conversation
  after insert on messages
  for each row execute function update_conversation_updated_at();

-- ============================================================
-- RLS (Row Level Security) — enable if your project uses RLS
-- ============================================================
-- alter table conversations enable row level security;
-- alter table messages enable row level security;

-- Allow participants to see their own conversations
-- create policy "participants can view conversations"
--   on conversations for select
--   using (auth.uid() = buyer_user_id or auth.uid() = seller_user_id);

-- Allow participants to view messages in their conversations
-- create policy "participants can view messages"
--   on messages for select
--   using (
--     exists (
--       select 1 from conversations c
--       where c.id = conversation_id
--         and (c.buyer_user_id = auth.uid() or c.seller_user_id = auth.uid())
--     )
--   );
