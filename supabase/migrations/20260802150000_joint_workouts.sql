-- Server-owned joint workout coordination. Individual training state remains private.
create type public.joint_workout_participant_status as enum ('invited', 'active', 'completed', 'declined');
create type public.joint_workout_visibility as enum ('public', 'circle', 'private');

create table public.joint_workouts (
  id uuid primary key default gen_random_uuid(),
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  suggested_routine jsonb not null check (private.is_valid_recap_template_routine(suggested_routine)),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.joint_workout_participants (
  joint_workout_id uuid not null references public.joint_workouts(id) on delete cascade,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  routine_snapshot jsonb check (routine_snapshot is null or private.is_valid_recap_template_routine(routine_snapshot)),
  completed_workout jsonb,
  status public.joint_workout_participant_status not null,
  visibility public.joint_workout_visibility not null default 'circle',
  joined_at timestamptz,
  finished_at timestamptz,
  last_seen_at timestamptz not null default now(),
  primary key (joint_workout_id, participant_id)
);

create table public.joint_workout_posts (
  joint_workout_id uuid primary key references public.joint_workouts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create type public.joint_workout_action_kind as enum ('push', 'nice_set', 'finish_strong', 'partner_proud');
create table public.joint_workout_actions (
  id uuid primary key default gen_random_uuid(),
  joint_workout_id uuid not null references public.joint_workouts(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  action public.joint_workout_action_kind not null,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index joint_workout_participants_member_active on public.joint_workout_participants (participant_id, status, last_seen_at desc);
create index joint_workout_posts_page on public.joint_workout_posts (created_at desc, joint_workout_id desc);
create index joint_workout_actions_session_page on public.joint_workout_actions (joint_workout_id, created_at desc);

create function private.is_current_joint_connection(viewer uuid, member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select viewer <> member and not private.is_blocked_pair(viewer, member) and exists (
    select 1 from public.relationships
    where member_low = least(viewer, member) and member_high = greatest(viewer, member)
      and kind in ('bro', 'partner')
  )
$$;

create function private.can_view_joint_participant(viewer uuid, member uuid, member_visibility public.joint_workout_visibility)
returns boolean language sql stable security definer set search_path = '' as $$
  select viewer = member or member_visibility = 'public'
    or (member_visibility = 'circle' and private.is_current_joint_connection(viewer, member))
$$;

create function private.is_valid_joint_completed_workout(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare exercise jsonb; set_value jsonb; muscle jsonb;
begin
  if jsonb_typeof(value) <> 'object' or not value ?& array['routineName', 'durationSeconds', 'exercises']
    or exists (select 1 from jsonb_object_keys(value) key where key <> all(array['routineName', 'durationSeconds', 'exercises']))
    or jsonb_typeof(value -> 'routineName') <> 'string' or char_length(btrim(value ->> 'routineName')) not between 1 and 120
    or jsonb_typeof(value -> 'durationSeconds') <> 'number' or (value ->> 'durationSeconds')::numeric <> trunc((value ->> 'durationSeconds')::numeric) or (value ->> 'durationSeconds')::integer not between 0 and 18000
    or jsonb_typeof(value -> 'exercises') <> 'array' or jsonb_array_length(value -> 'exercises') > 100 then return false; end if;
  for exercise in select element.value from jsonb_array_elements(value -> 'exercises') as element(value) loop
    if jsonb_typeof(exercise) <> 'object' or not exercise ?& array['name', 'muscleGroupIds', 'sets']
      or exists (select 1 from jsonb_object_keys(exercise) key where key <> all(array['name', 'muscleGroupIds', 'sets']))
      or jsonb_typeof(exercise -> 'name') <> 'string' or char_length(btrim(exercise ->> 'name')) not between 1 and 120
      or jsonb_typeof(exercise -> 'muscleGroupIds') <> 'array' or jsonb_typeof(exercise -> 'sets') <> 'array' or jsonb_array_length(exercise -> 'sets') > 100 then return false; end if;
    for muscle in select element.value from jsonb_array_elements(exercise -> 'muscleGroupIds') as element(value) loop
      if jsonb_typeof(muscle) <> 'string' or char_length(btrim(muscle #>> '{}')) not between 1 and 120 then return false; end if;
    end loop;
    for set_value in select element.value from jsonb_array_elements(exercise -> 'sets') as element(value) loop
      if jsonb_typeof(set_value) <> 'object' or not set_value ?& array['weight', 'reps', 'completed']
        or exists (select 1 from jsonb_object_keys(set_value) key where key <> all(array['weight', 'reps', 'completed']))
        or jsonb_typeof(set_value -> 'weight') <> 'number' or (set_value ->> 'weight')::numeric not between 0 and 10000
        or jsonb_typeof(set_value -> 'reps') <> 'number' or (set_value ->> 'reps')::numeric <> trunc((set_value ->> 'reps')::numeric) or (set_value ->> 'reps')::integer not between 0 and 1000
        or jsonb_typeof(set_value -> 'completed') <> 'boolean' then return false; end if;
    end loop;
  end loop;
  return true;
end;
$$;

create function public.create_joint_workout(target uuid, suggested_routine_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); workout_id uuid;
begin
  perform public.lock_pair(actor, target);
  if not private.is_current_joint_connection(actor, target) then raise exception 'joint workout connection unavailable'; end if;
  if not private.is_valid_recap_template_routine(suggested_routine_input) then raise exception 'invalid joint workout routine'; end if;
  insert into public.joint_workouts (initiator_id, suggested_routine) values (actor, suggested_routine_input) returning id into workout_id;
  insert into public.joint_workout_participants (joint_workout_id, participant_id, routine_snapshot, status, joined_at)
  values (workout_id, actor, suggested_routine_input, 'active', now()), (workout_id, target, null, 'invited', null);
  return workout_id;
end;
$$;

create function public.respond_joint_workout_invite(workout_id uuid, accepted boolean, routine_input jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); owner uuid;
begin
  select initiator_id into owner from public.joint_workouts where id = workout_id and completed_at is null for update;
  if owner is null then raise exception 'joint workout unavailable'; end if;
  if not private.is_current_joint_connection(actor, owner) then raise exception 'joint workout connection unavailable'; end if;
  if accepted and not private.is_valid_recap_template_routine(routine_input) then raise exception 'invalid joint workout routine'; end if;
  update public.joint_workout_participants
  set status = case when accepted then 'active'::public.joint_workout_participant_status else 'declined'::public.joint_workout_participant_status end, routine_snapshot = case when accepted then routine_input else null end,
      joined_at = case when accepted then now() else null end, last_seen_at = now()
  where joint_workout_id = workout_id and participant_id = actor and status = 'invited';
  if not found then raise exception 'joint workout invite unavailable'; end if;
end;
$$;

create function public.add_joint_workout_participant(workout_id uuid, target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); owner uuid; participant_count integer;
begin
  select initiator_id into owner from public.joint_workouts where id = workout_id and completed_at is null for update;
  if owner is null or owner <> actor then raise exception 'joint workout invite unavailable'; end if;
  if not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'active') then raise exception 'joint workout invite unavailable'; end if;
  perform public.lock_pair(actor, target);
  if not private.is_current_joint_connection(actor, target) then raise exception 'joint workout connection unavailable'; end if;
  if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = target) then raise exception 'joint workout participant already exists'; end if;
  select count(*) into participant_count from public.joint_workout_participants where joint_workout_id = workout_id;
  if participant_count >= 4 then raise exception 'joint workout participant limit reached'; end if;
  insert into public.joint_workout_participants (joint_workout_id, participant_id, status) values (workout_id, target, 'invited');
end;
$$;

create function public.touch_joint_workout_presence(workout_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  update public.joint_workout_participants set last_seen_at = now()
  where joint_workout_id = workout_id and participant_id = actor and status = 'active';
  if not found then raise exception 'joint workout participant unavailable'; end if;
end;
$$;

create function public.finish_joint_workout(workout_id uuid, visibility_input public.joint_workout_visibility, completed_workout_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); remaining integer; is_initiator boolean;
begin
  if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'completed') then return; end if;
  if not private.is_valid_joint_completed_workout(completed_workout_input) then raise exception 'invalid joint completed workout'; end if;
  update public.joint_workout_participants set status = 'completed', visibility = visibility_input, completed_workout = completed_workout_input, finished_at = now(), last_seen_at = now()
  where joint_workout_id = workout_id and participant_id = actor and status = 'active';
  if not found then raise exception 'joint workout participant unavailable'; end if;
  select initiator_id = actor into is_initiator from public.joint_workouts where id = workout_id;
  if is_initiator then
    update public.joint_workout_participants set status = 'declined', last_seen_at = now()
    where joint_workout_id = workout_id and status = 'invited';
  end if;
  select count(*) into remaining from public.joint_workout_participants where joint_workout_id = workout_id and status in ('active', 'invited');
  if remaining = 0 then
    update public.joint_workouts set completed_at = coalesce(completed_at, now()) where id = workout_id;
    insert into public.joint_workout_posts (joint_workout_id) values (workout_id) on conflict do nothing;
  end if;
end;
$$;

create function public.send_joint_workout_action(workout_id uuid, recipient uuid, action_input public.joint_workout_action_kind)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); action_id uuid; connection_kind public.relationship_kind;
begin
  if not exists (select 1 from public.joint_workouts where id = workout_id and completed_at is null) then raise exception 'joint workout unavailable'; end if;
  select kind into connection_kind from public.relationships where member_low = least(actor, recipient) and member_high = greatest(actor, recipient);
  if not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status in ('active', 'completed'))
    or not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = recipient and status in ('active', 'completed'))
    or not private.is_current_joint_connection(actor, recipient)
    or (action_input = 'partner_proud' and connection_kind <> 'partner') then raise exception 'joint workout action unavailable'; end if;
  insert into public.joint_workout_actions (joint_workout_id, sender_id, recipient_id, action) values (workout_id, actor, recipient, action_input) returning id into action_id;
  return action_id;
end;
$$;

create function public.list_joint_workout_actions(workout_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  if not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor) then raise exception 'joint workout unavailable'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', action.id, 'sender_id', action.sender_id, 'recipient_id', action.recipient_id, 'action', action.action, 'created_at', action.created_at) order by action.created_at desc)
    from public.joint_workout_actions action
    where action.joint_workout_id = workout_id and (action.sender_id = actor or action.recipient_id = actor)), '[]'::jsonb);
end;
$$;

create function public.list_joint_workouts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', workout.id, 'initiator_id', workout.initiator_id, 'suggested_routine', workout.suggested_routine,
    'created_at', workout.created_at, 'completed_at', workout.completed_at,
    'participants', (select jsonb_agg(jsonb_build_object('id', participant.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id, 'status', participant.status, 'visibility', participant.visibility, 'is_self', participant.participant_id = actor, 'relationship_kind', (select relationship.kind from public.relationships relationship where relationship.member_low = least(actor, participant.participant_id) and relationship.member_high = greatest(actor, participant.participant_id))) order by participant.joined_at nulls last)
      from public.joint_workout_participants participant join public.profiles profile on profile.id = participant.participant_id where participant.joint_workout_id = workout.id)
  ) order by workout.created_at desc)
  from public.joint_workouts workout where exists (select 1 from public.joint_workout_participants participant where participant.joint_workout_id = workout.id and participant.participant_id = actor) and workout.completed_at is null), '[]'::jsonb);
