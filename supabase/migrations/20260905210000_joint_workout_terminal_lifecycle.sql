-- Joint participation has an explicit server-owned terminal path. The existing
-- declined status remains the terminal umbrella for rejection, expiry, and leave.
create or replace function private.expire_joint_workout_invitations(actor uuid, workout_id_input uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.joint_workout_participants participant
  set status = 'declined', finished_at = coalesce(participant.finished_at, statement_timestamp())
  where participant.status = 'invited'
    and participant.last_seen_at <= statement_timestamp() - interval '2 hours'
    and (
      participant.joint_workout_id = workout_id_input
      or (workout_id_input is null and exists (
        select 1 from public.joint_workout_participants membership
        where membership.joint_workout_id = participant.joint_workout_id
          and membership.participant_id = actor
      ))
    );

  update public.joint_workouts workout
  set completed_at = coalesce(workout.completed_at, statement_timestamp())
  where workout.completed_at is null
    and (
      workout.id = workout_id_input
      or (workout_id_input is null and exists (
        select 1 from public.joint_workout_participants membership
        where membership.joint_workout_id = workout.id
          and membership.participant_id = actor
      ))
    )
    and not exists (
      select 1 from public.joint_workout_participants participant
      where participant.joint_workout_id = workout.id
        and participant.status in ('active', 'invited')
    );
end;
$$;

create or replace function public.leave_joint_workout(workout_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  owner uuid;
  participant_status public.joint_workout_participant_status;
begin
  -- Match finish_joint_workout: participant rows are always locked before the workout row.
  select status into participant_status
  from public.joint_workout_participants
  where joint_workout_id = workout_id and participant_id = actor
  for update;
  if participant_status is null then
    if not exists (select 1 from public.joint_workouts where id = workout_id) then raise exception 'joint workout unavailable'; end if;
    raise exception 'joint workout participant unavailable';
  end if;

  select initiator_id into owner from public.joint_workouts where id = workout_id for update;
  if owner is null then raise exception 'joint workout unavailable'; end if;

  if participant_status in ('completed', 'declined') then
    update public.workout_start_activities set closed_at = statement_timestamp()
    where author_id = actor and joint_workout_id = workout_id and closed_at is null;
    return;
  end if;
  if participant_status <> 'active' then raise exception 'joint workout participant unavailable'; end if;

  update public.joint_workout_participants
  set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp()), last_seen_at = statement_timestamp()
  where joint_workout_id = workout_id and participant_id = actor and status = 'active';
  update public.workout_start_activities set closed_at = statement_timestamp()
  where author_id = actor and joint_workout_id = workout_id and closed_at is null;

  if owner = actor then
    update public.joint_workout_participants
    set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp())
    where joint_workout_id = workout_id and status = 'invited';
  end if;

  if not exists (
    select 1 from public.joint_workout_participants
    where joint_workout_id = workout_id and status = 'active'
  ) then
    update public.joint_workout_participants
    set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp())
    where joint_workout_id = workout_id and status = 'invited';
    update public.joint_workouts set completed_at = coalesce(completed_at, statement_timestamp()) where id = workout_id;
  end if;
end;
$$;

create or replace function public.respond_joint_workout_invite(workout_id uuid, accepted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  source_activity public.workout_start_activities%rowtype;
  source_workout_id uuid;
  source_active_count integer;
  target_count integer;
begin
  perform 1 from public.joint_workouts where id = workout_id and completed_at is null for update;
  if not found then raise exception 'joint workout unavailable'; end if;
  perform private.expire_joint_workout_invitations(actor, workout_id);
  if not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'invited') then
    raise exception 'joint workout invite unavailable';
  end if;
  if not accepted then
    update public.joint_workout_participants set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp()), last_seen_at = statement_timestamp()
    where joint_workout_id = workout_id and participant_id = actor and status = 'invited';
    return;
  end if;
  if not exists (select 1 from private.active_workout_activity(actor)) then raise exception 'active workout required'; end if;

  select * into source_activity from private.active_workout_activity(actor);
  source_workout_id := source_activity.joint_workout_id;
  if source_workout_id is not null and source_workout_id <> workout_id then
    perform 1 from public.joint_workouts where id = source_workout_id and completed_at is null for update;
    if not found or not exists (select 1 from public.joint_workout_participants where joint_workout_id = source_workout_id and participant_id = actor and status = 'active') then
      raise exception 'joint workout invite unavailable';
    end if;
    select count(*) into source_active_count from public.joint_workout_participants where joint_workout_id = source_workout_id and status = 'active';
    select count(*) into target_count from public.joint_workout_participants where joint_workout_id = workout_id;
    if target_count - 1 + source_active_count > 4 then raise exception 'joint workout participant limit reached'; end if;
    delete from public.joint_workout_participants where joint_workout_id = source_workout_id and participant_id = actor;
    update public.joint_workout_participants set joint_workout_id = workout_id, visibility = 'circle', last_seen_at = statement_timestamp()
    where joint_workout_id = source_workout_id and status = 'active';
    update public.joint_workout_participants set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp()), last_seen_at = statement_timestamp()
    where joint_workout_id = source_workout_id and status = 'invited';
    update public.workout_start_activities set joint_workout_id = workout_id
    where joint_workout_id = source_workout_id and closed_at is null and expires_at > statement_timestamp();
    update public.joint_workouts set completed_at = statement_timestamp() where id = source_workout_id;
  end if;

  update public.joint_workout_participants
  set status = 'active', routine_snapshot = null, visibility = 'circle', joined_at = statement_timestamp(), last_seen_at = statement_timestamp()
  where joint_workout_id = workout_id and participant_id = actor and status = 'invited';
  update public.workout_start_activities set joint_workout_id = workout_id where id = source_activity.id;
