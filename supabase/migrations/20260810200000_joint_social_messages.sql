-- Ephemeral, session-scoped social messages are delivered through the durable
-- notification inbox so Realtime, background push, and reconnects share one path.
create function public.send_joint_social_message(
  workout_id uuid,
  recipient uuid,
  message_input text,
  message_kind text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  relationship_kind public.relationship_kind;
  sender_alias text;
  sender_avatar_id text;
  trimmed_message text := btrim(coalesce(message_input, ''));
begin
  if workout_id is null or recipient is null or recipient = actor
    or message_kind not in ('preset', 'custom')
    or char_length(trimmed_message) not between 1 and 120 then
    raise exception 'joint social message unavailable';
  end if;

  select relationship.kind into relationship_kind
  from public.relationships relationship
  where relationship.member_low = least(actor, recipient)
    and relationship.member_high = greatest(actor, recipient);

  if relationship_kind is null
    or not exists (select 1 from public.joint_workouts where id = workout_id and completed_at is null)
    or not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'active')
    or not exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = recipient and status = 'active')
    or exists (select 1 from public.blocks block where (block.blocker_id, block.blocked_id) in ((actor, recipient), (recipient, actor))) then
    raise exception 'joint social message unavailable';
  end if;

  if message_kind = 'preset' and not (
    (relationship_kind = 'partner' and trimmed_message = any(array['Tu pareja te envía un beso 💋', '¡Vamos! Puedes hacerlo 💪', 'Te están mirando; aquí estoy 😠', 'Quiero irme 😢']))
    or (relationship_kind = 'bro' and trimmed_message = any(array['¡Una más, puedes hacerlo! 💪', 'Buen ritmo, sigue así.', 'Descansa bien y volvemos.', '¡Vamos, que sale esa serie!']))
  ) then
    raise exception 'invalid joint social message preset';
  end if;

  if exists (
    select 1 from public.notification_inbox
    where actor_id = actor and recipient_id = recipient and kind = 'joint_social_message'
      and created_at > now() - interval '3 seconds'
  ) then
    raise exception 'joint social message rate limited';
  end if;

  select alias, avatar_id into sender_alias, sender_avatar_id from public.profiles where id = actor;
  perform private.create_notification(
    recipient,
    'joint_social_message',
    coalesce(sender_alias, 'Un atleta') || ' te envió un mensaje',
    trimmed_message,
    jsonb_build_object(
      'workout_id', workout_id,
      'actor_id', actor,
      'actor_avatar_id', sender_avatar_id,
      'url', '/community/joint/' || workout_id
    ),
    null
  );
end;
$$;

revoke all on function public.send_joint_social_message(uuid, uuid, text, text) from public, anon;
grant execute on function public.send_joint_social_message(uuid, uuid, text, text) to authenticated;
