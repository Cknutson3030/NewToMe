alter table public.listing_images
  add column if not exists storage_path text;

alter table public.listing_images
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_listing_images_updated_at on public.listing_images;
create trigger trg_listing_images_updated_at
before update on public.listing_images
for each row execute procedure public.set_updated_at();