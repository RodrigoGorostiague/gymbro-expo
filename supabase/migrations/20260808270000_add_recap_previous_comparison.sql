-- Comparison is limited to a recap already visible to the same viewer.
create or replace function public.get_workout_recap_detail(recap_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); recap public.workout_recaps%rowtype; result jsonb;
begin
  recap := private.require_recap_engagement(recap_id);
  select jsonb_build_object(
    'id', recap.id, 'author_alias', profile.alias, 'author_avatar_id', profile.avatar_id,
    'author_theme_id', profile.presentation_theme_id, 'routine_name', recap.routine_name,
    'completed_at', recap.completed_at, 'duration_seconds', recap.duration_seconds,
    'exercise_count', recap.exercise_count,
    'muscle_group_ids', coalesce((select array_agg(distinct muscle.value #>> '{}' order by muscle.value #>> '{}') from jsonb_array_elements(coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb)) exercise(value) cross join lateral jsonb_array_elements(coalesce(exercise.value -> 'muscle_group_ids', '[]'::jsonb)) muscle(value)), '{}'::text[]),
    'metrics', recap.metrics, 'caption', recap.caption, 'created_at', recap.created_at,
    'exercises', coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb),
    'template_available', recap.share_payload ? 'routine', 'mesocycle_available', recap.share_payload ? 'mesocycle',
    'is_author', recap.author_id = actor, 'share_payload', recap.share_payload,
    'reaction_count', (select count(*) from public.workout_recap_reactions reaction where reaction.recap_id = recap.id),
    'viewer_has_reacted', exists (select 1 from public.workout_recap_reactions reaction where reaction.recap_id = recap.id and reaction.actor_id = actor),
    'comments', coalesce((select jsonb_agg(private.workout_recap_comment_projection(comment_row) order by comment_row.created_at, comment_row.id) from (select * from public.workout_recap_comments where workout_recap_comments.recap_id = recap.id order by workout_recap_comments.created_at desc, workout_recap_comments.id desc limit 50) comment_row), '[]'::jsonb),
    'previous_comparable', (select jsonb_build_object('id', prior.id, 'completed_at', prior.completed_at, 'duration_seconds', prior.duration_seconds, 'exercise_count', prior.exercise_count, 'metrics', prior.metrics) from public.workout_recaps prior where prior.author_id = recap.author_id and prior.routine_name = recap.routine_name and prior.completed_at < recap.completed_at and prior.deleted_at is null and private.is_recap_viewer(actor, prior.author_id) order by prior.completed_at desc, prior.id desc limit 1)
  ) into result from public.profiles profile where profile.id = recap.author_id;
  return result;
end;
$$;
