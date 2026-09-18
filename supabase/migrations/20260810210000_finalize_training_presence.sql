-- Presence must close with the authoritative training finalization, not a best-effort client request.
create or replace function public.finalize_training_attempt(attempt_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); result jsonb;
begin
  result := public.finalize_training_attempt_base(attempt_input);
  update public.workout_start_activities
  set closed_at = now()
  where author_id = actor and closed_at is null;
  perform private.publish_training_community_milestones(actor, result -> 'attempt' ->> 'id');
  return result;
end;
$$;