end;
$$;

create function public.list_joint_workout_posts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', workout.id, 'created_at', post.created_at,
    'participants', (select jsonb_agg(jsonb_build_object('id', participant.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id, 'status', participant.status) order by participant.joined_at nulls last)
      from public.joint_workout_participants participant join public.profiles profile on profile.id = participant.participant_id where participant.joint_workout_id = workout.id)) order by post.created_at desc)
  from public.joint_workout_posts post join public.joint_workouts workout on workout.id = post.joint_workout_id
  where exists (select 1 from public.joint_workout_participants participant where participant.joint_workout_id = workout.id and (participant.participant_id = actor or private.is_current_joint_connection(actor, participant.participant_id)))), '[]'::jsonb);
end;
$$;

create function public.get_joint_workout_detail(workout_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); result jsonb;
begin
  if not exists (select 1 from public.joint_workout_posts post where post.joint_workout_id = workout_id) then raise exception 'joint workout unavailable'; end if;
  if not exists (select 1 from public.joint_workout_participants participant where participant.joint_workout_id = workout_id and (participant.participant_id = actor or private.is_current_joint_connection(actor, participant.participant_id))) then raise exception 'joint workout unavailable'; end if;
  select jsonb_build_object('id', workout.id, 'suggested_routine', workout.suggested_routine, 'created_at', post.created_at, 'completed_at', workout.completed_at, 'participants', (
    select jsonb_agg(jsonb_build_object('id', participant.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id, 'status', participant.status,
      'visibility', participant.visibility, 'workout', case when private.can_view_joint_participant(actor, participant.participant_id, participant.visibility) then participant.completed_workout else null end,
      'can_invite_bro', participant.participant_id <> actor and not private.is_current_joint_connection(actor, participant.participant_id)) order by participant.joined_at nulls last)
    from public.joint_workout_participants participant join public.profiles profile on profile.id = participant.participant_id where participant.joint_workout_id = workout.id
  )) into result from public.joint_workouts workout join public.joint_workout_posts post on post.joint_workout_id = workout.id where workout.id = workout_id;
  return result;
