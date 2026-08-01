-- The legacy defaulted third argument overlaps the new two-argument response RPC.
-- Remove only that ungranted signature so recipients cannot supply a relationship kind.
drop function public.graph_respond_request(uuid, boolean, public.relationship_kind);
