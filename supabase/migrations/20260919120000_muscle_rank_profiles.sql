-- Ranked muscle activity is a game score independent of global XP and rewards.
-- All history and pause intervals remain private; RPCs expose aggregates only.
create table if not exists private.muscle_rank_pauses (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  start_on date not null,
  end_on date,
  primary key(owner_id,start_on),
  check (end_on is null or end_on > start_on)
);
revoke all on private.muscle_rank_pauses from public,anon,authenticated;
create unique index if not exists muscle_rank_one_open_pause on private.muscle_rank_pauses(owner_id) where end_on is null;

create or replace function private.muscle_rank_active_day(day_input date, pauses jsonb) returns integer
language sql immutable set search_path='' as $$
  select (day_input-date '1970-01-01')-coalesce(sum(greatest(0,least(day_input,coalesce((value->>'end')::date,day_input))-(value->>'start')::date)),0)::integer
  from jsonb_array_elements(pauses)
$$;

create or replace function private.muscle_rank_days(history jsonb, subject uuid, cutoff timestamptz) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb:='[]'; daily record; period jsonb;
begin
  -- First occurrence per attempt wins, as in volume. Group before invoking the shared validator.
  for daily in
    with eligible as (
      select a.value, a.ordinality, private.volume_time(a.value->>'completedAt') as completed
      from jsonb_array_elements(private.volume_array(history)) with ordinality a
      where a.value->>'owner'=subject::text and jsonb_typeof(a.value->'id')='string' and a.value->>'id'<>''
    ), unique_attempts as (
      select distinct on(value->>'id') * from eligible where completed<cutoff order by value->>'id',ordinality
    ) select (completed at time zone 'UTC')::date as day,jsonb_agg(value order by ordinality) as records
      from unique_attempts group by 1 order by 1
  loop
    period:=private.muscle_volume_period(daily.records,subject,daily.day::timestamp at time zone 'UTC',least((daily.day+1)::timestamp at time zone 'UTC',cutoff));
    result:=result||jsonb_build_array(jsonb_build_object('day',daily.day,'equivalents',
      (select jsonb_object_agg(value->>'id',value->'equivalent') from jsonb_array_elements(period->'axes'))));
  end loop;
  return result;
end $$;

create or replace function private.muscle_rank_from_days(days jsonb, subject uuid, cutoff timestamptz, pauses jsonb default '[]') returns jsonb
language plpgsql stable set search_path='' as $$
declare
  today date:=(cutoff at time zone 'UTC')::date; axis jsonb; event jsonb; axes jsonb:='[]'; credits jsonb;
  key text; xp double precision; peak double precision; protected_at integer; processed_at integer; clock integer;
  day date; last_activity date; equivalent numeric; earned numeric; used numeric; active_pause jsonb;
