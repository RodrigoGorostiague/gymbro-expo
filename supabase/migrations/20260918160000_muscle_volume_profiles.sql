-- Versioned muscle-volume projection. No raw training records cross the social boundary.
create or replace function private.muscle_volume_taxonomy() returns jsonb
language sql immutable set search_path = '' as $$ select '
[{"id": "chest", "label": "Pecho", "muscleIds": ["GM-100", "GM-101", "GM-102", "GM-103", "GM-104", "GM-105", "pecho"]}, {"id": "shoulders", "label": "Hombros", "muscleIds": ["GM-110", "GM-111", "GM-112", "GM-113", "GM-114", "GM-115", "GM-116", "GM-117", "GM-118", "hombros"]}, {"id": "back", "label": "Espalda", "muscleIds": ["GM-120", "GM-121", "GM-122", "GM-123", "GM-124", "GM-125", "GM-126", "GM-127", "GM-128", "GM-129", "GM-130", "GM-131", "GM-132", "GM-133", "GM-160", "GM-161", "GM-162", "espalda", "dorsales", "trapecio"]}, {"id": "biceps", "label": "Bíceps", "muscleIds": ["GM-141", "GM-142", "GM-143", "GM-144", "bíceps"]}, {"id": "triceps", "label": "Tríceps", "muscleIds": ["GM-145", "GM-146", "GM-147", "GM-148", "tríceps"]}, {"id": "forearms", "label": "Antebrazos", "muscleIds": ["GM-149", "GM-150", "GM-151", "antebrazos"]}, {"id": "abs", "label": "Abdominales", "muscleIds": ["GM-300", "GM-301", "GM-302", "GM-303", "GM-304", "GM-305", "core"]}, {"id": "glutes", "label": "Glúteos", "muscleIds": ["GM-200", "GM-201", "GM-202", "GM-203", "glúteos"]}, {"id": "quads", "label": "Cuádriceps", "muscleIds": ["GM-210", "cuadriceps"]}, {"id": "hamstrings", "label": "Isquiosurales", "muscleIds": ["GM-220", "GM-221", "femorales"]}, {"id": "adductors", "label": "Aductores", "muscleIds": ["GM-230", "GM-231", "GM-232", "aductores"]}, {"id": "abductors", "label": "Abductores", "muscleIds": ["GM-240", "GM-241", "abductores"]}, {"id": "calves", "label": "Pantorrillas", "muscleIds": ["GM-250", "GM-251", "GM-252", "gemelos"]}, {"id": "tibialis", "label": "Tibial anterior", "muscleIds": ["GM-260"]}, {"id": "hipFlexors", "label": "Flexores de cadera", "muscleIds": ["GM-310"]}]
'::jsonb $$;

create table if not exists private.muscle_volume_goals (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  goals jsonb not null default '{}'::jsonb,
  share_goals boolean not null default false
);
revoke all on private.muscle_volume_goals from public, anon, authenticated;

create or replace function private.volume_array(v jsonb) returns jsonb language sql immutable set search_path='' as $$
  select case when jsonb_typeof(v)='array' then v else '[]'::jsonb end
