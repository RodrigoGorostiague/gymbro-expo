-- Public aliases must never default to an authentication email address.
-- Existing aliases are changed only when they exactly match the account email.
update public.profiles profile
set alias = 'member-' || profile.id::text
from auth.users account
where account.id = profile.id
  and lower(trim(profile.alias)) = lower(trim(account.email));

create or replace function private.ensure_actor_profile(actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users where id = actor) then
    raise exception 'authenticated user is unavailable';
  end if;

  insert into public.profiles (id, alias)
  values (actor, 'member-' || actor::text)
  on conflict (id) do nothing;
end;
$$;

create or replace function public.claim_release_0_2_0_gem_reward()
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
    'release:0.2.0:50-gems',
    50,
    'release_gift',
    null,
    jsonb_build_object('releaseVersion', '0.2.0')
  ) into claimed;
  return jsonb_build_object('claimed', claimed, 'wallet', public.load_reward_wallet());
end;
$$;

revoke all on function public.claim_release_0_2_0_gem_reward() from public, anon;
grant execute on function public.claim_release_0_2_0_gem_reward() to authenticated;
