-- Forward-only joint-training evolution: partners are exclusive and joint posts are progressive.
-- The original joint migration is intentionally left intact.

-- Existing data must not silently retain an ambiguous Partner. Keep the most recently updated
-- relationship as Partner and downgrade older ones; new writes are then protected by the trigger.
with ranked as (
  select member_low, member_high,
    row_number() over (partition by member_low order by updated_at desc, member_high) low_rank,
    row_number() over (partition by member_high order by updated_at desc, member_low) high_rank
  from public.relationships where kind = 'partner'
)
update public.relationships relationship
set kind = 'bro', updated_at = now()
from ranked
where relationship.member_low = ranked.member_low and relationship.member_high = ranked.member_high
  and (ranked.low_rank > 1 or ranked.high_rank > 1);

create or replace function private.assert_exclusive_partner_relationship()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind <> 'partner' then return new; end if;
  -- Lock both identities in a stable order so concurrent acceptances cannot race.
  perform pg_advisory_xact_lock(hashtextextended(new.member_low::text, 9101));
  perform pg_advisory_xact_lock(hashtextextended(new.member_high::text, 9101));
  if exists (
    select 1 from public.relationships relationship
    where relationship.kind = 'partner'
      and (relationship.member_low = new.member_low or relationship.member_high = new.member_low
        or relationship.member_low = new.member_high or relationship.member_high = new.member_high)
      and (relationship.member_low, relationship.member_high) <> (new.member_low, new.member_high)
  ) then
    raise exception 'each account can have only one Partner';
  end if;
  return new;
end;
$$;

drop trigger if exists relationships_exclusive_partner on public.relationships;
create trigger relationships_exclusive_partner
before insert or update of kind, member_low, member_high on public.relationships
for each row execute function private.assert_exclusive_partner_relationship();

create or replace function public.graph_send_request(target uuid, requested_kind public.relationship_kind)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); current_kind public.relationship_kind;
begin
  perform public.lock_pair(actor, target);
  if requested_kind = 'partner' and exists (
    select 1 from public.relationships where kind = 'partner'
      and (member_low = actor or member_high = actor or member_low = target or member_high = target)
      and (member_low, member_high) <> (least(actor, target), greatest(actor, target))
  ) then raise exception 'each account can have only one Partner'; end if;
  select kind into current_kind from public.relationships where member_low = least(actor, target) and member_high = greatest(actor, target);
  if current_kind is not null and not (current_kind = 'bro' and requested_kind = 'partner') then raise exception 'relationship transition unavailable'; end if;
  if exists (select 1 from public.relationship_requests where requester_id = target and recipient_id = actor) then raise exception 'request already pending'; end if;
  insert into public.relationship_requests (requester_id, recipient_id, requested_kind) values (actor, target, requested_kind) on conflict (requester_id, recipient_id) do nothing;
end;
$$;

-- Canned actions are removed completely. Direct Partner messages remain a client notification
-- concern and are deliberately not represented as joint-workout activity visible to Bros.
revoke all on function public.send_joint_workout_action(uuid, uuid, public.joint_workout_action_kind), public.list_joint_workout_actions(uuid) from public, anon, authenticated;
drop function if exists public.send_joint_workout_action(uuid, uuid, public.joint_workout_action_kind);
drop function if exists public.list_joint_workout_actions(uuid);
alter publication supabase_realtime drop table public.joint_workout_actions;
drop table public.joint_workout_actions;
drop type public.joint_workout_action_kind;

create or replace function public.finish_joint_workout(workout_id uuid, visibility_input public.joint_workout_visibility, completed_workout_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); remaining integer; affected integer; is_initiator boolean;
begin
  if not private.is_valid_joint_completed_workout(completed_workout_input) then raise exception 'invalid joint completed workout'; end if;
  update public.joint_workout_participants set status = 'completed', visibility = visibility_input,
    completed_workout = completed_workout_input, finished_at = now(), last_seen_at = now()
  where joint_workout_id = workout_id and participant_id = actor and status = 'active';
  get diagnostics affected = row_count;
  if affected = 0 then
    if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'completed') then return; end if;
    raise exception 'joint workout participant unavailable';
  end if;
  select initiator_id = actor into is_initiator from public.joint_workouts where id = workout_id for update;
  if is_initiator then
    update public.joint_workout_participants set status = 'declined', last_seen_at = now() where joint_workout_id = workout_id and status = 'invited';
  end if;
  -- First actual active -> completed transition makes the single group post live.
  insert into public.joint_workout_posts (joint_workout_id) values (workout_id) on conflict do nothing;
  select count(*) into remaining from public.joint_workout_participants where joint_workout_id = workout_id and status = 'active';
  if remaining = 0 then update public.joint_workouts set completed_at = coalesce(completed_at, now()) where id = workout_id; end if;
