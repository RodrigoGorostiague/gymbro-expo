-- Presence is part of a workout's terminal state, not a best-effort client side effect.
create or replace function public.finish_joint_workout(workout_id uuid, visibility_input public.joint_workout_visibility, completed_workout_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); remaining integer; affected integer; is_initiator boolean;
begin
  if not private.is_valid_joint_completed_workout(completed_workout_input) then raise exception 'invalid joint completed workout'; end if;
  update public.joint_workout_participants set status = 'completed', visibility = visibility_input,
    completed_workout = completed_workout_input, finished_at = now(), last_seen_at = now()
  where joint_workout_id = workout_id and participant_id = actor and status = 'active';
  get diagnostics affected = row_count;
  if affected = 0 then
    if exists (select 1 from public.joint_workout_participants where joint_workout_id = workout_id and participant_id = actor and status = 'completed') then
      update public.workout_start_activities set closed_at = now() where author_id = actor and closed_at is null;
      return;
    end if;
    raise exception 'joint workout participant unavailable';
  end if;
  update public.workout_start_activities set closed_at = now() where author_id = actor and closed_at is null;
  select initiator_id = actor into is_initiator from public.joint_workouts where id = workout_id for update;
  if is_initiator then
    update public.joint_workout_participants set status = 'declined', last_seen_at = now() where joint_workout_id = workout_id and status = 'invited';
  end if;
  insert into public.joint_workout_posts (joint_workout_id) values (workout_id) on conflict do nothing;
  select count(*) into remaining from public.joint_workout_participants where joint_workout_id = workout_id and status = 'active';
  if remaining = 0 then
    update public.joint_workout_participants set status = 'declined', last_seen_at = now()
    where joint_workout_id = workout_id and status = 'invited';
    update public.joint_workouts set completed_at = coalesce(completed_at, now()) where id = workout_id;
  end if;
end;
$$;

create or replace function public.list_active_workout_invite_candidates()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); actor_joint_workout_id uuid;
begin
  select joint_workout_id into actor_joint_workout_id from private.active_workout_activity(actor);
  if not found then raise exception 'active workout required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', activity.author_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id,
      'presentation_theme_id', profile.presentation_theme_id, 'relationship_kind', relationship.kind,
      'group_member_count', coalesce(source_group.active_count, 1)
    ) order by activity.started_at desc, profile.alias)
    from public.workout_start_activities activity
    join public.profiles profile on profile.id = activity.author_id
    join public.relationships relationship on relationship.member_low = least(actor, activity.author_id) and relationship.member_high = greatest(actor, activity.author_id)
    left join lateral (
      select count(*)::integer as member_count from public.joint_workout_participants participant
      where participant.joint_workout_id = actor_joint_workout_id and participant.status <> 'declined'
    ) target_group on true
    left join lateral (
      select count(*)::integer as active_count from public.joint_workout_participants participant
      where participant.joint_workout_id = activity.joint_workout_id and participant.status = 'active'
    ) source_group on true
    where activity.author_id <> actor and activity.closed_at is null and activity.expires_at > now()
      and private.is_current_joint_connection(actor, activity.author_id)
      and (activity.joint_workout_id is null or exists (
        select 1 from public.joint_workout_participants participant
        where participant.joint_workout_id = activity.joint_workout_id
          and participant.participant_id = activity.author_id and participant.status = 'active'
      ))
      and not exists (
        select 1 from public.joint_workout_participants current_participant
        where current_participant.joint_workout_id = actor_joint_workout_id and current_participant.participant_id = activity.author_id
      )
      and coalesce(target_group.member_count, 1) + coalesce(source_group.active_count, 1) <= 4
  ), '[]'::jsonb);
end;
$$;
