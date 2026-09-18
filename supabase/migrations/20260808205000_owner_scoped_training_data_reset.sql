-- Owner-scoped clean slate. Wallets, reward/XP ledgers, profiles, social graph,
-- device tokens, body metrics, and the standardized catalog are intentionally untouched.

create function public.preview_training_data_reset()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
begin
  return jsonb_build_object(
    'routines', coalesce((select jsonb_array_length(routines) from public.training_libraries where owner_id = actor), 0),
    'mesocycles', coalesce((select jsonb_array_length(mesocycles) from public.training_libraries where owner_id = actor), 0),
    'attempts', coalesce((select jsonb_array_length(attempts) from public.training_states where owner_id = actor), 0),
    'sessions', coalesce((select jsonb_array_length(sessions) from public.training_states where owner_id = actor), 0),
    'active_workout_draft', exists (select 1 from public.training_states where owner_id = actor and active_workout_draft is not null),
    'workout_recaps', (select count(*) from public.workout_recaps where author_id = actor),
    'recap_reactions', (select count(*) from public.workout_recap_reactions where actor_id = actor),
    'recap_comments', (select count(*) from public.workout_recap_comments where author_id = actor),
    'recap_notifications', (select count(*) from public.notification_inbox where kind in ('workout_recap_reaction', 'workout_recap_comment') and (recipient_id = actor or actor_id = actor)),
    'workout_start_activities', (select count(*) from public.workout_start_activities where author_id = actor),
    'joint_workouts_initiated', (select count(*) from public.joint_workouts where initiator_id = actor),
    'joint_workout_participations', (select count(*) from public.joint_workout_participants where participant_id = actor)
  );
end;
$$;

create function public.export_training_data_reset_backup()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
begin
  return jsonb_build_object(
    'owner_id', actor,
    'exported_at', now(),
    'preview', public.preview_training_data_reset(),
    'training_library', coalesce((select jsonb_build_object('routines', routines, 'mesocycles', mesocycles) from public.training_libraries where owner_id = actor), '{}'::jsonb),
    'training_state', coalesce((select jsonb_build_object('attempts', attempts, 'sessions', sessions, 'active_workout_draft', active_workout_draft) from public.training_states where owner_id = actor), '{}'::jsonb),
    'workout_recaps', coalesce((select jsonb_agg(to_jsonb(recap) order by recap.created_at, recap.id) from public.workout_recaps recap where recap.author_id = actor), '[]'::jsonb),
    'joint_workout_ids', coalesce((select jsonb_agg(distinct participant.joint_workout_id) from public.joint_workout_participants participant where participant.participant_id = actor), '[]'::jsonb)
  );
end;
$$;

create function public.reset_training_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
  actor_joint_ids uuid[];
begin
  select coalesce(array_agg(participant.joint_workout_id), '{}'::uuid[])
  into actor_joint_ids
  from public.joint_workout_participants participant
  where participant.participant_id = actor;

  -- These notifications are training-specific: either they belong to the actor,
  -- were caused by the actor, or point to a recap that is about to be deleted.
  delete from public.notification_inbox notification
  where notification.kind in ('workout_recap_reaction', 'workout_recap_comment')
    and (
      notification.recipient_id = actor
      or notification.actor_id = actor
      or exists (
        select 1 from public.workout_recaps recap
        where recap.id::text = replace(notification.data ->> 'url', '/social/recap/', '')
          and recap.author_id = actor
      )
    );

  delete from public.workout_start_activities where author_id = actor;
  delete from public.workout_recap_reactions where actor_id = actor;
  delete from public.workout_recap_comments where author_id = actor;
  delete from public.workout_recaps where author_id = actor;

  -- An initiator-owned workout cannot survive without its initiator. For a
  -- peer-owned workout, remove only this actor and its public post involvement.
  delete from public.joint_workout_posts where joint_workout_id = any(actor_joint_ids);
  delete from public.joint_workouts where initiator_id = actor;
  if to_regclass('public.joint_workout_actions') is not null then
    execute 'delete from public.joint_workout_actions where sender_id = $1 or recipient_id = $1' using actor;
  end if;
  delete from public.joint_workout_participants where participant_id = actor;
  delete from public.joint_workouts workout
  where not exists (
    select 1 from public.joint_workout_participants participant
    where participant.joint_workout_id = workout.id
  );

  update public.training_libraries
  set routines = '[]'::jsonb, mesocycles = '[]'::jsonb, updated_at = now()
  where owner_id = actor
    and (routines <> '[]'::jsonb or mesocycles <> '[]'::jsonb);

  -- Custom definitions are deliberately retained. They are the only mutable
  -- training-state data that survives a clean slate.
  update public.training_states
  set attempts = '[]'::jsonb, sessions = '[]'::jsonb, active_workout_draft = null, updated_at = now()
  where owner_id = actor
    and (attempts <> '[]'::jsonb or sessions <> '[]'::jsonb or active_workout_draft is not null);

  return public.preview_training_data_reset();
end;
$$;

revoke all on function public.preview_training_data_reset(), public.export_training_data_reset_backup(), public.reset_training_data() from public, anon;
grant execute on function public.preview_training_data_reset(), public.export_training_data_reset_backup(), public.reset_training_data() to authenticated;