end;
$$;

create or replace function private.can_view_joint_post(viewer uuid, workout uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.joint_workout_participants p where p.joint_workout_id = workout and p.participant_id = viewer and p.status = 'completed')
    or exists (select 1 from public.joint_workout_participants p where p.joint_workout_id = workout and p.status = 'completed' and private.is_current_joint_connection(viewer, p.participant_id))
$$;

create or replace function public.list_joint_workout_posts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', workout.id, 'created_at', post.created_at, 'completed_at', workout.completed_at,
    'participants', (select jsonb_agg(jsonb_build_object('id', p.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id, 'presentation_theme_id', profile.presentation_theme_id, 'status', p.status) order by p.joined_at nulls last)
      from public.joint_workout_participants p join public.profiles profile on profile.id = p.participant_id where p.joint_workout_id = workout.id)) order by post.created_at desc)
  from public.joint_workout_posts post join public.joint_workouts workout on workout.id = post.joint_workout_id where private.can_view_joint_post(actor, workout.id)), '[]'::jsonb);
end;
$$;

create or replace function public.get_joint_workout_detail(workout_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); result jsonb;
begin
  if not exists (select 1 from public.joint_workout_posts where joint_workout_id = workout_id) or not private.can_view_joint_post(actor, workout_id) then raise exception 'joint workout unavailable'; end if;
  select jsonb_build_object('id', workout.id, 'initiator_id', workout.initiator_id, 'suggested_routine', workout.suggested_routine, 'created_at', post.created_at, 'completed_at', workout.completed_at, 'participants', (
    select jsonb_agg(jsonb_build_object('id', p.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id, 'presentation_theme_id', profile.presentation_theme_id, 'status', p.status, 'visibility', p.visibility,
      'relationship_kind', (select r.kind from public.relationships r where r.member_low = least(actor, p.participant_id) and r.member_high = greatest(actor, p.participant_id)),
      'workout', case when p.status = 'completed' and private.can_view_joint_participant(actor, p.participant_id, p.visibility) then p.completed_workout else null end,
      'share_payload', case when p.status = 'completed' and private.can_view_joint_participant(actor, p.participant_id, p.visibility) then jsonb_build_object('version', 1, 'routine', p.routine_snapshot) else null end,
      'can_invite_bro', p.participant_id <> actor and not private.is_current_joint_connection(actor, p.participant_id)) order by p.joined_at nulls last)
    from public.joint_workout_participants p join public.profiles profile on profile.id = p.participant_id where p.joint_workout_id = workout.id
  )) into result from public.joint_workouts workout join public.joint_workout_posts post on post.joint_workout_id = workout.id where workout.id = workout_id;
  return result;
end;
$$;

create or replace function public.list_joint_workouts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', workout.id, 'initiator_id', workout.initiator_id, 'suggested_routine', workout.suggested_routine, 'created_at', workout.created_at, 'completed_at', workout.completed_at,
    'participants', (select jsonb_agg(jsonb_build_object('id', p.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id, 'presentation_theme_id', profile.presentation_theme_id, 'status', p.status, 'visibility', p.visibility, 'is_self', p.participant_id = actor, 'relationship_kind', (select r.kind from public.relationships r where r.member_low = least(actor, p.participant_id) and r.member_high = greatest(actor, p.participant_id))) order by p.joined_at nulls last) from public.joint_workout_participants p join public.profiles profile on profile.id = p.participant_id where p.joint_workout_id = workout.id)) order by workout.created_at desc)
  from public.joint_workouts workout where exists (select 1 from public.joint_workout_participants p where p.joint_workout_id = workout.id and p.participant_id = actor) and workout.completed_at is null), '[]'::jsonb);
end;
$$;

grant execute on function public.finish_joint_workout(uuid, public.joint_workout_visibility, jsonb), public.list_joint_workouts(), public.list_joint_workout_posts(), public.get_joint_workout_detail(uuid) to authenticated;
