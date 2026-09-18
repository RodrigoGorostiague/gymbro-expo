-- Private live-workout chat: a row is visible only to its sender and explicitly mentioned participants.
create table public.joint_workout_chat_messages (
  id uuid primary key default gen_random_uuid(),
  joint_workout_id uuid not null references public.joint_workouts(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table public.joint_workout_chat_mentions (
  message_id uuid not null references public.joint_workout_chat_messages(id) on delete cascade,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  primary key (message_id, participant_id)
);

create index joint_workout_chat_messages_workout_created_at
  on public.joint_workout_chat_messages (joint_workout_id, created_at, id);
create index joint_workout_chat_mentions_participant
  on public.joint_workout_chat_mentions (participant_id, message_id);

alter table public.joint_workout_chat_messages enable row level security;
alter table public.joint_workout_chat_mentions enable row level security;
revoke all on public.joint_workout_chat_messages, public.joint_workout_chat_mentions from anon, authenticated;

create function private.can_view_joint_workout_chat_message(viewer uuid, chat_message_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.joint_workout_chat_messages message
    where message.id = chat_message_id and (message.sender_id = viewer or exists (
      select 1 from public.joint_workout_chat_mentions mention
      where mention.message_id = message.id and mention.participant_id = viewer
    ))
  )
$$;

create policy "chat messages are visible to senders and mentioned participants"
  on public.joint_workout_chat_messages for select to authenticated
  using (private.can_view_joint_workout_chat_message(auth.uid(), id));

create policy "chat mentions are visible with their private message"
  on public.joint_workout_chat_mentions for select to authenticated
  using (private.can_view_joint_workout_chat_message(auth.uid(), message_id));

create function public.list_joint_workout_chat_messages(workout_id uuid)
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
      and (message.sender_id = actor or exists (select 1 from public.joint_workout_chat_mentions mention where mention.message_id = message.id and mention.participant_id = actor))
  ), '[]'::jsonb);
end;
$$;

create function public.send_joint_workout_chat_message(
  workout_id uuid,
  message_input text,
  mentioned_participant_ids uuid[]
) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); message_id uuid; trimmed_message text := btrim(coalesce(message_input, ''));
begin
  if workout_id is null or char_length(trimmed_message) not between 1 and 500
    or mentioned_participant_ids is null or cardinality(mentioned_participant_ids) < 1
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

revoke all on function public.list_joint_workout_chat_messages(uuid), public.send_joint_workout_chat_message(uuid, text, uuid[]) from public, anon;
grant execute on function public.list_joint_workout_chat_messages(uuid), public.send_joint_workout_chat_message(uuid, text, uuid[]) to authenticated;

-- Superseded by the private chat table. Existing durable notifications remain historical inbox records.
revoke execute on function public.send_joint_social_message(uuid, uuid, text, text) from authenticated;
alter publication supabase_realtime add table public.joint_workout_chat_messages;
