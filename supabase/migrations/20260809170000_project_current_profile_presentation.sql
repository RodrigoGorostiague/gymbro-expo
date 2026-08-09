-- Social surfaces resolve presentation from the live profile, never the historical publication.
create or replace function public.list_joint_workout_posts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', workout.id, 'created_at', post.created_at, 'completed_at', workout.completed_at,
    'participants', (select jsonb_agg(jsonb_build_object('id', participant.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id,
      'equipped_frame_id', profile.equipped_frame_id, 'equipped_title_id', profile.equipped_title_id, 'presentation_theme_id', profile.presentation_theme_id,
      'status', participant.status) order by participant.joined_at nulls last)
      from public.joint_workout_participants participant join public.profiles profile on profile.id = participant.participant_id where participant.joint_workout_id = workout.id)) order by post.created_at desc)
  from public.joint_workout_posts post join public.joint_workouts workout on workout.id = post.joint_workout_id where private.can_view_joint_post(actor, workout.id)), '[]'::jsonb);
end;
$$;

create or replace function public.get_joint_workout_detail(workout_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); result jsonb;
begin
  if not exists (select 1 from public.joint_workout_posts where joint_workout_id = workout_id) or not private.can_view_joint_post(actor, workout_id) then raise exception 'joint workout unavailable'; end if;
  select jsonb_build_object('id', workout.id, 'initiator_id', workout.initiator_id,
    'suggested_routine', case when workout.initiator_id = actor then workout.suggested_routine else null end,
    'created_at', post.created_at, 'completed_at', workout.completed_at, 'participants', (
    select jsonb_agg(jsonb_build_object('id', participant.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id,
      'equipped_frame_id', profile.equipped_frame_id, 'equipped_title_id', profile.equipped_title_id, 'presentation_theme_id', profile.presentation_theme_id,
      'status', participant.status, 'visibility', participant.visibility,
      'relationship_kind', (select relationship.kind from public.relationships relationship where relationship.member_low = least(actor, participant.participant_id) and relationship.member_high = greatest(actor, participant.participant_id)),
      'workout', case when participant.status = 'completed' and private.can_view_joint_participant(actor, participant.participant_id, participant.visibility) then participant.completed_workout - 'sharePayload' else null end,
      'share_payload', case when participant.status = 'completed' and private.can_view_joint_participant(actor, participant.participant_id, participant.visibility) then participant.completed_workout -> 'sharePayload' else null end,
      'can_invite_bro', participant.participant_id <> actor and not private.is_current_joint_connection(actor, participant.participant_id)) order by participant.joined_at nulls last)
    from public.joint_workout_participants participant join public.profiles profile on profile.id = participant.participant_id where participant.joint_workout_id = workout.id
  )) into result from public.joint_workouts workout join public.joint_workout_posts post on post.joint_workout_id = workout.id where workout.id = workout_id;
  return result;
end;
$$;

create or replace function public.list_joint_workouts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', workout.id, 'initiator_id', workout.initiator_id, 'suggested_routine', null,
    'created_at', workout.created_at, 'completed_at', workout.completed_at, 'participants', (
      select jsonb_agg(jsonb_build_object('id', participant.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id,
        'equipped_frame_id', profile.equipped_frame_id, 'equipped_title_id', profile.equipped_title_id, 'presentation_theme_id', profile.presentation_theme_id,
        'status', participant.status, 'visibility', 'circle', 'is_self', participant.participant_id = actor,
        'relationship_kind', (select relationship.kind from public.relationships relationship where relationship.member_low = least(actor, participant.participant_id) and relationship.member_high = greatest(actor, participant.participant_id))
      ) order by participant.joined_at nulls last)
      from public.joint_workout_participants participant join public.profiles profile on profile.id = participant.participant_id where participant.joint_workout_id = workout.id)
  ) order by workout.created_at desc)
  from public.joint_workouts workout where workout.completed_at is null and exists (select 1 from public.joint_workout_participants participant where participant.joint_workout_id = workout.id and participant.participant_id = actor)), '[]'::jsonb);
end;
$$;

