begin;
select plan(25);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('90000000-0000-0000-0000-000000000095','00000000-0000-0000-0000-000000000000','authenticated','authenticated','records@test.invalid','',now(),'{}','{}',now(),now());
insert into public.profiles(id,alias) values ('90000000-0000-0000-0000-000000000095','Records');
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000095',true);
create function pg_temp.record_attempt(id text, at_time text, weights jsonb, repetitions jsonb) returns jsonb language sql as $$
select jsonb_build_object('version',1,'id',id,'owner',public.require_actor(),'routineId','r','recordedRoutineName','Records','completedAt',at_time,'durationSeconds',60,'restTimerSeconds',30,
'exercises',jsonb_build_array(jsonb_build_object('exerciseId','e','variant','Barra','recordedName','Press','sets',
(select jsonb_agg(jsonb_build_object('plan',jsonb_build_object('id','s'||i,'type',i+1),'result',jsonb_build_object('setId','s'||i,'performed',true,'performance',jsonb_build_object('mode','external-load','reps',repetitions->i,'load',weights->i,'unit','kg')))) from generate_series(0,jsonb_array_length(weights)-1) i))),
'completion','{}'::jsonb,'reward','{}'::jsonb,'rewardApplication','{}'::jsonb)
$$;
select public.finalize_training_attempt(pg_temp.record_attempt('base','2026-09-01T12:00:00Z','[20,30]','[8,6]'));
select is(jsonb_array_length(public.get_record_gem_rewards('base')),0,'first marks earn no record gems');
select public.finalize_training_attempt(pg_temp.record_attempt('new','2026-09-02T12:00:00Z','[25,30]','[8,8]'));
select is(jsonb_array_length(public.get_record_gem_rewards('new')),3,'three types earned');
select is((select sum(amount) from public.reward_ledger_entries where attempt_id='new' and kind='contextual_record'),75::bigint,'25 gems per type');
select public.finalize_training_attempt(pg_temp.record_attempt('new','2026-09-02T12:00:00Z','[999,999]','[999,999]'));
select is(jsonb_array_length(public.get_record_gem_rewards('new')),3,'retry cannot mint again or change evidence');
select is((public.get_record_gem_rewards('new')->0->>'amount')::integer,25,'immutable receipt amount');
select public.finalize_training_attempt(pg_temp.record_attempt('tie','2026-09-03T12:00:00Z','[25,30]','[8,8]'));
select is(jsonb_array_length(public.get_record_gem_rewards('tie')),0,'ties do not earn');
-- Several matching rep partitions improve: load still pays only once.
select public.finalize_training_attempt(pg_temp.record_attempt('multi','2026-09-04T12:00:00Z','[40,40]','[6,8]'));
select is((select count(*) from public.reward_ledger_entries where attempt_id='multi' and breakdown->>'recordType'='load'),1::bigint,'multiple load partitions pay once');
select ok((select sum(amount)<=75 from public.reward_ledger_entries where attempt_id='multi' and kind='contextual_record'),'group max 75');
-- Editable history cannot lower immutable reward baselines.
update public.training_states set attempts='[]' where owner_id=public.require_actor();
select public.finalize_training_attempt(pg_temp.record_attempt('after-edit','2026-09-05T12:00:00Z','[25,30]','[8,8]'));
select is(jsonb_array_length(public.get_record_gem_rewards('after-edit')),0,'deleting editable history cannot farm records');
select is(jsonb_array_length(public.get_record_gem_rewards('new')),3,'awarded evidence survives history deletion');
select public.finalize_training_attempt(jsonb_set(pg_temp.record_attempt('unknown','2026-09-06T12:00:00Z','[999]','[99]'),'{exercises,0,variant}','null'));
select is(jsonb_array_length(public.get_record_gem_rewards('unknown')),0,'unknown variant excluded');
select public.finalize_training_attempt(jsonb_set(pg_temp.record_attempt('warmup','2026-09-06T12:00:00Z','[999]','[99]'),'{exercises,0,sets,0,plan,type}','"C"'));
select is(jsonb_array_length(public.get_record_gem_rewards('warmup')),0,'warmup excluded');
select public.finalize_training_attempt(pg_temp.record_attempt('future','2999-09-06T12:00:00Z','[999]','[99]'));
select is(jsonb_array_length(public.get_record_gem_rewards('future')),0,'future timestamps do not earn');
select ok(not has_function_privilege('authenticated','private.contextual_record_improvements(uuid,jsonb)','execute'),'calculator cannot be called by clients');
select ok(not has_function_privilege('anon','public.get_record_gem_rewards(text)','execute'),'anonymous cannot read');
select ok(not has_function_privilege('authenticated','public.finalize_training_attempt_before_record_gems(jsonb)','execute'),'old finalizer is private');
-- Pre-policy completion must not acquire a reward on replay.
select public.finalize_training_attempt_before_record_gems(pg_temp.record_attempt('legacy','2026-09-07T12:00:00Z','[100]','[8]'));
select public.finalize_training_attempt(pg_temp.record_attempt('legacy','2026-09-07T12:00:00Z','[100]','[8]'));
select is(jsonb_array_length(public.get_record_gem_rewards('legacy')),0,'no historical backfill on replay');
select is((select count(*) from private.contextual_record_scores(jsonb_set(pg_temp.record_attempt('invalid','2026-09-07T12:00:00Z','[-1]','[8]'),'{exercises,0,sets,0,result,performed}','false'))),0::bigint,'unperformed/invalid sets excluded');
select is((select count(*) from private.contextual_record_scores(jsonb_set(pg_temp.record_attempt('mode','2026-09-07T12:00:00Z','[50]','[8]'),'{exercises,0,sets,0,result,performance,mode}','"assisted"'))),0::bigint,'assisted mode excluded');
select is((select count(*) from private.contextual_record_improvements(public.require_actor(),pg_temp.record_attempt('backdate','2026-09-02T13:00:00Z','[50]','[8]'))),0::bigint,'backdating cannot repeat already beaten immutable mark');
select is((select count(*) from private.contextual_record_improvements(public.require_actor(),jsonb_set(pg_temp.record_attempt('variant','2026-09-08T12:00:00Z','[1000]','[8]'),'{exercises,0,variant}','"Mancuernas"'))),0::bigint,'new variant is a first mark');
-- Offline synchronization enters the same authoritative finalizer; lost replies replay safely.
create function pg_temp.record_draft() returns jsonb language sql as $$
select jsonb_build_object('version',1,'owner',public.require_actor(),'attemptId','offline','routineId','r','startedAtMs',1,'restTimerSeconds',30,'completedSets','{}'::jsonb,'setValues','{}'::jsonb)
$$;
select public.save_training_state(active_workout_draft_input=>pg_temp.record_draft(),active_workout_draft_supplied=>true);
select is(public.sync_offline_workout(pg_temp.record_draft(),pg_temp.record_draft() || jsonb_build_object('pendingFinalization',jsonb_build_object('attempt',pg_temp.record_attempt('offline','2026-09-09T12:00:00Z','[110]','[8]'))),pg_temp.record_attempt('offline','2026-09-09T12:00:00Z','[110]','[8]'))->>'status','saved','offline synchronization finalizes');
select is(jsonb_array_length(public.get_record_gem_rewards('offline')),2,'offline completion earns load and volume');
select public.sync_offline_workout(pg_temp.record_draft(),pg_temp.record_draft() || jsonb_build_object('pendingFinalization',jsonb_build_object('attempt',pg_temp.record_attempt('offline','2026-09-09T12:00:00Z','[110]','[8]'))),pg_temp.record_attempt('offline','2026-09-09T12:00:00Z','[110]','[8]'));
select is(jsonb_array_length(public.get_record_gem_rewards('offline')),2,'lost offline acknowledgment cannot mint again');
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000096',true);
select is(jsonb_array_length(public.get_record_gem_rewards('new')),0,'other owner cannot read awards');
select * from finish();
rollback;
