create or replace function public.claim_release_0_3_0_gem_reward()
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
    'release:0.3.0:50-gems',
    50,
    'release_gift',
    null,
    jsonb_build_object('releaseVersion', '0.3.0')
  ) into claimed;
  return jsonb_build_object('claimed', claimed, 'wallet', public.load_reward_wallet());
end;
$$;

revoke all on function public.claim_release_0_3_0_gem_reward() from public, anon;
grant execute on function public.claim_release_0_3_0_gem_reward() to authenticated;
