-- Opted-in accounts must use compare-and-swap for solo draft mutations. The flag
-- deliberately survives cancellation/finalization so stale clients cannot revive
-- a cleared draft. Joint lifecycle RPCs keep their existing behavior.
alter table public.training_states add column workout_handoff_enabled boolean not null default false;

create function public.start_training_workout(draft_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); current_draft jsonb;
begin
  perform private.lock_joint_workout_lifecycle();
  if draft_input is null or public.training_state_valid_draft(draft_input, actor) is distinct from true
    or draft_input ->> 'jointWorkoutId' is not null
    or draft_input ->> 'jointCancellationPending' = 'true'
    or draft_input -> 'pendingFinalization' is not null
    or jsonb_typeof(draft_input -> 'routineSnapshot') is distinct from 'object'
    or draft_input -> 'routineSnapshot' ->> 'id' is distinct from draft_input ->> 'routineId'
    or public.training_state_nonempty_text(draft_input -> 'routineSnapshot' -> 'name') is distinct from true
    or jsonb_typeof(draft_input -> 'routineSnapshot' -> 'exercises') is distinct from 'array' then
    raise exception 'invalid workout start input' using errcode = '22023';
  end if;
  -- The unique owner row serializes even two first-ever starts.
  insert into public.training_states(owner_id) values (actor) on conflict do nothing;
  select active_workout_draft into current_draft from public.training_states where owner_id = actor for update;
  if current_draft is not null then
    if current_draft ->> 'jointWorkoutId' is null
      and jsonb_typeof(current_draft -> 'routineSnapshot') = 'object' then
      update public.training_states set workout_handoff_enabled = true where owner_id = actor;
    end if;
    return jsonb_build_object('status', 'existing', 'draft', current_draft);
  end if;
  if exists(select 1 from public.experience_receipts where owner_id = actor and attempt_id = draft_input ->> 'attemptId')
    or exists(select 1 from public.training_states s, jsonb_array_elements(s.attempts) a where s.owner_id = actor and a ->> 'id' = draft_input ->> 'attemptId') then
    raise exception 'workout attempt already completed' using errcode = '22023';
  end if;
  update public.training_states set active_workout_draft = draft_input, workout_handoff_enabled = true, updated_at = now() where owner_id = actor;
  return jsonb_build_object('status', 'started', 'draft', draft_input);
end;
$$;

alter function public.save_training_state(jsonb,jsonb,jsonb,jsonb,boolean) rename to save_training_state_before_handoff;
revoke all on function public.save_training_state_before_handoff(jsonb,jsonb,jsonb,jsonb,boolean) from public, anon, authenticated;
create function public.save_training_state(definitions_input jsonb default null, attempts_input jsonb default null, sessions_input jsonb default null, active_workout_draft_input jsonb default null, active_workout_draft_supplied boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); current public.training_states%rowtype;
begin
  perform private.lock_joint_workout_lifecycle();
  insert into public.training_states(owner_id) values (actor) on conflict do nothing;
  select * into current from public.training_states where owner_id = actor for update;
  if active_workout_draft_supplied then
    if current.active_workout_draft is not null and active_workout_draft_input is not null
      and current.active_workout_draft ->> 'attemptId' is distinct from active_workout_draft_input ->> 'attemptId' then
      raise exception 'active workout already exists' using errcode = '40001';
    end if;
    if current.workout_handoff_enabled
      and (current.active_workout_draft is null or current.active_workout_draft ->> 'jointWorkoutId' is null)
      and not (current.active_workout_draft is null and active_workout_draft_input ->> 'jointWorkoutId' is not null)
      and active_workout_draft_input is distinct from current.active_workout_draft then
      raise exception 'solo workout requires compare-and-swap' using errcode = '40001';
    end if;
    if current.workout_handoff_enabled and active_workout_draft_input ->> 'jointWorkoutId' is not null then
      if not exists(select 1 from public.joint_workout_participants p
        where p.participant_id = actor and p.joint_workout_id::text = active_workout_draft_input ->> 'jointWorkoutId'
          and p.status = 'active') then
        raise exception 'active joint membership required' using errcode = '42501';
      end if;
    end if;
    if current.workout_handoff_enabled and current.active_workout_draft ->> 'jointWorkoutId' is not null
      and active_workout_draft_input is not null
      and active_workout_draft_input ->> 'jointWorkoutId' is distinct from current.active_workout_draft ->> 'jointWorkoutId' then
      raise exception 'joint workout identity cannot change' using errcode = '40001';
    end if;
  end if;
  perform public.save_training_state_before_handoff(definitions_input, attempts_input, sessions_input, active_workout_draft_input, active_workout_draft_supplied);
end;
$$;
revoke all on function public.start_training_workout(jsonb), public.save_training_state(jsonb,jsonb,jsonb,jsonb,boolean) from public, anon;
grant execute on function public.start_training_workout(jsonb), public.save_training_state(jsonb,jsonb,jsonb,jsonb,boolean) to authenticated;
notify pgrst, 'reload schema';
