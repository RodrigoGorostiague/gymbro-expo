-- Active-workout invitations are server-authorized from live circle presence.
-- They deliberately carry no routine or set data: the live group projection is a roster.
create or replace function private.active_workout_activity(member uuid)
returns public.workout_start_activities language sql stable security definer set search_path = '' as $$
  select activity
  from public.workout_start_activities activity
  where activity.author_id = member
    and activity.closed_at is null
    and activity.expires_at > now()
  order by activity.started_at desc
  limit 1
$$;

create or replace function public.list_active_workout_invite_candidates()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); actor_joint_workout_id uuid;
begin
  select joint_workout_id into actor_joint_workout_id from private.active_workout_activity(actor);
  if not found then
    raise exception 'active workout required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', activity.author_id,
      'alias', profile.alias,
       'avatar_id', profile.avatar_id,
       'presentation_theme_id', profile.presentation_theme_id,
       'relationship_kind', relationship.kind,
       'group_member_count', coalesce(source_group.active_count, 1)
     ) order by activity.started_at desc, profile.alias)
    from public.workout_start_activities activity
    join public.profiles profile on profile.id = activity.author_id
    join public.relationships relationship
      on (relationship.member_low = least(actor, activity.author_id)
        and relationship.member_high = greatest(actor, activity.author_id))
    left join lateral (
      select count(*)::integer as member_count
      from public.joint_workout_participants participant
      where participant.joint_workout_id = actor_joint_workout_id
        and participant.status <> 'declined'
    ) target_group on true
    left join lateral (
      select count(*)::integer as active_count
      from public.joint_workout_participants participant
      where participant.joint_workout_id = activity.joint_workout_id
        and participant.status = 'active'
    ) source_group on true
    where activity.author_id <> actor
       and activity.closed_at is null
       and activity.expires_at > now()
       and private.is_current_joint_connection(actor, activity.author_id)
       and not exists (
         select 1 from public.joint_workout_participants current_participant
         where current_participant.joint_workout_id = actor_joint_workout_id
           and current_participant.participant_id = activity.author_id
       )
       and coalesce(target_group.member_count, 1) + coalesce(source_group.active_count, 1) <= 4
   ), '[]'::jsonb);
end;
$$;

create or replace function public.invite_active_workout_member(target uuid, suggested_routine_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  target_activity public.workout_start_activities%rowtype;
  actor_activity public.workout_start_activities%rowtype;
  workout_id uuid;
  participant_count integer;
  source_active_count integer;
begin
  select * into actor_activity from private.active_workout_activity(actor);
  select * into target_activity from private.active_workout_activity(target);
  if actor_activity.id is null or target_activity.id is null then raise exception 'active workout required'; end if;
  perform public.lock_pair(actor, target);
  if not private.is_current_joint_connection(actor, target) then raise exception 'joint workout connection unavailable'; end if;

  workout_id := actor_activity.joint_workout_id;
  if workout_id is null then
    if not private.is_valid_recap_template_routine(suggested_routine_input) then raise exception 'invalid joint workout routine'; end if;
    insert into public.joint_workouts (initiator_id, suggested_routine)
    values (actor, suggested_routine_input) returning id into workout_id;
    insert into public.joint_workout_participants (joint_workout_id, participant_id, routine_snapshot, status, joined_at)
    values (workout_id, actor, null, 'active', now());
    update public.workout_start_activities set joint_workout_id = workout_id where id = actor_activity.id;
  end if;

  if not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'active') then
    raise exception 'joint workout participant unavailable';
  end if;
  if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = target) then
    raise exception 'joint workout participant already exists';
  end if;
  select count(*) into participant_count from public.joint_workout_participants where joint_workout_id = workout_id and status <> 'declined';
  select count(*) into source_active_count from public.joint_workout_participants where joint_workout_id = target_activity.joint_workout_id and status = 'active';
  if participant_count + greatest(source_active_count, 1) > 4 then raise exception 'joint workout participant limit reached'; end if;
  insert into public.joint_workout_participants (joint_workout_id, participant_id, status) values (workout_id, target, 'invited');
  return workout_id;
end;
$$;

drop function if exists public.respond_joint_workout_invite(uuid, boolean, jsonb);
create function public.respond_joint_workout_invite(workout_id uuid, accepted boolean)
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
  if not exists (select 1 from private.active_workout_activity(actor)) then raise exception 'active workout required'; end if;
  if not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'invited') then
    raise exception 'joint workout invite unavailable';
  end if;
  if not accepted then
    update public.joint_workout_participants set status = 'declined', last_seen_at = now()
    where joint_workout_id = workout_id and participant_id = actor and status = 'invited';
    return;
  end if;

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
    update public.joint_workout_participants set joint_workout_id = workout_id, visibility = 'circle', last_seen_at = now()
    where joint_workout_id = source_workout_id and status = 'active';
    update public.joint_workout_participants set status = 'declined', last_seen_at = now()
    where joint_workout_id = source_workout_id and status = 'invited';
    update public.workout_start_activities set joint_workout_id = workout_id
    where joint_workout_id = source_workout_id and closed_at is null and expires_at > now();
    update public.joint_workouts set completed_at = now() where id = source_workout_id;
  end if;

  update public.joint_workout_participants
  set status = 'active', routine_snapshot = null, visibility = 'circle', joined_at = now(), last_seen_at = now()
  where joint_workout_id = workout_id and participant_id = actor and status = 'invited';
  update public.workout_start_activities set joint_workout_id = workout_id where id = source_activity.id;
