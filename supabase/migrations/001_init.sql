create extension if not exists "pgcrypto";

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) <= 160),
  description text,
  price numeric(12, 2) check (price is null or price >= 0),
  category text,
  item_condition text,
  location_city text,
  status text not null default 'active' check (status in ('active', 'inactive', 'sold', 'deleted')),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  image_url text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_listings_updated_at on public.listings;
create trigger trg_listings_updated_at
before update on public.listings
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_listing_images_updated_at on public.listing_images;
create trigger trg_listing_images_updated_at
before update on public.listing_images
for each row execute procedure public.set_updated_at();

create index if not exists idx_listings_public_feed
  on public.listings (status, is_deleted, created_at desc);
create index if not exists idx_listings_owner
  on public.listings (owner_user_id);
create index if not exists idx_listings_category
  on public.listings (category);
create index if not exists idx_listings_price
  on public.listings (price);
create index if not exists idx_listing_images_listing_sort
  on public.listing_images (listing_id, sort_order);
create index if not exists idx_listing_images_owner
  on public.listing_images (owner_user_id);

alter table public.listings enable row level security;
alter table public.listing_images enable row level security;

drop policy if exists public_read_active_not_deleted_listings on public.listings;
create policy public_read_active_not_deleted_listings
on public.listings
for select
to anon, authenticated
using (status = 'active' and is_deleted = false);

drop policy if exists owner_insert_listings on public.listings;
create policy owner_insert_listings
on public.listings
for insert
to authenticated
with check (auth.uid() = owner_user_id);

drop policy if exists owner_update_listings on public.listings;
create policy owner_update_listings
on public.listings
for update
to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

drop policy if exists owner_delete_listings on public.listings;
create policy owner_delete_listings
on public.listings
for delete
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists public_read_images_for_public_listings on public.listing_images;
create policy public_read_images_for_public_listings
on public.listing_images
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
      and l.status = 'active'
      and l.is_deleted = false
  )
);

drop policy if exists owner_insert_images_for_own_listings on public.listing_images;
create policy owner_insert_images_for_own_listings
on public.listing_images
for insert
to authenticated
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
      and l.owner_user_id = auth.uid()
      and l.is_deleted = false
  )
);

drop policy if exists owner_update_images_for_own_listings on public.listing_images;
create policy owner_update_images_for_own_listings
on public.listing_images
for update
to authenticated
using (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
      and l.owner_user_id = auth.uid()
  )
)
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
      and l.owner_user_id = auth.uid()
  )
);

drop policy if exists owner_delete_images_for_own_listings on public.listing_images;
create policy owner_delete_images_for_own_listings
on public.listing_images
for delete
to authenticated
using (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
      and l.owner_user_id = auth.uid()
  )
);
