-- List cards must never fan out into one private-insight request per profile.
create function public.list_social_profile_insights(targets uuid[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(candidate.id::text, public.get_social_profile_insights(candidate.id)), '{}'::jsonb)
  from (
    select distinct target.id
    from unnest(coalesce(targets, '{}'::uuid[])) target(id)
    join public.relationships relationship
      on relationship.member_low = least(public.require_actor(), target.id)
        and relationship.member_high = greatest(public.require_actor(), target.id)
    where target.id <> public.require_actor()
      and not private.is_blocked_pair(public.require_actor(), target.id)
    limit 50
  ) candidate;
$$;

revoke all on function public.list_social_profile_insights(uuid[]) from public, anon;
grant execute on function public.list_social_profile_insights(uuid[]) to authenticated;