create or replace function public.list_workout_recaps(cursor text default null, page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); bounded_size integer := least(greatest(coalesce(page_size, 20), 1), 50); decoded jsonb; cursor_created_at timestamptz; cursor_id uuid; fetched record; recaps jsonb := '[]'::jsonb; row_count integer := 0; last_created_at timestamptz; last_id uuid;
begin
  if cursor is not null then begin decoded := convert_from(decode(cursor, 'base64'), 'UTF8')::jsonb; cursor_created_at := (decoded ->> 'c')::timestamptz; cursor_id := (decoded ->> 'i')::uuid; if cursor_created_at is null or cursor_id is null then raise exception 'invalid cursor'; end if; exception when others then raise exception 'invalid cursor'; end; end if;
  for fetched in select recap.id, recap.author_id, profile.alias, profile.avatar_id, profile.equipped_frame_id, profile.equipped_title_id, profile.presentation_theme_id, recap.routine_name, recap.completed_at, recap.duration_seconds, recap.exercise_count, recap.metrics, recap.caption, recap.created_at,
    coalesce((select array_agg(distinct muscle.value #>> '{}' order by muscle.value #>> '{}') from jsonb_array_elements(coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb)) exercise(value) cross join lateral jsonb_array_elements(coalesce(exercise.value -> 'muscle_group_ids', '[]'::jsonb)) muscle(value)), '{}'::text[]) muscle_group_ids,
    coalesce((select jsonb_agg(jsonb_build_object('id', distribution.id, 'value', distribution.exercise_count) order by distribution.id) from (select muscle.id, count(*)::integer as exercise_count from jsonb_array_elements(coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb)) exercise(value) cross join lateral (select distinct value #>> '{}' as id from jsonb_array_elements(coalesce(exercise.value -> 'muscle_group_ids', '[]'::jsonb))) muscle group by muscle.id) distribution), '[]'::jsonb) muscle_distribution,
    (select count(*)::integer from public.workout_recap_comments comment where comment.recap_id = recap.id) comment_count,
    recap.share_payload ? 'routine' template_available, recap.share_payload ? 'mesocycle' mesocycle_available, recap.author_id = actor is_author
    from public.workout_recaps recap join public.profiles profile on profile.id = recap.author_id
    where recap.deleted_at is null and private.is_recap_viewer(actor, recap.author_id) and (cursor_id is null or (recap.created_at, recap.id) < (cursor_created_at, cursor_id)) order by recap.created_at desc, recap.id desc limit bounded_size + 1
  loop
    row_count := row_count + 1;
    if row_count <= bounded_size then recaps := recaps || jsonb_build_object('id', fetched.id, 'author_profile_id', fetched.author_id, 'author_alias', fetched.alias, 'author_avatar_id', fetched.avatar_id, 'author_frame_id', fetched.equipped_frame_id, 'author_title_id', fetched.equipped_title_id, 'author_theme_id', fetched.presentation_theme_id, 'routine_name', fetched.routine_name, 'completed_at', fetched.completed_at, 'duration_seconds', fetched.duration_seconds, 'exercise_count', fetched.exercise_count, 'muscle_group_ids', fetched.muscle_group_ids, 'muscle_distribution', fetched.muscle_distribution, 'comment_count', fetched.comment_count, 'metrics', fetched.metrics, 'caption', fetched.caption, 'created_at', fetched.created_at, 'template_available', fetched.template_available, 'mesocycle_available', fetched.mesocycle_available, 'is_author', fetched.is_author); last_created_at := fetched.created_at; last_id := fetched.id; end if;
  end loop;
  return jsonb_build_object('recaps', recaps, 'next_cursor', case when row_count > bounded_size then encode(convert_to(jsonb_build_object('c', last_created_at, 'i', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;

create or replace function public.get_workout_recap_detail(recap_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); recap public.workout_recaps%rowtype; result jsonb;
begin
  recap := private.require_recap_engagement(recap_id);
  select jsonb_build_object('id', recap.id, 'author_profile_id', recap.author_id, 'author_alias', profile.alias, 'author_avatar_id', profile.avatar_id, 'author_frame_id', profile.equipped_frame_id, 'author_title_id', profile.equipped_title_id, 'author_theme_id', profile.presentation_theme_id, 'routine_name', recap.routine_name, 'completed_at', recap.completed_at, 'duration_seconds', recap.duration_seconds, 'exercise_count', recap.exercise_count, 'muscle_group_ids', coalesce((select array_agg(distinct muscle.value #>> '{}' order by muscle.value #>> '{}') from jsonb_array_elements(coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb)) exercise(value) cross join lateral jsonb_array_elements(coalesce(exercise.value -> 'muscle_group_ids', '[]'::jsonb)) muscle(value)), '{}'::text[]), 'metrics', recap.metrics, 'caption', recap.caption, 'created_at', recap.created_at, 'exercises', coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb), 'template_available', recap.share_payload ? 'routine', 'mesocycle_available', recap.share_payload ? 'mesocycle', 'is_author', recap.author_id = actor, 'share_payload', recap.share_payload, 'reaction_count', (select count(*) from public.workout_recap_reactions reaction where reaction.recap_id = recap.id), 'viewer_has_reacted', exists (select 1 from public.workout_recap_reactions reaction where reaction.recap_id = recap.id and reaction.actor_id = actor), 'comments', coalesce((select jsonb_agg(private.workout_recap_comment_projection(comment_row) order by comment_row.created_at, comment_row.id) from (select * from public.workout_recap_comments where workout_recap_comments.recap_id = recap.id order by workout_recap_comments.created_at desc, workout_recap_comments.id desc limit 50) comment_row), '[]'::jsonb), 'previous_comparable', (select jsonb_build_object('id', prior.id, 'completed_at', prior.completed_at, 'duration_seconds', prior.duration_seconds, 'exercise_count', prior.exercise_count, 'metrics', prior.metrics) from public.workout_recaps prior where prior.author_id = recap.author_id and prior.routine_name = recap.routine_name and prior.completed_at < recap.completed_at and prior.deleted_at is null and private.is_recap_viewer(actor, prior.author_id) order by prior.completed_at desc, prior.id desc limit 1)) into result from public.profiles profile where profile.id = recap.author_id;
  return result;
end;
$$;

create or replace function public.list_community_activities(cursor text default null, page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); bounded_size integer := least(greatest(coalesce(page_size, 20), 1), 50); decoded jsonb; cursor_created_at timestamptz; cursor_id uuid; fetched record; activities jsonb := '[]'::jsonb; row_count integer := 0; last_created_at timestamptz; last_id uuid;
begin
  if cursor is not null then begin decoded := convert_from(decode(cursor, 'base64'), 'UTF8')::jsonb; cursor_created_at := (decoded ->> 'c')::timestamptz; cursor_id := (decoded ->> 'i')::uuid; if cursor_created_at is null or cursor_id is null then raise exception 'invalid cursor'; end if; exception when others then raise exception 'invalid cursor'; end; end if;
  for fetched in select activity.id, activity.kind, activity.payload, activity.created_at, profile.alias, profile.avatar_id, profile.equipped_frame_id, profile.equipped_title_id, profile.presentation_theme_id from public.community_activities activity join public.profiles profile on profile.id = activity.author_id where private.is_recap_viewer(actor, activity.author_id) and (cursor_id is null or (activity.created_at, activity.id) < (cursor_created_at, cursor_id)) order by activity.created_at desc, activity.id desc limit bounded_size + 1 loop
    row_count := row_count + 1;
    if row_count <= bounded_size then activities := activities || jsonb_build_object('id', fetched.id, 'kind', fetched.kind, 'author_alias', fetched.alias, 'author_avatar_id', fetched.avatar_id, 'author_frame_id', fetched.equipped_frame_id, 'author_title_id', fetched.equipped_title_id, 'author_theme_id', fetched.presentation_theme_id, 'payload', fetched.payload, 'created_at', fetched.created_at); last_created_at := fetched.created_at; last_id := fetched.id; end if;
  end loop;
  return jsonb_build_object('activities', activities, 'next_cursor', case when row_count > bounded_size then encode(convert_to(jsonb_build_object('c', last_created_at, 'i', last_id)::text, 'UTF8'), 'base64') else null end);
end;
$$;

create or replace function public.list_workout_start_activities()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', activity.id, 'author_alias', profile.alias, 'author_avatar_id', profile.avatar_id, 'author_frame_id', profile.equipped_frame_id, 'author_title_id', profile.equipped_title_id, 'author_theme_id', profile.presentation_theme_id, 'routine_name', activity.routine_name, 'joint_workout_id', activity.joint_workout_id, 'started_at', activity.started_at, 'expires_at', activity.expires_at, 'is_author', activity.author_id = actor) order by activity.started_at desc) from public.workout_start_activities activity join public.profiles profile on profile.id = activity.author_id where activity.closed_at is null and activity.expires_at > now() and private.can_view_workout_start_activity(actor, activity.author_id)), '[]'::jsonb);
end;
$$;

create or replace function public.list_received_private_plan_share_requests()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', request.id, 'senderAlias', profile.alias, 'senderAvatarId', profile.avatar_id, 'senderFrameId', profile.equipped_frame_id, 'senderTitleId', profile.equipped_title_id, 'senderThemeId', profile.presentation_theme_id, 'contentKind', request.content_kind, 'snapshot', request.snapshot, 'createdAt', request.created_at) order by request.created_at desc), '[]'::jsonb)
  from public.private_plan_share_requests request join public.profiles profile on profile.id = request.sender_id
  where request.recipient_id = public.require_actor() and request.status = 'pending'
$$;

create or replace function public.list_active_workout_invite_candidates()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); actor_joint_workout_id uuid;
begin
  select joint_workout_id into actor_joint_workout_id from private.active_workout_activity(actor);
  if not found then raise exception 'active workout required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', activity.author_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id, 'equipped_frame_id', profile.equipped_frame_id, 'equipped_title_id', profile.equipped_title_id, 'presentation_theme_id', profile.presentation_theme_id, 'relationship_kind', relationship.kind, 'group_member_count', coalesce(source_group.active_count, 1)) order by activity.started_at desc, profile.alias) from public.workout_start_activities activity join public.profiles profile on profile.id = activity.author_id join public.relationships relationship on (relationship.member_low = least(actor, activity.author_id) and relationship.member_high = greatest(actor, activity.author_id)) left join lateral (select count(*)::integer as member_count from public.joint_workout_participants participant where participant.joint_workout_id = actor_joint_workout_id and participant.status <> 'declined') target_group on true left join lateral (select count(*)::integer as active_count from public.joint_workout_participants participant where participant.joint_workout_id = activity.joint_workout_id and participant.status = 'active') source_group on true where activity.author_id <> actor and activity.closed_at is null and activity.expires_at > now() and private.is_current_joint_connection(actor, activity.author_id) and not exists (select 1 from public.joint_workout_participants current_participant where current_participant.joint_workout_id = actor_joint_workout_id and current_participant.participant_id = activity.author_id) and coalesce(target_group.member_count, 1) + coalesce(source_group.active_count, 1) <= 4), '[]'::jsonb);
end;
$$;

create or replace function private.notify_joint_workout_response()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_alias text; actor_avatar_id text; actor_frame_id text; response text; recipient_id uuid;
begin
  if tg_op <> 'UPDATE' or old.status <> 'invited' or new.status not in ('active', 'declined') then return new; end if;
  select alias, avatar_id, equipped_frame_id into actor_alias, actor_avatar_id, actor_frame_id from public.profiles where id = new.participant_id;
  response := case when new.status = 'active' then 'aceptó tu invitación.' else 'rechazó tu invitación.' end;
  for recipient_id in select participant.participant_id from public.joint_workout_participants participant where participant.joint_workout_id = new.joint_workout_id and participant.participant_id <> new.participant_id and participant.status = 'active' loop
    perform private.create_notification(recipient_id, 'joint_workout_' || new.status::text, coalesce(actor_alias, 'Tu conexión') || ' ' || response, case when new.status = 'active' then 'Ya están entrenando juntos.' else 'Podés seguir entrenando y enviar otra invitación.' end, jsonb_build_object('url', '/community/joint-workout', 'workout_id', new.joint_workout_id, 'actor_avatar_id', actor_avatar_id, 'actor_frame_id', actor_frame_id), 'joint-workout-response:' || new.joint_workout_id || ':' || new.participant_id || ':' || new.status::text);
  end loop;
  return new;
end;
$$;

create or replace function private.notify_circle_workout_start()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_alias text; actor_avatar_id text; actor_frame_id text; recipient_id uuid;
begin
  if new.closed_at is not null or new.expires_at <= now() then return new; end if;
  select alias, avatar_id, equipped_frame_id into actor_alias, actor_avatar_id, actor_frame_id from public.profiles where id = new.author_id;
  for recipient_id in select profile.id from public.profiles profile where profile.id <> new.author_id and private.is_current_joint_connection(profile.id, new.author_id) and exists (select 1 from private.active_workout_activity(profile.id)) loop
    perform private.create_notification(recipient_id, 'circle_workout_started', coalesce(actor_alias, 'Tu conexión') || ' empezó a entrenar', new.routine_name || ' está en curso. ¿Te sumás?', jsonb_build_object('actor_id', new.author_id, 'actor_avatar_id', actor_avatar_id, 'actor_frame_id', actor_frame_id, 'activity_id', new.id, 'expires_at', new.expires_at, 'url', '/community/joint-workout'), 'circle-workout-start:' || new.id);
  end loop;
  return new;
end;
$$;
