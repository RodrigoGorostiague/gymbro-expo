-- Publish only the relationship state whose existing RLS policies authorize subscribers.
-- Rollback is a compensating migration that removes these tables from the publication.

alter publication supabase_realtime add table public.relationships;
alter publication supabase_realtime add table public.relationship_requests;
alter publication supabase_realtime add table public.blocks;
