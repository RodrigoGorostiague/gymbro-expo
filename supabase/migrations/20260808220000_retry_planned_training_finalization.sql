-- A planned slot is an idempotency boundary in addition to the client attempt id.
-- Keep the existing reward/XP implementation intact and serialize retries before it.
alter function public.finalize_training_attempt(jsonb) rename to finalize_training_attempt_core;
revoke all on function public.finalize_training_attempt_core(jsonb) from public, anon, authenticated;

create function public.finalize_training_attempt(attempt_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  lineage jsonb := attempt_input -> 'lineage';
  mesocycle_id_value text;
  mesocycle_week_value integer;
  planned_session_id_value text;
  prior_attempt_id text;
  prior_attempt jsonb;
  prior_experience_receipt jsonb;
begin
  -- The core function locks this row too; taking it here makes a different-id retry
  -- wait for the first finalization before checking the planned-session boundary.
  perform 1 from public.training_states where owner_id = actor for update;

  if jsonb_typeof(lineage) = 'object'
    and public.training_state_nonempty_text(lineage -> 'mesocycleId')
    and public.training_state_nonempty_text(lineage -> 'plannedSessionId')
    and coalesce((lineage ->> 'weekNumber') ~ '^[1-9][0-9]*$', false) then
    mesocycle_id_value := lineage ->> 'mesocycleId';
    mesocycle_week_value := (lineage ->> 'weekNumber')::integer;
    planned_session_id_value := lineage ->> 'plannedSessionId';

    select attempt_id into prior_attempt_id
    from public.reward_attempts
    where owner_id = actor
      and mesocycle_id = mesocycle_id_value
      and mesocycle_week = mesocycle_week_value
      and planned_session_id = planned_session_id_value;

    if prior_attempt_id is not null then
      select value into prior_attempt
      from public.training_states state, jsonb_array_elements(state.attempts) value
      where state.owner_id = actor and value ->> 'id' = prior_attempt_id;
      select receipt into prior_experience_receipt
      from public.experience_receipts
      where owner_id = actor and attempt_id = prior_attempt_id;

      if prior_attempt is not null and prior_experience_receipt is not null then
        return jsonb_build_object(
          'attempt', prior_attempt,
          'receipt', public.reward_receipt(actor, prior_attempt_id),
          'experience_receipt', prior_experience_receipt,
          'experience_progress', prior_experience_receipt -> 'progress'
        );
      end if;
    end if;
  end if;

  return public.finalize_training_attempt_core(attempt_input);
end;
$$;

revoke all on function public.finalize_training_attempt(jsonb) from public, anon;
grant execute on function public.finalize_training_attempt(jsonb) to authenticated;