end;
$$;

create or replace function public.list_joint_workouts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', workout.id, 'initiator_id', workout.initiator_id, 'suggested_routine', null,
    'created_at', workout.created_at, 'completed_at', workout.completed_at,
    'participants', (select jsonb_agg(jsonb_build_object(
      'id', participant.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id,
      'presentation_theme_id', profile.presentation_theme_id, 'status', participant.status,
      'visibility', 'circle', 'is_self', participant.participant_id = actor,
      'relationship_kind', (select relationship.kind from public.relationships relationship
        where relationship.member_low = least(actor, participant.participant_id)
          and relationship.member_high = greatest(actor, participant.participant_id))
    ) order by participant.joined_at nulls last)
    from public.joint_workout_participants participant
    join public.profiles profile on profile.id = participant.participant_id
    where participant.joint_workout_id = workout.id)
  ) order by workout.created_at desc)
  from public.joint_workouts workout
  where workout.completed_at is null
    and exists (select 1 from public.joint_workout_participants participant
      where participant.joint_workout_id = workout.id and participant.participant_id = actor)), '[]'::jsonb);
end;
$$;

create or replace function private.notify_joint_workout_response()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_alias text; actor_avatar_id text; response text;
begin
  if tg_op <> 'UPDATE' or old.status <> 'invited' or new.status not in ('active', 'declined') then return new; end if;
  select alias, avatar_id into actor_alias, actor_avatar_id from public.profiles where id = new.participant_id;
  response := case when new.status = 'active' then 'aceptó tu invitación.' else 'rechazó tu invitación.' end;
  insert into public.notification_inbox (recipient_id, kind, title, body, data, dedupe_key)
  select participant.participant_id,
    'joint_workout_' || new.status::text,
    coalesce(actor_alias, 'Tu conexión') || ' ' || response,
    case when new.status = 'active' then 'Ya están entrenando juntos.' else 'Podés seguir entrenando y enviar otra invitación.' end,
    jsonb_build_object('url', '/community/joint-workout', 'workout_id', new.joint_workout_id, 'actor_avatar_id', actor_avatar_id),
    'joint-workout-response:' || new.joint_workout_id || ':' || new.participant_id || ':' || new.status::text
  from public.joint_workout_participants participant
  where participant.joint_workout_id = new.joint_workout_id
    and participant.participant_id <> new.participant_id
    and participant.status = 'active'
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists joint_workout_response_notification on public.joint_workout_participants;
create trigger joint_workout_response_notification
after update of status on public.joint_workout_participants
for each row execute function private.notify_joint_workout_response();

-- Notification rows are an invalidation signal for the global in-app badge.
drop policy if exists notification_inbox_realtime_recipient on public.notification_inbox;
create policy notification_inbox_realtime_recipient on public.notification_inbox
for select to authenticated using (recipient_id = public.require_actor());
alter publication supabase_realtime add table public.notification_inbox;

create or replace function private.notify_joint_workout_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare initiator_alias text; initiator_avatar_id text;
begin
  if new.status <> 'invited' then return new; end if;
  select profile.alias, profile.avatar_id into initiator_alias, initiator_avatar_id
  from public.joint_workouts workout join public.profiles profile on profile.id = workout.initiator_id
  where workout.id = new.joint_workout_id;
  perform private.create_notification(
    new.participant_id,
    'joint_workout_invite',
    'Invitación para entrenar',
    coalesce(initiator_alias, 'Tu conexión') || ' te invitó a entrenar juntos.',
    jsonb_build_object('url', '/community/joint-workout', 'workout_id', new.joint_workout_id, 'actor_avatar_id', initiator_avatar_id),
    'joint-workout-invite:' || new.joint_workout_id || ':' || new.participant_id
  );
  return new;
end;
$$;

revoke all on function private.active_workout_activity(uuid) from public, anon, authenticated;
revoke all on function private.notify_joint_workout_invite() from public, anon, authenticated;
revoke all on function private.notify_joint_workout_response() from public, anon, authenticated;
revoke all on function public.list_active_workout_invite_candidates(), public.invite_active_workout_member(uuid, jsonb), public.respond_joint_workout_invite(uuid, boolean) from public, anon;
grant execute on function public.list_active_workout_invite_candidates(), public.invite_active_workout_member(uuid, jsonb), public.respond_joint_workout_invite(uuid, boolean) to authenticated;
