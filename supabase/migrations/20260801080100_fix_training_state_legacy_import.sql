create or replace function public.import_legacy_training_state(definitions_input jsonb, attempts_input jsonb, sessions_input jsonb, active_workout_draft_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); current public.training_states%rowtype;
  merged_definitions jsonb; merged_attempts jsonb; merged_sessions jsonb;
begin
  select * into current from public.training_states where owner_id = actor;
  select coalesce(jsonb_agg(value), '[]'::jsonb) into merged_definitions from (
    select value from jsonb_array_elements(coalesce(current.definitions, '[]'::jsonb)) value
    union all select legacy.value from jsonb_array_elements(definitions_input) legacy(value)
      where not exists (select 1 from jsonb_array_elements(coalesce(current.definitions, '[]'::jsonb)) remote(value) where remote.value ->> 'id' = legacy.value ->> 'id')
  ) merged;
  select coalesce(jsonb_agg(value), '[]'::jsonb) into merged_attempts from (
    select value from jsonb_array_elements(coalesce(current.attempts, '[]'::jsonb)) value
    union all select legacy.value from jsonb_array_elements(attempts_input) legacy(value)
      where not exists (select 1 from jsonb_array_elements(coalesce(current.attempts, '[]'::jsonb)) remote(value) where remote.value ->> 'id' = legacy.value ->> 'id')
  ) merged;
  select coalesce(jsonb_agg(value), '[]'::jsonb) into merged_sessions from (
    select value from jsonb_array_elements(coalesce(current.sessions, '[]'::jsonb)) value
    union all select legacy.value from jsonb_array_elements(sessions_input) legacy(value)
      where not exists (select 1 from jsonb_array_elements(coalesce(current.sessions, '[]'::jsonb)) remote(value) where remote.value ->> 'id' = legacy.value ->> 'id')
  ) merged;
  perform public.save_training_state(merged_definitions, merged_attempts, merged_sessions, coalesce(current.active_workout_draft, active_workout_draft_input), true);
end;
$$;