end;
$$;

create or replace function public.list_joint_workouts()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  perform private.expire_joint_workout_invitations(actor);
  return coalesce((select jsonb_agg(jsonb_build_object('id', workout.id, 'initiator_id', workout.initiator_id, 'suggested_routine', null,
    'created_at', workout.created_at, 'completed_at', workout.completed_at, 'participants', (
      select jsonb_agg(jsonb_build_object('id', participant.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id,
        'equipped_frame_id', profile.equipped_frame_id, 'equipped_title_id', profile.equipped_title_id, 'presentation_theme_id', profile.presentation_theme_id,
        'status', participant.status, 'visibility', 'circle', 'is_self', participant.participant_id = actor,
        'relationship_kind', (select relationship.kind from public.relationships relationship where relationship.member_low = least(actor, participant.participant_id) and relationship.member_high = greatest(actor, participant.participant_id)),
        'live_state', case when participant.status = 'active' then participant.live_state else null end,
        'completed_exercises', case when participant.status = 'active' then participant.completed_exercises else null end,
        'total_exercises', case when participant.status = 'active' then participant.total_exercises else null end,
        'completed_sets', case when participant.status = 'active' then participant.completed_sets else null end,
        'total_sets', case when participant.status = 'active' then participant.total_sets else null end,
        'rest_ends_at', case when participant.status = 'active' then participant.rest_ends_at else null end,
        'live_updated_at', case when participant.status = 'active' then participant.live_updated_at else null end
      ) order by participant.joined_at nulls last)
      from public.joint_workout_participants participant join public.profiles profile on profile.id = participant.participant_id where participant.joint_workout_id = workout.id)
  ) order by workout.created_at desc)
  from public.joint_workouts workout where workout.completed_at is null and exists (select 1 from public.joint_workout_participants participant where participant.joint_workout_id = workout.id and participant.participant_id = actor and participant.status <> 'declined')), '[]'::jsonb);
end;
$$;

create or replace function public.get_community_badge_counts()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor(); incoming_requests integer; unread_notifications integer; joint_invitations integer; plan_share_requests integer;
begin
  perform private.expire_joint_workout_invitations(actor);
  select count(*) into incoming_requests from public.relationship_requests where recipient_id = actor;
  select count(*) into unread_notifications from public.notification_inbox where recipient_id = actor and read_at is null;
  select count(*) into joint_invitations from public.joint_workout_participants participant join public.joint_workouts workout on workout.id = participant.joint_workout_id where participant.participant_id = actor and participant.status = 'invited' and workout.completed_at is null;
  select count(*) into plan_share_requests from public.private_plan_share_requests where recipient_id = actor and status = 'pending';
  return jsonb_build_object('incomingRequests', incoming_requests, 'unreadNotifications', unread_notifications, 'jointInvitations', joint_invitations, 'planShareRequests', plan_share_requests, 'total', incoming_requests + unread_notifications + joint_invitations + plan_share_requests);
end;
$$;

create or replace function public.finish_joint_workout(workout_id uuid, visibility_input public.joint_workout_visibility, completed_workout_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); remaining integer; affected integer; is_initiator boolean;
begin
  if not private.is_valid_joint_completed_workout(completed_workout_input) then raise exception 'invalid joint completed workout'; end if;
  update public.joint_workout_participants set status = 'completed', visibility = visibility_input,
    completed_workout = completed_workout_input, finished_at = statement_timestamp(), last_seen_at = statement_timestamp()
  where joint_workout_id = workout_id and participant_id = actor and status = 'active';
  get diagnostics affected = row_count;
  if affected = 0 then
    if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'completed') then
      update public.workout_start_activities set closed_at = statement_timestamp() where author_id = actor and joint_workout_id = workout_id and closed_at is null;
      return;
    end if;
    raise exception 'joint workout participant unavailable';
  end if;
  update public.workout_start_activities set closed_at = statement_timestamp() where author_id = actor and joint_workout_id = workout_id and closed_at is null;
  select initiator_id = actor into is_initiator from public.joint_workouts where id = workout_id for update;
  if is_initiator then
    update public.joint_workout_participants set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp()), last_seen_at = statement_timestamp() where joint_workout_id = workout_id and status = 'invited';
  end if;
  insert into public.joint_workout_posts (joint_workout_id) values (workout_id)
  on conflict (joint_workout_id) do update set last_activity_at = greatest(joint_workout_posts.last_activity_at, excluded.last_activity_at);
  select count(*) into remaining from public.joint_workout_participants where joint_workout_id = workout_id and status = 'active';
  if remaining = 0 then
    update public.joint_workout_participants set status = 'declined', finished_at = coalesce(finished_at, statement_timestamp()), last_seen_at = statement_timestamp()
    where joint_workout_id = workout_id and status = 'invited';
    update public.joint_workouts set completed_at = coalesce(completed_at, statement_timestamp()) where id = workout_id;
  end if;
  if exists (select 1 from public.community_activities where author_id = actor and kind in ('first_joint_workout', 'joint_workout_completed')) then
    perform private.publish_community_activity(actor, 'joint_workout_completed', format('joint-workout:%s', workout_id), '{}'::jsonb);
  else
    perform private.publish_community_activity(actor, 'first_joint_workout', 'first-joint-workout', '{}'::jsonb);
  end if;
end;
$$;

revoke all on function private.expire_joint_workout_invitations(uuid, uuid) from public, anon, authenticated;
revoke all on function public.leave_joint_workout(uuid) from public, anon;
grant execute on function public.leave_joint_workout(uuid) to authenticated;

-- Realtime only needs the composite primary key to authorize invalidation events.
grant select (joint_workout_id, participant_id) on public.joint_workout_participants to authenticated;
