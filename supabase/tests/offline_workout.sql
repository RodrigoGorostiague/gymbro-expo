begin;
select plan(19);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('90000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000000','authenticated','authenticated','offline@test.invalid','',now(),'{}','{}',now(),now());
insert into public.profiles(id,alias) values ('90000000-0000-0000-0000-000000000091','Offline');
select ok(not has_function_privilege('anon','public.sync_offline_workout(jsonb,jsonb,jsonb)','execute'),'anonymous cannot sync');
select ok(not has_function_privilege('authenticated','public.finalize_training_attempt_before_offline(jsonb)','execute'),'internal finalizer is private');
select ok(has_function_privilege('authenticated','public.sync_offline_workout(jsonb,jsonb,jsonb)','execute'),'authenticated can sync');
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000091',true);
select is(public.offline_workout_capability(),1,'capability available');
create function pg_temp.offline_draft(id text, weight text default '20') returns jsonb language sql as $$
select jsonb_build_object('version',1,'owner',public.require_actor(),'attemptId',id,'routineId','r','startedAtMs',1,'restTimerSeconds',30,'completedSets','{}'::jsonb,'setValues',jsonb_build_object('e-s',jsonb_build_object('weight',weight,'reps','8')))
$$;
create function pg_temp.offline_attempt(id text) returns jsonb language sql as $$
select jsonb_build_object('version',1,'id',id,'owner',public.require_actor(),'routineId','r','recordedRoutineName','Offline','completedAt','2026-09-09T12:00:00Z','durationSeconds',60,'restTimerSeconds',30,
'exercises',jsonb_build_array(jsonb_build_object('exerciseId','e','recordedName','Press','sets',jsonb_build_array(jsonb_build_object('plan',jsonb_build_object('id','s'),'result',jsonb_build_object('setId','s','performed',true,'performance',jsonb_build_object('mode','external-load','reps',8,'load',20,'unit','kg')))))), 'completion','{}'::jsonb,'reward','{}'::jsonb,'rewardApplication','{}'::jsonb)
$$;
select public.save_training_state(active_workout_draft_input=>pg_temp.offline_draft('a'),active_workout_draft_supplied=>true);
select is(public.sync_offline_workout(pg_temp.offline_draft('a'),pg_temp.offline_draft('a','25'))->>'status','saved','CAS saves current owner');
select is(public.sync_offline_workout(pg_temp.offline_draft('a'),pg_temp.offline_draft('a','25'))->>'status','saved','lost acknowledgment retry is idempotent');
select is(public.sync_offline_workout(pg_temp.offline_draft('a'),pg_temp.offline_draft('a','30'))->>'status','conflict','stale base does not overwrite');
select is(public.sync_offline_workout(pg_temp.offline_draft('a'),null)->>'status','conflict','null cannot blindly clear a changed draft');
select throws_ok($$select public.sync_offline_workout(pg_temp.offline_draft('a'),pg_temp.offline_draft('a') || '{"owner":"90000000-0000-0000-0000-000000000092"}'::jsonb)$$,'22023','invalid offline workout input','foreign owner rejected');
select is(public.sync_offline_workout(pg_temp.offline_draft('a','25'),pg_temp.offline_draft('a','25') || jsonb_build_object('pendingFinalization',jsonb_build_object('attempt',pg_temp.offline_attempt('a'))),pg_temp.offline_attempt('a'))->>'status','saved','finalizes atomically');
select public.save_training_state(active_workout_draft_input=>pg_temp.offline_draft('b'),active_workout_draft_supplied=>true);
select is(public.sync_offline_workout(pg_temp.offline_draft('a','25'),pg_temp.offline_draft('a','25') || jsonb_build_object('pendingFinalization',jsonb_build_object('attempt',pg_temp.offline_attempt('a'))),pg_temp.offline_attempt('a'))->'finalized'->'attempt'->>'id','a','ambiguous completion returns same attempt');
select is(public.load_training_state()->'activeWorkoutDraft'->>'attemptId','b','retry preserves different active draft');
select public.finalize_training_attempt(pg_temp.offline_attempt('c'));
select is(public.load_training_state()->'activeWorkoutDraft'->>'attemptId','b','legacy finalization also preserves different draft');
select is(public.sync_offline_workout(pg_temp.offline_draft('b'),null)->>'status','saved','matching cancellation clears only its draft');
select is(public.sync_offline_workout(pg_temp.offline_draft('b'),null)->>'status','saved','lost cancellation acknowledgment is safe');
reset role;
select is((select count(*) from public.reward_attempts where owner_id='90000000-0000-0000-0000-000000000091' and attempt_id='a'),1::bigint,'one reward attempt');
select is((select count(*) from public.experience_receipts where owner_id='90000000-0000-0000-0000-000000000091' and attempt_id='a'),1::bigint,'one XP receipt');
insert into public.joint_workouts(id,initiator_id,suggested_routine) values ('90000000-0000-0000-0001-000000000091','90000000-0000-0000-0000-000000000091','{"name":"Upper","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":80,"reps":8}]}]}');
insert into public.workout_start_activities(author_id,routine_name,expires_at,attempt_id,joint_workout_id) values ('90000000-0000-0000-0000-000000000091','Upper',now()+interval '1 hour','associated','90000000-0000-0000-0001-000000000091');
set local role authenticated;
select public.save_training_state(active_workout_draft_input=>pg_temp.offline_draft('associated'),active_workout_draft_supplied=>true);
select throws_ok($$select public.sync_offline_workout(pg_temp.offline_draft('associated'),null)$$,'22023','offline joint workout is not supported','associated cancellation rejected even with unchanged draft');
select is(public.load_training_state()->'activeWorkoutDraft'->>'attemptId','associated','associated cancellation preserves draft');
select * from finish();
rollback;
