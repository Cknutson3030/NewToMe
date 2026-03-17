alter table if exists public.transactions
add column if not exists offered_price numeric(10,2) null;

alter table if exists public.transactions
add column if not exists notes text null;