begin
  for axis in select value from jsonb_array_elements(private.muscle_volume_taxonomy()) loop
    key:=axis->>'id'; xp:=0; peak:=0; protected_at:=null; processed_at:=0; last_activity:=null; credits:='[]';
    for event in select value from jsonb_array_elements(days) order by value->>'day' loop
      day:=(event->>'day')::date; equivalent:=coalesce((event->'equivalents'->>key)::numeric,0);
      if day>today or equivalent<=0 or exists(select 1 from jsonb_array_elements(pauses) p where day>=(p->>'start')::date and (p->>'end' is null or day<(p->>'end')::date)) then continue; end if;
      clock:=private.muscle_rank_active_day(day,pauses);
      if protected_at is not null then xp:=xp*power(.995::double precision,greatest(0,clock-greatest(processed_at,protected_at+7))); end if;
      processed_at:=clock;
      select coalesce(jsonb_agg(value),'[]'),coalesce(sum((value->>'xp')::numeric),0) into credits,used from jsonb_array_elements(credits) where (value->>'day')::date>=day-6;
      earned:=least(equivalent*10,60,greatest(0,120-used));
      credits:=credits||jsonb_build_array(jsonb_build_object('day',day,'xp',earned));
      xp:=least(11000,xp+earned); peak:=greatest(peak,xp);
      if protected_at is null or equivalent>=2 then protected_at:=clock; end if;
      last_activity:=day;
    end loop;
    clock:=private.muscle_rank_active_day(today,pauses);
    if protected_at is not null then xp:=xp*power(.995::double precision,greatest(0,clock-greatest(processed_at,protected_at+7))); end if;
    axes:=axes||jsonb_build_array(jsonb_build_object('id',key,'xp',floor(xp),'peakXp',floor(peak),'lastActivity',last_activity,
      'protectionDays',case when protected_at is null then 0 else greatest(0,7-(clock-protected_at)) end,
      'earnedToday',(select coalesce(sum((value->>'xp')::numeric),0) from jsonb_array_elements(credits) where (value->>'day')::date=today),
      'earnedSevenDays',(select coalesce(sum((value->>'xp')::numeric),0) from jsonb_array_elements(credits) where (value->>'day')::date>=today-6)));
  end loop;
  select value into active_pause from jsonb_array_elements(pauses) where value->>'end' is null or (value->>'end')::date>today order by value->>'start' desc limit 1;
  return jsonb_build_object('policyVersion',1,'subjectId',subject,'asOf',to_char(cutoff at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'axes',axes,
    'paused',exists(select 1 from jsonb_array_elements(pauses) p where today>=(p->>'start')::date and (p->>'end' is null or today<(p->>'end')::date)),
    'pauseStartsOn',active_pause->'start','pauseEndsOn',active_pause->'end');
end $$;

create or replace function private.muscle_rank_pause_history(subject uuid) returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('start',start_on,'end',end_on) order by start_on),'[]') from private.muscle_rank_pauses where owner_id=subject
$$;

