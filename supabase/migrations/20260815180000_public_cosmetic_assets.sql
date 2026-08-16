insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cosmetics',
  'cosmetics',
  true,
  5242880,
  array['image/webp', 'application/json']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Clients only read these curated, immutable objects through the public CDN.
-- Publication uses the authenticated Supabase CLI, whose service role bypasses RLS.
