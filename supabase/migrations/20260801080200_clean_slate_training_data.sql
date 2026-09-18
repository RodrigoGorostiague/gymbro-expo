-- Preserve custom definitions only; legacy training history and client reward state are discarded.
update public.training_libraries
set routines = '[]'::jsonb, mesocycles = '[]'::jsonb, updated_at = now()
where routines <> '[]'::jsonb or mesocycles <> '[]'::jsonb;

update public.training_states
set attempts = '[]'::jsonb, sessions = '[]'::jsonb, active_workout_draft = null, updated_at = now()
where attempts <> '[]'::jsonb or sessions <> '[]'::jsonb or active_workout_draft is not null;

create or replace function public.training_state_valid_attempts(items jsonb, actor uuid)
returns boolean language sql stable set search_path = '' as $$
  select public.training_state_unique_ids(items) and not exists (
    select 1 from jsonb_array_elements(items) item(value)
    where item.value ->> 'version' <> '1' or item.value ->> 'owner' <> actor::text
      or not public.training_state_nonempty_text(item.value -> 'recordedRoutineName')
      or jsonb_typeof(item.value -> 'completedAt') <> 'string'
      or coalesce((item.value ->> 'durationSeconds') ~ '^[0-9]+$', false) is false
      or coalesce((item.value ->> 'restTimerSeconds') ~ '^[0-9]+$', false) is false
      or jsonb_typeof(item.value -> 'exercises') <> 'array'
      or jsonb_typeof(item.value -> 'completion') <> 'object'
      or item.value -> 'reward' <> '{"setGems":0,"completionGems":0,"fullCompletionBonus":0,"totalGems":0,"qualifiesForCompletion":false}'::jsonb
      or item.value -> 'rewardApplication' <> jsonb_build_object('id', format('%s:%s:v%s', actor, item.value ->> 'id', item.value ->> 'version'), 'state', 'applied')
  )
$$;

create function public.import_legacy_custom_definitions(definitions_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); current public.training_states%rowtype;
  merged_definitions jsonb;
begin
  if not public.training_state_valid_definitions(coalesce(definitions_input, '[]'::jsonb), actor) then
    raise exception 'invalid training state input';
  end if;
  select * into current from public.training_states where owner_id = actor;
  select coalesce(jsonb_agg(value), '[]'::jsonb) into merged_definitions from (
    select value from jsonb_array_elements(coalesce(current.definitions, '[]'::jsonb)) value
    union all select legacy.value from jsonb_array_elements(definitions_input) legacy(value)
      where not exists (select 1 from jsonb_array_elements(coalesce(current.definitions, '[]'::jsonb)) remote(value) where remote.value ->> 'id' = legacy.value ->> 'id')
  ) merged;
  perform public.save_training_state(merged_definitions, null, null, null, false);
end;
$$;

revoke all on function public.import_legacy_training_state(jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_legacy_custom_definitions(jsonb) to authenticated;
