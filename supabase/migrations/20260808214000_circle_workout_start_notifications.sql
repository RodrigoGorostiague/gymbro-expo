-- Repair the response producer and notify only live Circle members about a workout start.
create or replace function private.notify_joint_workout_response()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor_alias text;
  actor_avatar_id text;
  response text;
  recipient_id uuid;
begin
  if tg_op <> 'UPDATE' or old.status <> 'invited' or new.status not in ('active', 'declined') then return new; end if;

  select alias, avatar_id into actor_alias, actor_avatar_id
  from public.profiles where id = new.participant_id;
  response := case when new.status = 'active' then 'aceptó tu invitación.' else 'rechazó tu invitación.' end;

  for recipient_id in
    select participant.participant_id
    from public.joint_workout_participants participant
    where participant.joint_workout_id = new.joint_workout_id
      and participant.participant_id <> new.participant_id
      and participant.status = 'active'
  loop
    perform private.create_notification(
      recipient_id,
      'joint_workout_' || new.status::text,
      coalesce(actor_alias, 'Tu conexión') || ' ' || response,
      case when new.status = 'active' then 'Ya están entrenando juntos.' else 'Podés seguir entrenando y enviar otra invitación.' end,
      jsonb_build_object(
        'url', '/community/joint-workout',
        'workout_id', new.joint_workout_id,
        'actor_avatar_id', actor_avatar_id
      ),
      'joint-workout-response:' || new.joint_workout_id || ':' || new.participant_id || ':' || new.status::text
    );
  end loop;
  return new;
end;
$$;

create or replace function private.notify_circle_workout_start()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor_alias text;
  actor_avatar_id text;
  recipient_id uuid;
begin
  if new.closed_at is not null or new.expires_at <= now() then return new; end if;

  select alias, avatar_id into actor_alias, actor_avatar_id
  from public.profiles where id = new.author_id;

  for recipient_id in
    select profile.id
    from public.profiles profile
    where profile.id <> new.author_id
      and private.is_current_joint_connection(profile.id, new.author_id)
      and exists (select 1 from private.active_workout_activity(profile.id))
  loop
    perform private.create_notification(
      recipient_id,
      'circle_workout_started',
      coalesce(actor_alias, 'Tu conexión') || ' empezó a entrenar',
      new.routine_name || ' está en curso. ¿Te sumás?',
      jsonb_build_object(
        'actor_id', new.author_id,
        'actor_avatar_id', actor_avatar_id,
        'activity_id', new.id,
        'expires_at', new.expires_at,
        'url', '/community/joint-workout'
      ),
      'circle-workout-start:' || new.id
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists circle_workout_start_notification on public.workout_start_activities;
create trigger circle_workout_start_notification
after insert on public.workout_start_activities
for each row execute function private.notify_circle_workout_start();

revoke all on function private.notify_joint_workout_response() from public, anon, authenticated;
revoke all on function private.notify_circle_workout_start() from public, anon, authenticated;