$$;
create or replace function private.volume_number(v jsonb) returns numeric language sql immutable set search_path='' as $$
  select case when jsonb_typeof(v)='number' then (v #>> '{}')::numeric else null end
$$;
create or replace function private.volume_time(v text) returns timestamptz language plpgsql immutable set search_path='' as $$
begin return v::timestamptz; exception when others then return null; end $$;

create or replace function private.muscle_volume_period(attempts jsonb, subject uuid, start_at timestamptz, end_at timestamptz)
returns jsonb language plpgsql stable set search_path='' as $$
declare
  axes jsonb := '[]'; axis jsonb; a jsonb; e jsonb; s jsonb; p jsonb; r jsonb; perf jsonb; part jsonb; parts jsonb;
  roles jsonb; role_entry record; key text; weight numeric; i integer; t timestamptz; day_key text;
  seen text[] := '{}'; seen_sets text[]; seen_drops text[]; day_sets jsonb := '{}';
  unknown_group boolean; eligible integer := 0; unclassified integer := 0; unsupported integer := 0; effort_count integer := 0;
  n numeric; effort_kind text; valid boolean; reps numeric;
begin
  for axis in select value from jsonb_array_elements(private.muscle_volume_taxonomy()) loop
    axes := axes || jsonb_build_array(jsonb_build_object('id',axis->>'id','label',axis->>'label','direct',0,'indirect',0,'equivalent',0,'days',0,'effortCount',0,'rirCount',0,'rirSum',0,'rpeCount',0,'rpeSum',0));
  end loop;
  for a in select value from jsonb_array_elements(private.volume_array(attempts)) loop
    t := private.volume_time(a->>'completedAt');
    if a->>'owner' is distinct from subject::text or jsonb_typeof(a->'id') is distinct from 'string' or coalesce(a->>'id','')='' or t is null or t < start_at or t >= end_at or a->>'id'=any(seen) then continue; end if;
    seen := array_append(seen,a->>'id'); day_key := to_char(t at time zone 'UTC','YYYY-MM-DD');
    for e in select value from jsonb_array_elements(private.volume_array(a->'exercises')) loop
      parts := private.volume_array(e->'catalog'->'muscleParticipations');
      if jsonb_array_length(parts)=0 then
        if coalesce(e->'attribution'->>'primary','')<>'' then parts := jsonb_build_array(jsonb_build_object('muscleGroupId',e->'attribution'->>'primary','role','Principal')); end if;
        for part in select value from jsonb_array_elements(private.volume_array(e->'attribution'->'secondary')) loop
          parts := parts || jsonb_build_array(jsonb_build_object('muscleGroupId',part,'role','Secundario'));
        end loop;
      end if;
      roles := '{}'; unknown_group := jsonb_array_length(parts)=0;
      for part in select value from jsonb_array_elements(parts) loop
        select value->>'id' into key from jsonb_array_elements(private.muscle_volume_taxonomy()) where value->'muscleIds' ? (part->>'muscleGroupId') limit 1;
        if key is null or coalesce(part->>'role','') not in ('Principal','Secundario') then unknown_group := true; continue; end if;
        weight := case when part->>'role'='Principal' then 1 else .5 end;
        roles := jsonb_set(roles,array[key],to_jsonb(greatest(coalesce((roles->>key)::numeric,0),weight)));
      end loop;
      seen_sets := '{}'; seen_drops := '{}';
      for s in select value from jsonb_array_elements(private.volume_array(e->'sets')) loop
        p:=s->'plan'; r:=s->'result'; perf:=r->'performance';
        if jsonb_typeof(p->'id') is distinct from 'string' or p->>'id'=any(seen_sets) then continue; end if;
        seen_sets:=array_append(seen_sets,p->>'id'); reps:=private.volume_number(perf->'reps');
        valid := coalesce(p->>'id','')<>'' and p->>'type' is distinct from 'C' and r->>'setId'=p->>'id' and r->'performed'='true'::jsonb
          and perf->>'mode' in ('external-load','bodyweight','assisted') and perf->>'unit' in ('kg','lb')
          and reps>0 and trunc(reps)=reps and not (perf ? 'durationSeconds')
          and case perf->>'mode'
            when 'external-load' then private.volume_number(perf->'load')>=0
            when 'bodyweight' then private.volume_number(perf->'bodyweight')>0 or (private.volume_number(perf->'bodyweight')=0 and perf->'bodyweightUnspecified'='true'::jsonb)
            when 'assisted' then private.volume_number(perf->'assistance')>=0 else false end;
        if valid is not true then
          if p->>'type' is distinct from 'C' and r->'performed'='true'::jsonb and r->>'setId'=p->>'id' and private.volume_number(perf->'durationSeconds')>0 then unsupported:=unsupported+1; end if;
          continue;
        end if;
        n:=private.volume_number(p->'type');
        if n is not null and trunc(n)<>n and coalesce(p->>'dropGroupId','')='' then unsupported:=unsupported+1; continue; end if;
        if jsonb_typeof(p->'dropGroupId')='string' and p->>'dropGroupId'<>'' then
          if p->>'dropGroupId'=any(seen_drops) then continue; end if;
          seen_drops:=array_append(seen_drops,p->>'dropGroupId');
        end if;
        eligible:=eligible+1; if unknown_group then unclassified:=unclassified+1; end if;
        n:=private.volume_number(r->'actualEffort'->'value'); effort_kind:=null;
        if n=trunc(n) and ((r->'actualEffort'->>'kind'='rir' and n between 0 and 5) or (r->'actualEffort'->>'kind'='rpe' and n between 6 and 10)) then effort_kind:=r->'actualEffort'->>'kind'; effort_count:=effort_count+1; end if;
        for role_entry in select * from jsonb_each_text(roles) loop
          key:=role_entry.key; weight:=role_entry.value::numeric;
          select ordinality::integer-1 into i from jsonb_array_elements(axes) with ordinality where value->>'id'=key;
          axis:=axes->i;
          axis:=jsonb_set(axis,array[case when weight=1 then 'direct' else 'indirect' end],to_jsonb((axis->>case when weight=1 then 'direct' else 'indirect' end)::integer+1));
          axis:=jsonb_set(axis,'{equivalent}',to_jsonb((axis->>'equivalent')::numeric+weight));
          if not (coalesce(day_sets->key,'[]'::jsonb) ? day_key) then
            day_sets:=jsonb_set(day_sets,array[key],coalesce(day_sets->key,'[]'::jsonb)||jsonb_build_array(day_key));
            axis:=jsonb_set(axis,'{days}',to_jsonb((axis->>'days')::integer+1));
          end if;
          if effort_kind is not null then
            axis:=jsonb_set(axis,'{effortCount}',to_jsonb((axis->>'effortCount')::integer+1));
            axis:=jsonb_set(axis,array[effort_kind||'Count'],to_jsonb((axis->>(effort_kind||'Count'))::integer+1));
            axis:=jsonb_set(axis,array[effort_kind||'Sum'],to_jsonb((axis->>(effort_kind||'Sum'))::numeric+n));
          end if;
          axes:=jsonb_set(axes,array[i::text],axis);
        end loop;
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('start',to_char(start_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'end',to_char(end_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'axes',axes,'eligibleSets',eligible,'unclassifiedSets',unclassified,'unsupportedSets',unsupported,'effortCount',effort_count);
end $$;

create or replace function public.get_profile_muscle_volume(target uuid, window_days integer default 28, preview boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.require_actor(); shared boolean; history jsonb; goal_row private.muscle_volume_goals%rowtype; cutoff timestamptz:=date_trunc('milliseconds',now());
begin
  if window_days not in (7,28,90) or window_days is null then raise exception 'invalid volume window'; end if;
  if target is null or (target<>actor and (private.is_blocked_pair(actor,target) or not exists(select 1 from public.relationships where member_low=least(actor,target) and member_high=greatest(actor,target)))) then raise exception 'social profile unavailable'; end if;
  select share_social_muscle_distribution into shared from public.profiles where id=target;
  if not found then raise exception 'profile unavailable'; end if;
  if (target<>actor or preview) and not shared then return null; end if;
  select attempts into history from public.training_states where owner_id=target;
  select * into goal_row from private.muscle_volume_goals where owner_id=target;
  return jsonb_build_object('metricVersion',2,'taxonomyVersion',1,'subjectId',target,'asOf',to_char(cutoff at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'days',window_days,'coverage','unknown',
    'current',private.muscle_volume_period(history,target,cutoff-make_interval(days=>window_days),cutoff),
    'previous',private.muscle_volume_period(history,target,cutoff-make_interval(days=>window_days*2),cutoff-make_interval(days=>window_days)),
    'goals',case when (target=actor and not preview) or goal_row.share_goals then coalesce(goal_row.goals,'{}') else '{}'::jsonb end,
    'shareGoals',coalesce(goal_row.share_goals,false));
end $$;

create or replace function public.save_muscle_volume_goals(goals_input jsonb, share_input boolean)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.require_actor(); entry record;
begin
  if jsonb_typeof(goals_input) is distinct from 'object' or share_input is null then raise exception 'invalid goals'; end if;
  for entry in select * from jsonb_each(goals_input) loop
    if not exists(select 1 from jsonb_array_elements(private.muscle_volume_taxonomy()) where value->>'id'=entry.key)
      or private.volume_number(entry.value) is null or private.volume_number(entry.value) not between 0 and 100 then raise exception 'invalid goal'; end if;
  end loop;
  insert into private.muscle_volume_goals(owner_id,goals,share_goals) values(actor,goals_input,share_input)
  on conflict(owner_id) do update set goals=excluded.goals,share_goals=excluded.share_goals;
end $$;

-- Preserve existing insight privacy gates; replace only the obsolete projection.
do $$ begin
  if to_regprocedure('public.get_social_profile_insights_before_volume(uuid)') is null then
    alter function public.get_social_profile_insights(uuid) rename to get_social_profile_insights_before_volume;
  end if;
end $$;
revoke all on function public.get_social_profile_insights_before_volume(uuid) from public, anon, authenticated;
create or replace function public.get_social_profile_insights(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; volume jsonb;
begin
  result:=public.get_social_profile_insights_before_volume(target)-'muscle_distribution';
  volume:=public.get_profile_muscle_volume(target,28,false);
  if volume is not null then
    result:=result||jsonb_build_object('muscle_volume',volume,'muscle_distribution',(select jsonb_agg(jsonb_build_object('id',value->>'id','label',value->>'label','value',(value->>'equivalent')::numeric/4) order by ordinality) from jsonb_array_elements(volume->'current'->'axes') with ordinality));
  end if;
  return result;
end $$;
-- Rebind the batch SQL body to the new function after the rename.
create or replace function public.list_social_profile_insights(targets uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(candidate.id::text,public.get_social_profile_insights(candidate.id)),'{}'::jsonb)
  from (select distinct t.id from unnest(coalesce(targets,'{}'::uuid[])) t(id) join public.relationships r on r.member_low=least(public.require_actor(),t.id) and r.member_high=greatest(public.require_actor(),t.id) where t.id<>public.require_actor() and not private.is_blocked_pair(public.require_actor(),t.id) limit 50) candidate
$$;
revoke all on function public.get_profile_muscle_volume(uuid,integer,boolean),public.save_muscle_volume_goals(jsonb,boolean),public.get_social_profile_insights(uuid) from public,anon;
grant execute on function public.get_profile_muscle_volume(uuid,integer,boolean),public.save_muscle_volume_goals(jsonb,boolean),public.get_social_profile_insights(uuid) to authenticated;
revoke all on function private.muscle_volume_taxonomy(),private.volume_array(jsonb),private.volume_number(jsonb),private.volume_time(text),private.muscle_volume_period(jsonb,uuid,timestamptz,timestamptz) from public,anon,authenticated;
notify pgrst,'reload schema';
