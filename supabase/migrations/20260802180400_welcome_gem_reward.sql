-- The ledger key makes this launch gift idempotent for every authenticated account.
create function public.claim_welcome_gem_reward()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  claimed boolean;
begin
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

revoke all on function public.claim_welcome_gem_reward() from public, anon;
grant execute on function public.claim_welcome_gem_reward() to authenticated;