create or replace function public.get_profile_muscle_ranks(target uuid, preview boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.require_actor(); shared boolean; history jsonb; cutoff timestamptz:=date_trunc('milliseconds',now());
begin
  if target is null or (target<>actor and (private.is_blocked_pair(actor,target) or not exists(select 1 from public.relationships where member_low=least(actor,target) and member_high=greatest(actor,target)))) then raise exception 'social profile unavailable'; end if;
  select share_social_muscle_distribution into shared from public.profiles where id=target;
  if not found then raise exception 'profile unavailable'; end if;
  if (target<>actor or coalesce(preview,false)) and not shared then return null; end if;
  select attempts into history from public.training_states where owner_id=target;
  return private.muscle_rank_with_peaks(private.muscle_rank_from_days(private.muscle_rank_days(history,target,cutoff),target,cutoff,private.muscle_rank_pause_history(target)));
end $$;

create or replace function public.set_muscle_rank_pause(paused_input boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.require_actor(); tomorrow date:=(now() at time zone 'UTC')::date+1;
begin
  if paused_input is null then raise exception 'invalid pause'; end if;
  -- Same lifecycle lock order as finalization; no mixed pause/award snapshots.
  perform private.lock_joint_workout_lifecycle();
  perform 1 from public.profiles where id=actor for update;
  if paused_input then
    update private.muscle_rank_pauses set end_on=null where owner_id=actor and end_on=tomorrow;
    if not exists(select 1 from private.muscle_rank_pauses where owner_id=actor and end_on is null) then
      insert into private.muscle_rank_pauses(owner_id,start_on) values(actor,tomorrow);
    end if;
  else
    delete from private.muscle_rank_pauses where owner_id=actor and start_on=tomorrow;
    update private.muscle_rank_pauses set end_on=tomorrow where owner_id=actor and end_on is null;
  end if;
end $$;

-- Replay the exact session boundary, so retries/reopening cannot award XP again or
-- attribute later workouts to this completion. This endpoint is owner-only.
create or replace function public.get_workout_muscle_rank_progress(attempt_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.require_actor(); history jsonb; attempt jsonb; prior jsonb; cutoff timestamptz; pauses jsonb;
begin
  select attempts into history from public.training_states where owner_id=actor;
  select value into attempt from jsonb_array_elements(private.volume_array(history)) where value->>'id'=attempt_id and value->>'owner'=actor::text limit 1;
  if attempt is null then raise exception 'muscle rank session pending'; end if;
  cutoff:=private.volume_time(attempt->>'completedAt')+interval '1 millisecond';
  if cutoff is null then raise exception 'invalid session date'; end if;
  -- Same-timestamp records have a stable ID tie break.
  select coalesce(jsonb_agg(value order by ordinality),'[]') into history from jsonb_array_elements(history) with ordinality
    where private.volume_time(value->>'completedAt')<private.volume_time(attempt->>'completedAt')
       or (private.volume_time(value->>'completedAt')=private.volume_time(attempt->>'completedAt') and value->>'id'<=attempt_id);
  select coalesce(jsonb_agg(value),'[]') into prior from jsonb_array_elements(history) where value->>'id'<>attempt_id;
  pauses:=private.muscle_rank_pause_history(actor);
  return jsonb_build_object('attemptId',attempt_id,
    'before',private.muscle_rank_from_days(private.muscle_rank_days(prior,actor,cutoff),actor,cutoff,pauses),
    'after',private.muscle_rank_from_days(private.muscle_rank_days(history,actor,cutoff),actor,cutoff,pauses));
end $$;

revoke all on function private.muscle_rank_active_day(date,jsonb),private.muscle_rank_days(jsonb,uuid,timestamptz),private.muscle_rank_from_days(jsonb,uuid,timestamptz,jsonb),private.muscle_rank_pause_history(uuid) from public,anon,authenticated;
revoke all on function public.get_profile_muscle_ranks(uuid,boolean),public.set_muscle_rank_pause(boolean),public.get_workout_muscle_rank_progress(text) from public,anon;
grant execute on function public.get_profile_muscle_ranks(uuid,boolean),public.set_muscle_rank_pause(boolean),public.get_workout_muscle_rank_progress(text) to authenticated;
notify pgrst,'reload schema';

create table if not exists private.muscle_rank_receipts (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  attempt_id text not null,
  progress jsonb not null,
  primary key(owner_id,attempt_id)
);
revoke all on private.muscle_rank_receipts from public,anon,authenticated;

create table if not exists private.muscle_rank_peaks (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  muscle_id text not null,
  peak_xp integer not null check(peak_xp between 0 and 11000),
  primary key(owner_id,muscle_id)
);
revoke all on private.muscle_rank_peaks from public,anon,authenticated;
create or replace function private.muscle_rank_with_peaks(state jsonb) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_set(state,'{axes}',(select jsonb_agg(jsonb_set(a.value,'{peakXp}',to_jsonb(greatest((a.value->>'peakXp')::integer,coalesce(p.peak_xp,0)))) order by a.ordinality)
    from jsonb_array_elements(state->'axes') with ordinality a
    left join private.muscle_rank_peaks p on p.owner_id=(state->>'subjectId')::uuid and p.muscle_id=a.value->>'id'))
$$;
revoke all on function private.muscle_rank_with_peaks(jsonb) from public,anon,authenticated;

-- One lifetime award per muscle/rank, independent of policy versions and retries.
create or replace function private.award_muscle_rank_gems(actor uuid, attempt_key text, before_state jsonb, after_state jsonb) returns void
language plpgsql set search_path='' as $$
declare axis jsonb; prior_axis jsonb; rank_index integer;
  thresholds integer[]:=array[100,300,800,1800,3500,6000,10000];
  rank_names text[]:=array['Intermedio','Avanzado','GymBro','GymRat','G-Boom','Alfa','Sigma'];
begin
  for axis in select value from jsonb_array_elements(after_state->'axes') loop
    select value into prior_axis from jsonb_array_elements(before_state->'axes') where value->>'id'=axis->>'id';
    for rank_index in 1..array_length(thresholds,1) loop
      if (axis->>'peakXp')::numeric>=thresholds[rank_index] and (prior_axis->>'peakXp')::numeric<thresholds[rank_index] then
        perform public.reward_add_entry(actor,'muscle-rank:'||(axis->>'id')||':'||rank_index,25,'muscle_rank_up',attempt_key,
          jsonb_build_object('policyVersion',1,'muscleId',axis->>'id','rankIndex',rank_index,'rank',rank_names[rank_index]));
      end if;
    end loop;
  end loop;
end $$;
revoke all on function private.award_muscle_rank_gems(uuid,text,jsonb,jsonb) from public,anon,authenticated;

-- Both direct and online/CAS finalization pass through this internal boundary.
-- Preserve all existing joint/offline/contextual-record behavior and receipts.
do $$ begin
  if to_regprocedure('public.finalize_training_attempt_before_muscle_ranks(jsonb)') is null then
    alter function public.finalize_training_attempt_before_online(jsonb) rename to finalize_training_attempt_before_muscle_ranks;
  end if;
end $$;
revoke all on function public.finalize_training_attempt_before_muscle_ranks(jsonb) from public,anon,authenticated;
create or replace function public.finalize_training_attempt_before_online(attempt_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=public.require_actor(); existed boolean; result jsonb; canonical jsonb; before_state jsonb; after_state jsonb;
  history jsonb; pauses jsonb; cutoff timestamptz:=date_trunc('milliseconds',clock_timestamp())+interval '1 millisecond';
begin
  perform private.lock_joint_workout_lifecycle();
  insert into public.training_states(owner_id) values(actor) on conflict do nothing;
  select attempts into history from public.training_states where owner_id=actor for update;
  select exists(select 1 from public.experience_receipts where owner_id=actor and attempt_id=attempt_input->>'id') into existed;
  pauses:=private.muscle_rank_pause_history(actor);
  if not existed then before_state:=private.muscle_rank_with_peaks(private.muscle_rank_from_days(private.muscle_rank_days(history,actor,cutoff),actor,cutoff,pauses)); end if;
  result:=public.finalize_training_attempt_before_muscle_ranks(attempt_input);
  canonical:=result->'attempt';
  if not existed and canonical->>'id'=attempt_input->>'id' then
    select attempts into history from public.training_states where owner_id=actor;
    -- Same cutoff for both snapshots: finishing cannot manufacture a day of decay.
    after_state:=private.muscle_rank_with_peaks(private.muscle_rank_from_days(private.muscle_rank_days(history,actor,cutoff),actor,cutoff,pauses));
    perform private.award_muscle_rank_gems(actor,canonical->>'id',before_state,after_state);
    insert into private.muscle_rank_peaks(owner_id,muscle_id,peak_xp)
      select actor,value->>'id',(value->>'peakXp')::integer from jsonb_array_elements(after_state->'axes')
      on conflict(owner_id,muscle_id) do update set peak_xp=greatest(private.muscle_rank_peaks.peak_xp,excluded.peak_xp);
    insert into private.muscle_rank_receipts(owner_id,attempt_id,progress)
      values(actor,canonical->>'id',jsonb_build_object('attemptId',canonical->>'id','before',before_state,'after',after_state)) on conflict do nothing;
  end if;
  return jsonb_set(result,'{receipt}',public.reward_receipt(actor,canonical->>'id'));
end $$;
revoke all on function public.finalize_training_attempt_before_online(jsonb) from public,anon,authenticated;

-- Persisted completion snapshots survive subsequent workouts and rank decay.
do $$ begin
  if to_regprocedure('private.replay_workout_muscle_rank_progress(text)') is null then
    alter function public.get_workout_muscle_rank_progress(text) set schema private;
    alter function private.get_workout_muscle_rank_progress(text) rename to replay_workout_muscle_rank_progress;
  end if;
end $$;
revoke all on function private.replay_workout_muscle_rank_progress(text) from public,anon,authenticated;
create or replace function public.get_workout_muscle_rank_progress(attempt_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.require_actor(); result jsonb;
begin
  select progress into result from private.muscle_rank_receipts r where r.owner_id=actor and r.attempt_id=get_workout_muscle_rank_progress.attempt_id;
  if result is null then result:=private.replay_workout_muscle_rank_progress(attempt_id); end if;
  return result||jsonb_build_object('rewards',(select coalesce(jsonb_agg(jsonb_build_object('muscleId',breakdown->>'muscleId','rankIndex',(breakdown->>'rankIndex')::integer,'amount',amount) order by id),'[]')
    from public.reward_ledger_entries e where e.owner_id=actor and e.attempt_id=get_workout_muscle_rank_progress.attempt_id and e.kind='muscle_rank_up'));
end $$;
revoke all on function public.get_workout_muscle_rank_progress(text) from public,anon;
grant execute on function public.get_workout_muscle_rank_progress(text) to authenticated;
notify pgrst,'reload schema';
