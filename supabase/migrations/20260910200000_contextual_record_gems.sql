-- Contextual record gems are new-finalization-only; existing XP rules are unchanged.
create function private.contextual_record_scores(attempt jsonb)
returns table(exercise_id text, variant text, unit text, record_type text, partition_value numeric, score numeric)
language sql immutable set search_path = '' as $$
  with raw as (
    select e->>'exerciseId' exercise_id, e->>'variant' variant, s,
      s->'result'->'performance' p, count(*) over(partition by s->'plan'->>'id') identities
    from jsonb_array_elements(attempt->'exercises') e
    cross join lateral jsonb_array_elements(e->'sets') s
  ), eligible as (
    select exercise_id, variant, p->>'unit' unit,
      case when jsonb_typeof(p->'load')='number' then (p->>'load')::numeric end load,
      case when jsonb_typeof(p->'reps')='number' then (p->>'reps')::numeric end reps
    from raw where identities=1 and public.training_state_nonempty_text(to_jsonb(exercise_id))
      and public.training_state_nonempty_text(to_jsonb(variant))
      and s->'plan'->>'type' is distinct from 'C'
      and s->'result'->>'performed'='true'
      and s->'result'->>'setId'=s->'plan'->>'id'
      and p->>'mode'='external-load' and p->>'unit' in ('kg','lb')
  ), valid as (select * from eligible where load>=0 and reps>0 and trunc(reps)=reps)
  select exercise_id,variant,unit,'load',reps,max(load) from valid group by exercise_id,variant,unit,reps
  union all
  select exercise_id,variant,unit,'reps',load,max(reps) from valid group by exercise_id,variant,unit,load
  union all
  select exercise_id,variant,unit,'volume',0,sum(load*reps) from valid group by exercise_id,variant,unit
$$;

create function private.contextual_record_improvements(actor uuid, attempt jsonb)
returns table(exercise_id text, variant text, unit text, record_type text, partition_value numeric, previous_value numeric, new_value numeric)
language sql stable security definer set search_path = '' as $$
  with history as (
    select h.completed_at, s.* from public.experience_attempts h
    cross join lateral private.contextual_record_scores(h.snapshot) s
    where h.owner_id=actor and h.attempt_id<>attempt->>'id' and h.completed_at<=now()
  )
  select c.exercise_id,c.variant,c.unit,c.record_type,c.partition_value,max(h.score),c.score
  from private.contextual_record_scores(attempt) c
  join history h on (h.exercise_id,h.variant,h.unit,h.record_type,h.partition_value)
    =(c.exercise_id,c.variant,c.unit,c.record_type,c.partition_value)
  where (attempt->>'completedAt')::timestamptz<=now()
  group by c.exercise_id,c.variant,c.unit,c.record_type,c.partition_value,c.score
  -- Earlier evidence establishes a comparable baseline. All confirmed immutable
  -- evidence prevents backdated attempts from re-earning an already beaten mark.
  having bool_or(h.completed_at<(attempt->>'completedAt')::timestamptz) and c.score>max(h.score)
$$;

alter function public.finalize_training_attempt(jsonb) rename to finalize_training_attempt_before_record_gems;
revoke all on function public.finalize_training_attempt_before_record_gems(jsonb) from public,anon,authenticated;
create function public.finalize_training_attempt(attempt_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.require_actor(); was_finalized boolean; result jsonb; canonical jsonb; award record;
begin
  perform private.lock_joint_workout_lifecycle();
  -- Establish an owner row before the old finalizer's row lock (first-ever races).
  insert into public.training_states(owner_id) values(actor) on conflict do nothing;
  perform 1 from public.training_states where owner_id=actor for update;
  select exists(select 1 from public.experience_receipts where owner_id=actor and attempt_id=attempt_input->>'id') into was_finalized;
  result:=public.finalize_training_attempt_before_record_gems(attempt_input);
  canonical:=result->'attempt';
  -- Canonical planned-session reconciliation can return another already-paid ID.
  if not was_finalized and canonical->>'id'=attempt_input->>'id' then
    for award in
      select exercise_id,variant,unit,record_type,
        jsonb_agg(jsonb_build_object('partition',partition_value,'previous',previous_value,'value',new_value) order by partition_value) evidence
      from private.contextual_record_improvements(actor,canonical)
      group by exercise_id,variant,unit,record_type
    loop
      perform public.reward_add_entry(actor,
        'contextual-record:v1:' || jsonb_build_array(canonical->>'id',award.exercise_id,award.variant,award.unit,award.record_type)::text,
        25,'contextual_record',canonical->>'id',
        jsonb_build_object('policyVersion',1,'recordType',award.record_type,'exerciseId',award.exercise_id,'variant',award.variant,'unit',award.unit,'evidence',award.evidence));
    end loop;
  end if;
  return jsonb_set(result,'{receipt}',public.reward_receipt(actor,canonical->>'id'));
end;
$$;

create function public.get_record_gem_rewards(attempt_id_input text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('amount',amount,'recordType',breakdown->>'recordType',
    'exerciseId',breakdown->>'exerciseId','variant',breakdown->>'variant','unit',breakdown->>'unit') order by id),'[]'::jsonb)
  from public.reward_ledger_entries where owner_id=public.require_actor() and attempt_id=attempt_id_input and kind='contextual_record'
$$;
revoke all on function private.contextual_record_scores(jsonb),private.contextual_record_improvements(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.finalize_training_attempt(jsonb),public.get_record_gem_rewards(text) from public,anon;
grant execute on function public.finalize_training_attempt(jsonb),public.get_record_gem_rewards(text) to authenticated;
notify pgrst,'reload schema';
