alter table public.joint_workout_posts add column last_activity_at timestamptz;

update public.joint_workout_posts post
set last_activity_at = coalesce((
  select max(participant.finished_at)
  from public.joint_workout_participants participant
  where participant.joint_workout_id = post.joint_workout_id
), post.created_at);

alter table public.joint_workout_posts alter column last_activity_at set not null;
alter table public.joint_workout_posts alter column last_activity_at set default now();

create index joint_workout_posts_last_activity_page
  on public.joint_workout_posts (last_activity_at desc, joint_workout_id desc);

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
  insert into public.joint_workout_posts (joint_workout_id) values (workout_id)
  on conflict (joint_workout_id) do update set last_activity_at = excluded.last_activity_at;
  select count(*) into remaining from public.joint_workout_participants where joint_workout_id = workout_id and status = 'active';
  if remaining = 0 then
    update public.joint_workout_participants set status = 'declined', last_seen_at = now()
    where joint_workout_id = workout_id and status = 'invited';
    update public.joint_workouts set completed_at = coalesce(completed_at, now()) where id = workout_id;
  end if;
  if exists (select 1 from public.community_activities where author_id = actor and kind in ('first_joint_workout', 'joint_workout_completed')) then
    perform private.publish_community_activity(actor, 'joint_workout_completed', format('joint-workout:%s', workout_id), '{}'::jsonb);
  else
    perform private.publish_community_activity(actor, 'first_joint_workout', 'first-joint-workout', '{}'::jsonb);
  end if;
end;
$$;

create or replace function public.list_joint_workout_posts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', workout.id, 'created_at', post.created_at, 'updated_at', post.last_activity_at, 'completed_at', workout.completed_at,
    'participants', (select jsonb_agg(jsonb_build_object('id', participant.participant_id, 'alias', profile.alias, 'avatar_id', profile.avatar_id,
      'equipped_frame_id', profile.equipped_frame_id, 'equipped_title_id', profile.equipped_title_id, 'presentation_theme_id', profile.presentation_theme_id,
      'status', participant.status) order by participant.joined_at nulls last)
      from public.joint_workout_participants participant join public.profiles profile on profile.id = participant.participant_id where participant.joint_workout_id = workout.id)) order by post.last_activity_at desc, post.joint_workout_id desc)
  from public.joint_workout_posts post join public.joint_workouts workout on workout.id = post.joint_workout_id where private.can_view_joint_post(actor, workout.id)), '[]'::jsonb);
end;
$$;
