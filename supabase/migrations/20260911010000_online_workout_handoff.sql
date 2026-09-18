-- Online collaboration is an explicit, per-attempt capability. The offline RPC
-- remains solo-only. Private tombstones prevent late commands reviving attempts.
do $$ begin
  if to_regprocedure('public.finalize_training_attempt_before_record_gems(jsonb)') is null then
    raise exception 'contextual record reward migration is required';
  end if;
end $$;

create table private.online_workout_claims (
  owner_id uuid not null references auth.users(id) on delete cascade,
  attempt_id text not null,
  claimed_draft jsonb not null,
  state text not null default 'active' check (state in ('active','cancelled','finalized')),
  terminal_expected jsonb,
  terminal_next jsonb,
  terminal_attempt jsonb,
  terminal_result jsonb,
  primary key (owner_id, attempt_id)
);
revoke all on private.online_workout_claims from public, anon, authenticated;

create function public.online_workout_capability()
returns integer language plpgsql security definer set search_path = '' as $$
begin perform public.require_actor(); return 1; end;
$$;

create function public.claim_online_workout(expected_draft jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); current_draft jsonb; claimed jsonb;
begin
  perform private.lock_joint_workout_lifecycle();
  select active_workout_draft into current_draft from public.training_states where owner_id=actor for update;
  if expected_draft is null or public.training_state_valid_draft(expected_draft,actor) is distinct from true
    or expected_draft->'pendingFinalization' is not null
    or expected_draft->>'jointCancellationPending'='true'
    or jsonb_typeof(expected_draft->'routineSnapshot') is distinct from 'object'
    or expected_draft->'routineSnapshot'->>'id' is distinct from expected_draft->>'routineId' then
    raise exception 'invalid online claim input' using errcode='22023';
  end if;
  claimed := expected_draft || '{"transportMode":"online"}'::jsonb;
  if exists(select 1 from private.online_workout_claims where owner_id=actor and attempt_id=expected_draft->>'attemptId' and state<>'active')
    or exists(select 1 from public.experience_receipts where owner_id=actor and attempt_id=expected_draft->>'attemptId')
    or (current_draft is distinct from expected_draft and current_draft is distinct from claimed) then
    return jsonb_build_object('status','conflict','draft',current_draft);
  end if;
  -- Same exact pre-claim request is safe after a lost response. Any other edits conflict.
  insert into private.online_workout_claims(owner_id,attempt_id,claimed_draft)
  values(actor,expected_draft->>'attemptId',claimed) on conflict do nothing;
  update public.training_states set active_workout_draft=claimed,updated_at=now() where owner_id=actor;
  return jsonb_build_object('status','claimed','draft',claimed);
end;
$$;

