create or replace function public.claim_pending_release_updates(max_release_sequence integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
  campaign_row record;
  did_claim boolean;
  claimed_any boolean := false;
begin
  if max_release_sequence is null or max_release_sequence < 1 then raise exception 'invalid release sequence'; end if;
  perform private.ensure_actor_profile(actor);
  insert into public.reward_wallets(owner_id) values (actor) on conflict do nothing;

  for campaign_row in
    select release_campaign.version, release_campaign.gem_amount, release_campaign.idempotency_key
    from public.release_reward_campaigns release_campaign
    join public.release_announcements announcement on announcement.version = release_campaign.version
    where announcement.release_sequence <= max_release_sequence
    order by announcement.release_sequence
  loop
    select public.reward_add_entry(
      actor,
      campaign_row.idempotency_key,
      campaign_row.gem_amount,
      'release_gift',
      null,
      jsonb_build_object('releaseVersion', campaign_row.version)
    ) into did_claim;
    claimed_any := claimed_any or did_claim;
  end loop;

  return jsonb_build_object(
    'claimed', claimed_any,
    'wallet', public.load_reward_wallet(),
    'releases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'version', announcement.version,
        'title', announcement.title,
        'message', announcement.message,
        'features', announcement.features,
        'fixes', announcement.fixes,
        'rewardGems', announcement.reward_gems,
        'rewardClaimed', announcement.reward_gems > 0
      ) order by announcement.release_sequence)
      from public.release_announcements announcement
      where announcement.release_sequence <= max_release_sequence and not exists (
        select 1 from public.release_announcement_acknowledgements acknowledgement
        where acknowledgement.owner_id = actor and acknowledgement.version = announcement.version
      )
    ), '[]'::jsonb)
  );
end;
$$;
