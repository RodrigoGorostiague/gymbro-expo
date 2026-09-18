-- Read-only, session-scoped preview: never match another session by name or timestamp.
create function public.get_workout_completion_preview(attempt_id_input text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  snapshot jsonb;
  recap_id uuid;
  recap_deleted boolean := false;
  activities jsonb;
begin
  select attempt.snapshot into snapshot from public.experience_attempts attempt
    where attempt.owner_id = actor and attempt.attempt_id = attempt_id_input;
  if snapshot is null then
    return jsonb_build_object('confirmed', false, 'recap', null, 'activities', '[]'::jsonb, 'status', 'pending');
  end if;
  select recap.id, recap.deleted_at is not null into recap_id, recap_deleted
    from public.workout_recaps recap where recap.author_id = actor
    and recap.publication_key = snapshot ->> 'recapPublicationKey';
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', activity.id, 'kind', activity.kind, 'payload', activity.payload, 'created_at', activity.created_at,
    'author_alias', profile.alias, 'author_avatar_id', profile.avatar_id,
    'author_frame_id', profile.equipped_frame_id, 'author_title_id', profile.equipped_title_id,
    'author_theme_id', profile.presentation_theme_id) order by activity.created_at), '[]'::jsonb)
    into activities from public.community_activities activity
    join public.profiles profile on profile.id = activity.author_id
    where activity.author_id = actor and activity.kind = 'personal_record'
    and activity.source_key = 'personal-record:' || attempt_id_input;
  return jsonb_build_object('confirmed', true,
    'recap', case when recap_id is not null and not recap_deleted then public.get_workout_recap_detail(recap_id) else null end,
    'activities', activities,
    'status', case when recap_deleted then 'removed'
      when recap_id is not null then 'published'
      when snapshot ->> 'jointWorkoutId' is not null then 'joint'
      when not (select auto_share_completed_workouts from public.profiles where id = actor) then 'private'
      else 'pending' end);
end;
$$;
revoke all on function public.get_workout_completion_preview(text) from public, anon;
grant execute on function public.get_workout_completion_preview(text) to authenticated;
