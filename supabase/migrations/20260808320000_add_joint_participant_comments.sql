create table public.joint_workout_participant_comments (
  id uuid primary key default gen_random_uuid(),
  joint_workout_id uuid not null,
  participant_id uuid not null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  foreign key (joint_workout_id, participant_id) references public.joint_workout_participants(joint_workout_id, participant_id) on delete cascade
);

create index joint_workout_participant_comments_target_created_at
on public.joint_workout_participant_comments (joint_workout_id, participant_id, created_at, id);

create function private.joint_workout_participant_comment_projection(comment_input public.joint_workout_participant_comments)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', comment_input.id,
    'author_alias', profile.alias,
    'author_avatar_id', profile.avatar_id,
    'author_theme_id', profile.presentation_theme_id,
    'body', comment_input.body,
    'created_at', comment_input.created_at,
    'is_author', comment_input.author_id = public.require_actor()
  )
  from public.profiles profile
  where profile.id = comment_input.author_id
$$;

create function public.list_joint_participant_comments(workout_id uuid, target_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  if not exists (
    select 1
    from public.joint_workout_participants participant
    where participant.joint_workout_id = workout_id
      and participant.participant_id = target_id
      and participant.status = 'completed'
      and private.can_view_joint_participant(actor, participant.participant_id, participant.visibility)
  ) then
    raise exception 'joint workout unavailable';
  end if;

  return coalesce((
    select jsonb_agg(private.joint_workout_participant_comment_projection(comment_row) order by comment_row.created_at, comment_row.id)
    from (
      select *
      from public.joint_workout_participant_comments
      where joint_workout_id = workout_id and participant_id = target_id
      order by created_at desc, id desc
      limit 50
    ) comment_row
  ), '[]'::jsonb);
end;
$$;

create function public.create_joint_participant_comment(workout_id uuid, target_id uuid, body_input text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  target public.joint_workout_participants%rowtype;
  body_value text := btrim(body_input);
  comment public.joint_workout_participant_comments%rowtype;
  actor_alias text;
begin
  if char_length(body_value) not between 1 and 500 then raise exception 'invalid joint participant comment'; end if;

  select * into target
  from public.joint_workout_participants
  where joint_workout_id = workout_id
    and participant_id = target_id
    and status = 'completed'
    and private.can_view_joint_participant(actor, participant_id, visibility);

  if not found then raise exception 'joint workout unavailable'; end if;

  insert into public.joint_workout_participant_comments (joint_workout_id, participant_id, author_id, body)
  values (workout_id, target_id, actor, body_value)
  returning * into comment;

  if target_id <> actor then
    select alias into actor_alias from public.profiles where id = actor;
    perform private.create_notification(
      target_id,
      'joint_workout_comment',
      'Nuevo comentario',
      coalesce(actor_alias, 'Un atleta') || ' comentó tu entrenamiento conjunto.',
      jsonb_build_object('url', '/community/joint/' || workout_id, 'workout_id', workout_id, 'participant_id', target_id),
      'joint-workout-comment:' || comment.id
    );
  end if;

  return private.joint_workout_participant_comment_projection(comment);
end;
$$;

create or replace function public.get_joint_participant_reaction_states(workout_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_object_agg(participant.participant_id, jsonb_build_object(
    'reaction_count', (select count(*) from public.joint_workout_participant_reactions reaction where reaction.joint_workout_id = participant.joint_workout_id and reaction.participant_id = participant.participant_id),
    'comment_count', (select count(*) from public.joint_workout_participant_comments comment where comment.joint_workout_id = participant.joint_workout_id and comment.participant_id = participant.participant_id),
    'viewer_has_reacted', exists (select 1 from public.joint_workout_participant_reactions reaction where reaction.joint_workout_id = participant.joint_workout_id and reaction.participant_id = participant.participant_id and reaction.actor_id = actor)
  )) from public.joint_workout_participants participant where participant.joint_workout_id = workout_id and participant.status = 'completed' and private.can_view_joint_participant(actor, participant.participant_id, participant.visibility)), '{}'::jsonb);
end;
$$;

create or replace function public.list_workout_recaps(cursor text default null, page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor(); bounded_size integer := least(greatest(coalesce(page_size, 20), 1), 50);
  decoded jsonb; cursor_created_at timestamptz; cursor_id uuid; fetched record;
  recaps jsonb := '[]'::jsonb; row_count integer := 0; last_created_at timestamptz; last_id uuid;
begin
  if cursor is not null then
    begin decoded := convert_from(decode(cursor, 'base64'), 'UTF8')::jsonb; cursor_created_at := (decoded ->> 'c')::timestamptz; cursor_id := (decoded ->> 'i')::uuid; if cursor_created_at is null or cursor_id is null then raise exception 'invalid cursor'; end if;
    exception when others then raise exception 'invalid cursor'; end;
  end if;
  for fetched in select recap.id, profile.alias, profile.avatar_id, profile.presentation_theme_id, recap.routine_name, recap.completed_at, recap.duration_seconds, recap.exercise_count, recap.metrics, recap.caption, recap.created_at,
    coalesce((select array_agg(distinct muscle.value #>> '{}' order by muscle.value #>> '{}') from jsonb_array_elements(coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb)) exercise(value) cross join lateral jsonb_array_elements(coalesce(exercise.value -> 'muscle_group_ids', '[]'::jsonb)) muscle(value)), '{}'::text[]) muscle_group_ids,
    coalesce((select jsonb_agg(jsonb_build_object('id', distribution.id, 'value', distribution.exercise_count) order by distribution.id) from (select muscle.id, count(*)::integer as exercise_count from jsonb_array_elements(coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb)) exercise(value) cross join lateral (select distinct value #>> '{}' as id from jsonb_array_elements(coalesce(exercise.value -> 'muscle_group_ids', '[]'::jsonb))) muscle group by muscle.id) distribution), '[]'::jsonb) muscle_distribution,
    (select count(*)::integer from public.workout_recap_comments comment where comment.recap_id = recap.id) comment_count,
    recap.share_payload ? 'routine' template_available, recap.share_payload ? 'mesocycle' mesocycle_available, recap.author_id = actor is_author
    from public.workout_recaps recap join public.profiles profile on profile.id = recap.author_id
    where recap.deleted_at is null and private.is_recap_viewer(actor, recap.author_id) and (cursor_id is null or (recap.created_at, recap.id) < (cursor_created_at, cursor_id)) order by recap.created_at desc, recap.id desc limit bounded_size + 1
  loop
    row_count := row_count + 1;
    if row_count <= bounded_size then recaps := recaps || jsonb_build_object('id', fetched.id, 'author_alias', fetched.alias, 'author_avatar_id', fetched.avatar_id, 'author_theme_id', fetched.presentation_theme_id, 'routine_name', fetched.routine_name, 'completed_at', fetched.completed_at, 'duration_seconds', fetched.duration_seconds, 'exercise_count', fetched.exercise_count, 'muscle_group_ids', fetched.muscle_group_ids, 'muscle_distribution', fetched.muscle_distribution, 'comment_count', fetched.comment_count, 'metrics', fetched.metrics, 'caption', fetched.caption, 'created_at', fetched.created_at, 'template_available', fetched.template_available, 'mesocycle_available', fetched.mesocycle_available, 'is_author', fetched.is_author); last_created_at := fetched.created_at; last_id := fetched.id; end if;
  end loop;
  return jsonb_build_object('recaps', recaps, 'next_cursor', case when row_count > bounded_size then encode(convert_to(jsonb_build_object('c', last_created_at, 'i', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;

alter table public.joint_workout_participant_comments enable row level security;
revoke all on public.joint_workout_participant_comments from anon, authenticated;
revoke all on function private.joint_workout_participant_comment_projection(public.joint_workout_participant_comments) from public, anon, authenticated;
revoke all on function public.list_joint_participant_comments(uuid, uuid), public.create_joint_participant_comment(uuid, uuid, text) from public, anon;
grant execute on function public.list_joint_participant_comments(uuid, uuid), public.create_joint_participant_comment(uuid, uuid, text) to authenticated;