end;
$$;

alter table public.joint_workouts enable row level security;
alter table public.joint_workout_participants enable row level security;
alter table public.joint_workout_posts enable row level security;
alter table public.joint_workout_actions enable row level security;
revoke all on public.joint_workouts, public.joint_workout_participants, public.joint_workout_posts, public.joint_workout_actions from anon, authenticated;
revoke all on function public.create_joint_workout(uuid, jsonb), public.respond_joint_workout_invite(uuid, boolean, jsonb), public.add_joint_workout_participant(uuid, uuid), public.touch_joint_workout_presence(uuid), public.finish_joint_workout(uuid, public.joint_workout_visibility, jsonb), public.send_joint_workout_action(uuid, uuid, public.joint_workout_action_kind), public.list_joint_workout_actions(uuid), public.list_joint_workouts(), public.list_joint_workout_posts(), public.get_joint_workout_detail(uuid) from public, anon;
grant execute on function public.create_joint_workout(uuid, jsonb), public.respond_joint_workout_invite(uuid, boolean, jsonb), public.add_joint_workout_participant(uuid, uuid), public.touch_joint_workout_presence(uuid), public.finish_joint_workout(uuid, public.joint_workout_visibility, jsonb), public.send_joint_workout_action(uuid, uuid, public.joint_workout_action_kind), public.list_joint_workout_actions(uuid), public.list_joint_workouts(), public.list_joint_workout_posts(), public.get_joint_workout_detail(uuid) to authenticated;
alter publication supabase_realtime add table public.joint_workout_participants;
alter publication supabase_realtime add table public.joint_workout_actions;
