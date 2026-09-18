-- Additive, capability-gated solo workout sync. Existing clients keep their RPCs.
create function public.offline_workout_capability()
returns integer language plpgsql security definer set search_path = '' as $$
begin perform public.require_actor(); return 1; end;
$$;

alter function public.finalize_training_attempt(jsonb) rename to finalize_training_attempt_before_offline;
revoke all on function public.finalize_training_attempt_before_offline(jsonb) from public, anon, authenticated;
create function public.finalize_training_attempt(attempt_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); prior_draft jsonb; result jsonb;
begin
  -- Match the existing lifecycle lock order before taking the training row lock.
  perform private.lock_joint_workout_lifecycle();
  select active_workout_draft into prior_draft from public.training_states where owner_id = actor for update;
  result := public.finalize_training_attempt_before_offline(attempt_input);
  if prior_draft is not null and prior_draft ->> 'attemptId' is distinct from result -> 'attempt' ->> 'id' then
    update public.training_states set active_workout_draft = prior_draft where owner_id = actor;
  end if;
  return result;
end;
$$;

create function public.sync_offline_workout(expected_draft jsonb, next_draft jsonb, attempt_input jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); current_draft jsonb; result jsonb;
begin
  perform private.lock_joint_workout_lifecycle();
  select active_workout_draft into current_draft from public.training_states where owner_id = actor for update;
  if expected_draft is null or public.training_state_valid_draft(expected_draft, actor) is distinct from true then
    raise exception 'invalid offline workout input' using errcode = '22023';
  end if;
  if next_draft is null then
    if exists(select 1 from public.workout_start_activities where author_id = actor and attempt_id = expected_draft ->> 'attemptId' and joint_workout_id is not null) then
      raise exception 'offline joint workout is not supported' using errcode = '22023';
    end if;
    if attempt_input is not null then raise exception 'invalid offline workout input' using errcode = '22023'; end if;
    if current_draft is not null and current_draft is distinct from expected_draft then return jsonb_build_object('status','conflict'); end if;
    update public.training_states set active_workout_draft = null, updated_at = now() where owner_id = actor;
    return jsonb_build_object('status','saved','draft',null,'cancelled',true);
  end if;
  if public.training_state_valid_draft(next_draft, actor) is distinct from true
    or expected_draft ->> 'attemptId' is distinct from next_draft ->> 'attemptId'
    or expected_draft ->> 'routineId' is distinct from next_draft ->> 'routineId'
    or next_draft ->> 'jointWorkoutId' is not null
    or next_draft ->> 'jointCancellationPending' = 'true'
    or (attempt_input is not null and (attempt_input ->> 'id' is distinct from next_draft ->> 'attemptId'
      or attempt_input ->> 'owner' is distinct from actor::text or attempt_input ->> 'jointWorkoutId' is not null
      or attempt_input is distinct from next_draft -> 'pendingFinalization' -> 'attempt')) then
    raise exception 'invalid offline workout input' using errcode = '22023';
  end if;
  -- Receipt lookup precedes CAS: a lost finalization response is safely retryable.
  if attempt_input is not null and exists(select 1 from public.experience_receipts where owner_id = actor and attempt_id = attempt_input ->> 'id') then
    result := public.finalize_training_attempt(attempt_input);
    return jsonb_build_object('status', 'saved', 'draft', null, 'finalized', result);
  end if;
  if current_draft is distinct from expected_draft and current_draft is distinct from next_draft then
    return jsonb_build_object('status', 'conflict');
  end if;
  -- Reject a remotely associated solo attempt; offline collaboration is not enabled.
  if exists(select 1 from public.workout_start_activities where author_id = actor and attempt_id = next_draft ->> 'attemptId' and joint_workout_id is not null) then
    raise exception 'offline joint workout is not supported' using errcode = '22023';
  end if;
  if attempt_input is not null then
    result := public.finalize_training_attempt(attempt_input);
    return jsonb_build_object('status', 'saved', 'draft', null, 'finalized', result);
  end if;
  update public.training_states set active_workout_draft = next_draft, updated_at = now() where owner_id = actor;
  return jsonb_build_object('status', 'saved', 'draft', next_draft);
end;
$$;
revoke all on function public.offline_workout_capability(), public.sync_offline_workout(jsonb,jsonb,jsonb), public.finalize_training_attempt(jsonb) from public, anon;
grant execute on function public.offline_workout_capability(), public.sync_offline_workout(jsonb,jsonb,jsonb), public.finalize_training_attempt(jsonb) to authenticated;
