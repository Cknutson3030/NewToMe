Project: NewToMe (Applied Research)

Scope rules:
- Work ONLY in /backend and optionally /supabase/migrations and /openapi.yaml.
- Do NOT create or modify frontend code (React Native / Expo / UI).
- Do NOT implement chat, transactions, wallet, rewards, or AI calls in Phase 1.
- Use Supabase (Postgres + Auth + Storage). Prefer RLS-safe patterns.
- Keep /health working.

Phase 1 deliverables:
- DB schema + RLS policies for listings + listing_images.
- Auth middleware (Supabase JWT from Authorization header).
- Listings CRUD endpoints + filters.
- Image upload endpoint to Supabase Storage + DB records.
- OpenAPI spec for frontend type generation later.