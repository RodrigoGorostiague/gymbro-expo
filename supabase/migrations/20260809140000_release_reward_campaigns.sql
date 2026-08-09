create table public.release_reward_campaigns (
  version text primary key,
  gem_amount integer not null check (gem_amount > 0 and gem_amount <= 1000),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

insert into public.release_reward_campaigns(version, gem_amount, idempotency_key) values
  ('0.2.0', 50, 'release:0.2.0:50-gems'),
  ('0.3.0', 50, 'release:0.3.0:50-gems'),
  ('0.4.0', 100, 'release:0.4.0:100-gems');

create function public.claim_pending_release_gem_rewards()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
  campaign record;
  did_claim boolean;
  claimed_any boolean := false;
begin
  perform private.ensure_actor_profile(actor);
  insert into public.reward_wallets(owner_id) values (actor) on conflict do nothing;

  for campaign in
    select version, gem_amount, idempotency_key
    from public.release_reward_campaigns
    order by created_at, version
  loop
    select public.reward_add_entry(
      actor,
      campaign.idempotency_key,
      campaign.gem_amount,
      'release_gift',
      null,
      jsonb_build_object('releaseVersion', campaign.version)
    ) into did_claim;
    claimed_any := claimed_any or did_claim;
  end loop;

  return jsonb_build_object('claimed', claimed_any, 'wallet', public.load_reward_wallet());
end;
$$;

alter table public.release_reward_campaigns enable row level security;
revoke all on public.release_reward_campaigns from anon, authenticated;
revoke all on function public.claim_pending_release_gem_rewards() from public, anon;
grant execute on function public.claim_pending_release_gem_rewards() to authenticated;
