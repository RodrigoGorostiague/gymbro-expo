-- Notifications are created by database events so the inbox stays correct even
-- when the recipient has no active client subscription.
create function private.notify_relationship_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare sender_alias text;
begin
  select alias into sender_alias from public.profiles where id = new.requester_id;
  perform private.create_notification(
    new.recipient_id,
    'relationship_request',
    'Nueva solicitud',
    coalesce(sender_alias, 'Un atleta') || ' quiere conectar contigo.',
    jsonb_build_object('url', '/community/requests'),
    'relationship-request:' || new.requester_id || ':' || new.recipient_id
  );
  return new;
end;
$$;

create trigger relationship_requests_notify_recipient
after insert on public.relationship_requests
for each row execute function private.notify_relationship_request();

create function private.notify_private_plan_share()
returns trigger language plpgsql security definer set search_path = '' as $$
declare sender_alias text;
begin
  select alias into sender_alias from public.profiles where id = new.sender_id;
  perform private.create_notification(
    new.recipient_id,
    'plan_share_received',
    'Plan recibido',
    coalesce(sender_alias, 'Un atleta') || ' te envió un plan para revisar.',
    jsonb_build_object('url', '/community/plan-inbox'),
    'plan-share:' || new.id
  );
  return new;
end;
$$;

create trigger private_plan_share_requests_notify_recipient
after insert on public.private_plan_share_requests
for each row execute function private.notify_private_plan_share();

create function private.notify_private_plan_response()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient_alias text;
begin
  if old.status = 'pending' and new.status = 'accepted' then
    select alias into recipient_alias from public.profiles where id = new.recipient_id;
    perform private.create_notification(
      new.sender_id,
      'plan_share_accepted',
      'Plan agregado',
      coalesce(recipient_alias, 'Tu conexión') || ' agregó tu plan a su biblioteca.',
      jsonb_build_object('url', '/community/plan-inbox'),
      'plan-share-accepted:' || new.id
    );
  end if;
  return new;
end;
$$;

create trigger private_plan_share_requests_notify_response
after update of status on public.private_plan_share_requests
for each row execute function private.notify_private_plan_response();

create function private.notify_joint_workout_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare initiator_alias text;
begin
  if new.status <> 'invited' then return new; end if;
  select profile.alias into initiator_alias
  from public.joint_workouts workout join public.profiles profile on profile.id = workout.initiator_id
  where workout.id = new.joint_workout_id;
  perform private.create_notification(
    new.participant_id,
    'joint_workout_invite',
    'Invitación para entrenar',
    coalesce(initiator_alias, 'Tu conexión') || ' te invitó a entrenar juntos.',
    jsonb_build_object('url', '/community/joint-workout'),
    'joint-workout-invite:' || new.joint_workout_id || ':' || new.participant_id
  );
  return new;
end;
$$;

create trigger joint_workout_participants_notify_invite
after insert on public.joint_workout_participants
for each row execute function private.notify_joint_workout_invite();

create function private.notify_joint_workout_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare finisher_alias text; member record;
begin
  if old.status <> 'active' or new.status <> 'completed' then return new; end if;
  select alias into finisher_alias from public.profiles where id = new.participant_id;
  for member in
    select participant_id from public.joint_workout_participants
    where joint_workout_id = new.joint_workout_id and participant_id <> new.participant_id
  loop
    if private.is_current_joint_connection(member.participant_id, new.participant_id) then
      perform private.create_notification(
        member.participant_id,
        'joint_workout_completed',
        'Entrenamiento terminado',
        coalesce(finisher_alias, 'Tu conexión') || ' terminó su entrenamiento conjunto.',
        jsonb_build_object('url', '/community/joint/' || new.joint_workout_id),
        'joint-workout-completed:' || new.joint_workout_id || ':' || new.participant_id
      );
    end if;
  end loop;
  return new;
end;
$$;

create trigger joint_workout_participants_notify_completion
after update of status on public.joint_workout_participants
for each row execute function private.notify_joint_workout_completion();

create function private.notify_workout_recap()
returns trigger language plpgsql security definer set search_path = '' as $$
declare author_alias text; member record;
begin
  select alias into author_alias from public.profiles where id = new.author_id;
  for member in
    select case when relationship.member_low = new.author_id then relationship.member_high else relationship.member_low end as profile_id
    from public.relationships relationship
    where new.author_id in (relationship.member_low, relationship.member_high)
  loop
    if private.is_recap_viewer(member.profile_id, new.author_id) then
      perform private.create_notification(
        member.profile_id,
        'community_workout_recap',
        'Entrenamiento en tu círculo',
        coalesce(author_alias, 'Tu conexión') || ' terminó ' || new.routine_name || '.',
        jsonb_build_object('url', '/social/recap/' || new.id),
        'workout-recap:' || new.id || ':' || member.profile_id
      );
    end if;
  end loop;
  return new;
end;
$$;

create trigger workout_recaps_notify_circle
after insert on public.workout_recaps
for each row execute function private.notify_workout_recap();

revoke all on function private.notify_relationship_request(), private.notify_private_plan_share(), private.notify_private_plan_response(), private.notify_joint_workout_invite(), private.notify_joint_workout_completion(), private.notify_workout_recap() from public, anon, authenticated;
