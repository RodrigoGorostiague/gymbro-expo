-- A message without explicit mentions is visible to every participant in its workout.
create or replace function private.can_view_joint_workout_chat_message(viewer uuid, chat_message_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.joint_workout_chat_messages message
    where message.id = chat_message_id
      and (
        message.sender_id = viewer
        or exists (
          select 1 from public.joint_workout_chat_mentions mention
          where mention.message_id = message.id and mention.participant_id = viewer
        )
        or (
          not exists (
            select 1 from public.joint_workout_chat_mentions mention
            where mention.message_id = message.id
          )
          and exists (
            select 1 from public.joint_workout_participants participant
            where participant.joint_workout_id = message.joint_workout_id
              and participant.participant_id = viewer
          )
        )
      )
  )
$$;

create or replace function public.list_joint_workout_chat_messages(workout_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  if not exists (
    select 1 from public.joint_workout_participants participant
    where participant.joint_workout_id = workout_id and participant.participant_id = actor
  ) then raise exception 'joint workout chat unavailable'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', message.id, 'sender_id', message.sender_id, 'sender_alias', profile.alias,
      'sender_avatar_id', profile.avatar_id, 'body', message.body, 'created_at', message.created_at,
      'mentioned_participant_ids', (select coalesce(jsonb_agg(mention.participant_id order by mention.participant_id), '[]'::jsonb) from public.joint_workout_chat_mentions mention where mention.message_id = message.id)
    ) order by message.created_at, message.id)
    from public.joint_workout_chat_messages message
    join public.profiles profile on profile.id = message.sender_id
    where message.joint_workout_id = workout_id
      and (
        message.sender_id = actor
        or exists (select 1 from public.joint_workout_chat_mentions mention where mention.message_id = message.id and mention.participant_id = actor)
        or (
          not exists (select 1 from public.joint_workout_chat_mentions mention where mention.message_id = message.id)
          and exists (select 1 from public.joint_workout_participants participant where participant.joint_workout_id = workout_id and participant.participant_id = actor)
        )
      )
  ), '[]'::jsonb);
end;
$$;

create or replace function public.send_joint_workout_chat_message(
  workout_id uuid,
  message_input text,
  mentioned_participant_ids uuid[]
) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); message_id uuid; trimmed_message text := btrim(coalesce(message_input, ''));
begin
  if workout_id is null or char_length(trimmed_message) not between 1 and 500
    or mentioned_participant_ids is null
    or cardinality(mentioned_participant_ids) <> cardinality(array(select distinct value from unnest(mentioned_participant_ids) value))
    or actor = any(mentioned_participant_ids) then raise exception 'joint workout chat unavailable'; end if;

  if not exists (select 1 from public.joint_workouts where id = workout_id and completed_at is null)
    or not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'active')
    or exists (
      select 1 from unnest(mentioned_participant_ids) recipient
      where not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = recipient and status = 'active')
        or exists (select 1 from public.blocks block where (block.blocker_id, block.blocked_id) in ((actor, recipient), (recipient, actor)))
    ) then raise exception 'joint workout chat unavailable'; end if;

  insert into public.joint_workout_chat_messages (joint_workout_id, sender_id, body)
  values (workout_id, actor, trimmed_message) returning id into message_id;
  insert into public.joint_workout_chat_mentions (message_id, participant_id)
  select message_id, recipient from unnest(mentioned_participant_ids) recipient;

  perform private.create_notification(recipient, 'joint_workout_chat_mention',
    (select alias from public.profiles where id = actor) || ' te mencionó en el entrenamiento conjunto',
    trimmed_message, jsonb_build_object('workout_id', workout_id, 'message_id', message_id, 'actor_id', actor, 'url', '/community/joint/' || workout_id), null)
  from unnest(mentioned_participant_ids) recipient;
end;
$$;
