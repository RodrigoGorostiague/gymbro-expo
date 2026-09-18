-- Active-workout updates are asynchronous. A stale draft must never overwrite
-- the attempt that finalized it, nor restore the draft after finalization.
create or replace function public.save_training_state(definitions_input jsonb default null, attempts_input jsonb default null, sessions_input jsonb default null, active_workout_draft_input jsonb default null, active_workout_draft_supplied boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  current public.training_states%rowtype;
  next_active_workout_draft jsonb;
begin
  insert into public.training_states(owner_id) values (actor) on conflict do nothing;
  select * into current from public.training_states where owner_id = actor for update;

  if not active_workout_draft_supplied then
    next_active_workout_draft := current.active_workout_draft;
  elsif active_workout_draft_input is null then
    next_active_workout_draft := null;
  elsif exists (
    select 1
    from jsonb_array_elements(current.attempts) attempt(value)
    where attempt.value ->> 'id' = active_workout_draft_input ->> 'attemptId'
  ) then
    next_active_workout_draft := current.active_workout_draft;
  else
    next_active_workout_draft := active_workout_draft_input;
  end if;

  update public.training_states
  set definitions = coalesce(definitions_input, current.definitions),
      attempts = coalesce(attempts_input, current.attempts),
      sessions = coalesce(sessions_input, current.sessions),
      active_workout_draft = next_active_workout_draft,
      updated_at = now()
  where owner_id = actor;
end;
$$;
