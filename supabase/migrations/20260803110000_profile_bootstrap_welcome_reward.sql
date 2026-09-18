-- Profiles are required before reward wallet rows can satisfy their foreign key.
-- Email aliases may use the full verified address (up to 320 characters).
alter table public.profiles drop constraint if exists profiles_alias_check;
alter table public.profiles add constraint profiles_alias_length_check
  check (char_length(alias) between 3 and 320);

-- This is server-owned repair logic for older accounts that predate client bootstrap.
-- It derives the initial alias from auth.users and never overwrites a user-edited alias.
create or replace function private.ensure_actor_profile(actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  initial_alias text;
begin
  select coalesce(nullif(trim(email), ''), 'member-' || actor::text)
  into initial_alias
  from auth.users
  where id = actor;

  if initial_alias is null then
    raise exception 'authenticated user is unavailable';
  end if;

  insert into public.profiles (id, alias)
  values (actor, initial_alias)
  on conflict (id) do nothing;
end;
$$;

create or replace function public.claim_welcome_gem_reward()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
  claimed boolean;
begin
  perform private.ensure_actor_profile(actor);
  insert into public.reward_wallets(owner_id) values (actor) on conflict do nothing;
  select public.reward_add_entry(
    actor,
    'welcome:250-gems:v1',
    250,
    'welcome_gift',
    null,
    jsonb_build_object('campaign', 'welcome-250-gems-v1')
  ) into claimed;
  return jsonb_build_object('claimed', claimed, 'wallet', public.load_reward_wallet());
end;
$$;

revoke all on function private.ensure_actor_profile(uuid) from public, anon, authenticated;
revoke all on function public.claim_welcome_gem_reward() from public, anon;
grant execute on function public.claim_welcome_gem_reward() to authenticated;