-- Keep the entire existing contextual gems -> offline -> joint -> XP chain.
alter function public.finalize_training_attempt(jsonb) rename to finalize_training_attempt_before_online;
revoke all on function public.finalize_training_attempt_before_online(jsonb) from public,anon,authenticated;
create function public.finalize_training_attempt(attempt_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.require_actor();
begin
  perform private.lock_joint_workout_lifecycle();
  if exists(select 1 from private.online_workout_claims where owner_id=actor and attempt_id=attempt_input->>'id') then
    raise exception 'claimed workout requires online compare-and-swap' using errcode='40001';
  end if;
  return public.finalize_training_attempt_before_online(attempt_input);
end;
$$;

create function public.sync_online_workout(expected_draft jsonb,next_draft jsonb,attempt_input jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.require_actor(); current_draft jsonb; claim private.online_workout_claims%rowtype;
  canonical_group uuid; result jsonb;
begin
  perform private.lock_joint_workout_lifecycle();
  select active_workout_draft into current_draft from public.training_states where owner_id=actor for update;
  if expected_draft is null or public.training_state_valid_draft(expected_draft,actor) is distinct from true
    or expected_draft->>'transportMode' is distinct from 'online' then
    raise exception 'invalid online workout input' using errcode='22023';
  end if;
  select * into claim from private.online_workout_claims where owner_id=actor and attempt_id=expected_draft->>'attemptId' for update;
  if not found then raise exception 'online workout claim required' using errcode='42501'; end if;
  -- Terminal receipt lookup precedes CAS but accepts only the captured command.
  if claim.state<>'active' then
    if claim.terminal_expected is not distinct from expected_draft
      and claim.terminal_next is not distinct from next_draft
      and claim.terminal_attempt is not distinct from attempt_input then
      return claim.terminal_result;
    end if;
    return jsonb_build_object('status','conflict','draft',current_draft);
  end if;
  if current_draft is distinct from expected_draft and (next_draft is null or current_draft is distinct from next_draft) then
    return jsonb_build_object('status','conflict','draft',current_draft);
  end if;
  canonical_group:=public.resolve_joint_workout_attempt(expected_draft->>'attemptId');
  if next_draft is null then
    if attempt_input is not null or current_draft->'pendingFinalization' is not null then
      raise exception 'pending finalization cannot be cancelled' using errcode='22023';
    end if;
    if canonical_group is not null then perform public.leave_joint_workout(canonical_group); end if;
    update public.workout_start_activities set closed_at=coalesce(closed_at,now())
      where author_id=actor and attempt_id=expected_draft->>'attemptId';
    update public.training_states set active_workout_draft=null,updated_at=now() where owner_id=actor;
    result:=jsonb_build_object('status','saved','draft',null,'cancelled',true);
    update private.online_workout_claims set state='cancelled',terminal_expected=expected_draft,terminal_result=result
      where owner_id=actor and attempt_id=claim.attempt_id;
    return result;
  end if;
  if public.training_state_valid_draft(next_draft,actor) is distinct from true
    or next_draft->>'transportMode' is distinct from 'online'
    or next_draft->>'attemptId' is distinct from claim.attempt_id
    or next_draft->>'routineId' is distinct from claim.claimed_draft->>'routineId'
    or next_draft->'lineage' is distinct from claim.claimed_draft->'lineage'
    or next_draft->'startedAtMs' is distinct from claim.claimed_draft->'startedAtMs'
    or jsonb_typeof(next_draft->'routineSnapshot') is distinct from 'object'
    or ((next_draft->'routineSnapshot') - 'exercises') is distinct from ((claim.claimed_draft->'routineSnapshot') - 'exercises')
    or jsonb_typeof(next_draft->'routineSnapshot'->'exercises') is distinct from 'array'
    or next_draft->>'jointCancellationPending'='true'
    or (current_draft->'pendingFinalization' is not null and next_draft->'pendingFinalization' is distinct from current_draft->'pendingFinalization') then
    raise exception 'online workout identity changed' using errcode='22023';
  end if;
  -- Exercise set edits are session-local, not a replacement of captured identities.
  if exists(select 1 from jsonb_array_elements(claim.claimed_draft->'routineSnapshot'->'exercises') original
    join jsonb_array_elements(next_draft->'routineSnapshot'->'exercises') edited on original->>'id'=edited->>'id'
    where (original-'sets') is distinct from (edited-'sets')) then
    raise exception 'online exercise identity changed' using errcode='22023';
  end if;
  -- The activity association is canonical, including merged groups; client IDs never grant membership.
  if next_draft->>'jointWorkoutId' is distinct from canonical_group::text
    or (canonical_group is not null and not exists(select 1 from public.joint_workout_participants
      where joint_workout_id=canonical_group and participant_id=actor and status='active')) then
    return jsonb_build_object('status','conflict','draft',current_draft,'canonicalJointWorkoutId',canonical_group);
  end if;
  if attempt_input is not null then
    if attempt_input is distinct from next_draft->'pendingFinalization'->'attempt'
      or attempt_input->>'owner' is distinct from actor::text
      or attempt_input->>'id' is distinct from claim.attempt_id
      or attempt_input->>'routineId' is distinct from claim.claimed_draft->>'routineId'
      or attempt_input->'lineage' is distinct from claim.claimed_draft->'lineage'
      or attempt_input->>'jointWorkoutId' is distinct from canonical_group::text then
      raise exception 'invalid online finalization capture' using errcode='22023';
    end if;
    result:=public.finalize_training_attempt_before_online(attempt_input);
    result:=jsonb_build_object('status','saved','draft',null,'finalized',result);
    update private.online_workout_claims set state='finalized',terminal_expected=expected_draft,
      terminal_next=next_draft,terminal_attempt=attempt_input,terminal_result=result
      where owner_id=actor and attempt_id=claim.attempt_id;
    return result;
  end if;
  update public.training_states set active_workout_draft=next_draft,updated_at=now() where owner_id=actor;
  return jsonb_build_object('status','saved','draft',next_draft);
end;
$$;

-- Reject old clients' blind collection writes as well as draft overwrites/deletes.
alter function public.save_training_state(jsonb,jsonb,jsonb,jsonb,boolean) rename to save_training_state_before_online;
revoke all on function public.save_training_state_before_online(jsonb,jsonb,jsonb,jsonb,boolean) from public,anon,authenticated;
create function public.save_training_state(definitions_input jsonb default null,attempts_input jsonb default null,sessions_input jsonb default null,active_workout_draft_input jsonb default null,active_workout_draft_supplied boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.require_actor(); current public.training_states%rowtype;
begin
  perform private.lock_joint_workout_lifecycle();
  select * into current from public.training_states where owner_id=actor for update;
  if active_workout_draft_supplied and active_workout_draft_input is distinct from current.active_workout_draft
    and (active_workout_draft_input->>'transportMode'='online' or exists(select 1 from private.online_workout_claims
      where owner_id=actor and attempt_id in (current.active_workout_draft->>'attemptId',active_workout_draft_input->>'attemptId'))) then
    raise exception 'claimed workout requires online compare-and-swap' using errcode='40001';
  end if;
  if attempts_input is not null and exists(select 1 from private.online_workout_claims c where c.owner_id=actor
    and (select coalesce(jsonb_agg(a),'[]'::jsonb) from jsonb_array_elements(attempts_input) a where a->>'id'=c.attempt_id)
      is distinct from (select coalesce(jsonb_agg(a),'[]'::jsonb) from jsonb_array_elements(current.attempts) a where a->>'id'=c.attempt_id)) then
    raise exception 'claimed attempt collection is immutable' using errcode='40001';
  end if;
  perform public.save_training_state_before_online(definitions_input,attempts_input,sessions_input,active_workout_draft_input,active_workout_draft_supplied);
end;
$$;

alter function public.sync_offline_workout(jsonb,jsonb,jsonb) rename to sync_offline_workout_before_online;
revoke all on function public.sync_offline_workout_before_online(jsonb,jsonb,jsonb) from public,anon,authenticated;
create function public.sync_offline_workout(expected_draft jsonb,next_draft jsonb,attempt_input jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.require_actor();
begin
  perform private.lock_joint_workout_lifecycle();
  if expected_draft->>'transportMode' is not null or next_draft->>'transportMode' is not null
    or exists(select 1 from private.online_workout_claims where owner_id=actor and attempt_id=expected_draft->>'attemptId') then
    return jsonb_build_object('status','conflict');
  end if;
  return public.sync_offline_workout_before_online(expected_draft,next_draft,attempt_input);
end;
$$;

alter function public.start_training_workout(jsonb) rename to start_training_workout_before_online;
revoke all on function public.start_training_workout_before_online(jsonb) from public,anon,authenticated;
create function public.start_training_workout(draft_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.require_actor();
begin
  perform private.lock_joint_workout_lifecycle();
  if draft_input->>'transportMode' is not null or exists(select 1 from private.online_workout_claims
    where owner_id=actor and attempt_id=draft_input->>'attemptId' and state<>'active') then
    raise exception 'online workout attempt cannot restart' using errcode='22023';
  end if;
  return public.start_training_workout_before_online(draft_input);
end;
$$;
revoke all on function public.online_workout_capability(),public.claim_online_workout(jsonb),public.sync_online_workout(jsonb,jsonb,jsonb),public.finalize_training_attempt(jsonb),public.save_training_state(jsonb,jsonb,jsonb,jsonb,boolean),public.sync_offline_workout(jsonb,jsonb,jsonb),public.start_training_workout(jsonb) from public,anon;
grant execute on function public.online_workout_capability(),public.claim_online_workout(jsonb),public.sync_online_workout(jsonb,jsonb,jsonb),public.finalize_training_attempt(jsonb),public.save_training_state(jsonb,jsonb,jsonb,jsonb,boolean),public.sync_offline_workout(jsonb,jsonb,jsonb),public.start_training_workout(jsonb) to authenticated;
notify pgrst,'reload schema';
