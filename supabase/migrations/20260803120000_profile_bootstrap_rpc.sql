-- Keep profile bootstrap server-owned so clients never need to read auth user data
-- or write the private profile table directly.
create or replace function public.ensure_own_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_actor_profile(public.require_actor());
end;
$$;

revoke all on function public.ensure_own_profile() from public, anon, authenticated;
grant execute on function public.ensure_own_profile() to authenticated;
