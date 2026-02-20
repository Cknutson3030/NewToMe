# NewToMe Backend (Phase 1)

## What is included
- Supabase-backed listings CRUD with soft-delete
- Listing image uploads to Supabase Storage (max 5 images per listing)
- Supabase JWT auth middleware (`Authorization: Bearer <token>`)
- Zod request validation and centralized error handling
- Public health endpoint at `GET /health`

## Requirements
- Node.js 18+
- npm
- Supabase project (URL, anon key, service role key)

## Setup
1. Install dependencies:
```bash
cd backend
npm install
```
2. Configure environment variables:
```bash
cp .env.example .env
```
3. Fill `.env`:
- `PORT` API port (default `3000`)
- `SUPABASE_URL` your Supabase project URL
- `SUPABASE_ANON_KEY` Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` Supabase service role key
- `SUPABASE_STORAGE_BUCKET` storage bucket for listing images
- `PUBLIC_BASE_URL` optional
4. Create the storage bucket in Supabase Storage if it does not exist (example: `listing-images`).
5. Apply SQL migration from `supabase/migrations/001_init.sql`:
- Option A (Dashboard): Supabase Dashboard -> SQL Editor -> paste and run the file contents
- Option B (CLI): run migration with your existing Supabase CLI workflow
6. Run development server:
```bash
npm run dev
```

## Build
```bash
npm run build
```

## API endpoints
- `GET /health`
- `GET /listings`
- `GET /listings/:id`
- `POST /listings` (auth)
- `PATCH /listings/:id` (auth, owner only)
- `DELETE /listings/:id` (auth, owner only, soft delete)
- `POST /listings/:id/images` (auth, owner only, multipart upload)

## Curl examples
Set a token first:
```bash
TOKEN="your-supabase-access-token"
```

Create listing:
```bash
curl -X POST http://localhost:3000/listings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Used desk lamp",
    "description": "Works great",
    "price": 24.99,
    "category": "home",
    "item_condition": "good",
    "location_city": "Minneapolis",
    "status": "active"
  }'
```

Get listings with filters:
```bash
curl "http://localhost:3000/listings?category=home&min_price=10&max_price=100&sort_by=created_at&sort_order=desc"
```

Get listing by id:
```bash
curl http://localhost:3000/listings/<listing_id>
```

Update listing:
```bash
curl -X PATCH http://localhost:3000/listings/<listing_id> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"price": 19.99, "status": "sold"}'
```

Soft delete listing:
```bash
curl -X DELETE http://localhost:3000/listings/<listing_id> \
  -H "Authorization: Bearer $TOKEN"
```

Upload listing images:
```bash
curl -X POST http://localhost:3000/listings/<listing_id>/images \
  -H "Authorization: Bearer $TOKEN" \
  -F "images=@/absolute/path/image1.jpg" \
  -F "images=@/absolute/path/image2.png"
```
