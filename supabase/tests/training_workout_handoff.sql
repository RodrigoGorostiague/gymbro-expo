begin;
select plan(23);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('90000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000000','authenticated','authenticated','handoff@test.invalid','',now(),'{}','{}',now(),now());
insert into public.profiles(id,alias) values ('90000000-0000-0000-0000-000000000093','Handoff');
select ok(not has_function_privilege('anon','public.start_training_workout(jsonb)','execute'),'anonymous cannot start');
select ok(not has_function_privilege('authenticated','public.save_training_state_before_handoff(jsonb,jsonb,jsonb,jsonb,boolean)','execute'),'legacy implementation is private');
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000093',true);
create function pg_temp.handoff_draft(id text) returns jsonb language sql as $$
select jsonb_build_object('version',1,'owner',public.require_actor(),'attemptId',id,'routineId','r','startedAtMs',1,'restTimerSeconds',30,'completedSets','{}'::jsonb,'setValues','{}'::jsonb,'routineSnapshot',jsonb_build_object('id','r','name','Handoff','exercises','[]'::jsonb))
$$;
select is(public.start_training_workout(pg_temp.handoff_draft('first'))->>'status','started','first start creates owner row');
select is(public.start_training_workout(pg_temp.handoff_draft('second'))->'draft'->>'attemptId','first','second start returns existing');
select throws_ok($$select public.start_training_workout(pg_temp.handoff_draft('other') || '{"owner":"90000000-0000-0000-0000-000000000099"}')$$,'22023','invalid workout start input','foreign owner rejected');
select throws_ok($$select public.save_training_state(active_workout_draft_input=>pg_temp.handoff_draft('other'),active_workout_draft_supplied=>true)$$,'40001','active workout already exists','legacy writer cannot replace attempt');
select throws_ok($$select public.save_training_state(active_workout_draft_input=>pg_temp.handoff_draft('first') || '{"restTimerSeconds":90}',active_workout_draft_supplied=>true)$$,'40001','solo workout requires compare-and-swap','same attempt blind overwrite rejected');
select throws_ok($$select public.save_training_state(active_workout_draft_input=>null,active_workout_draft_supplied=>true)$$,'40001','solo workout requires compare-and-swap','blind cancellation rejected');
select lives_ok($$select public.save_training_state(definitions_input=>'[]')$$,'unrelated library mutations remain available');
select is(public.sync_offline_workout(pg_temp.handoff_draft('first'), pg_temp.handoff_draft('first') || '{"restTimerSeconds":60}')->>'status','saved','CAS can update managed workout');
select is(public.sync_offline_workout(pg_temp.handoff_draft('first'), pg_temp.handoff_draft('first') || '{"restTimerSeconds":70}')->>'status','conflict','stale cross-device write conflicts');
select is(public.sync_offline_workout(pg_temp.handoff_draft('first') || '{"restTimerSeconds":60}',null)->>'status','saved','CAS cancellation works');
select throws_ok($$select public.save_training_state(active_workout_draft_input=>pg_temp.handoff_draft('first'),active_workout_draft_supplied=>true)$$,'40001','solo workout requires compare-and-swap','managed flag survives clear and prevents resurrection');
select throws_ok($$select public.save_training_state(active_workout_draft_input=>pg_temp.handoff_draft('fake') || '{"jointWorkoutId":"fake"}',active_workout_draft_supplied=>true)$$,'42501','active joint membership required','fake joint cannot bypass flag');
select is(public.start_training_workout(pg_temp.handoff_draft('third'))->>'status','started','start works after cancellation');
select throws_ok($$select public.sync_offline_workout(null,pg_temp.handoff_draft('third'))$$,'22023','invalid offline workout input','CAS still requires non-null expected draft');
select throws_ok($$select public.start_training_workout(pg_temp.handoff_draft('bad') - 'routineSnapshot')$$,'22023','invalid workout start input','snapshot required');
select is(public.load_training_state()->'activeWorkoutDraft',pg_temp.handoff_draft('third'),'rejections preserve exact canonical payload');
create function pg_temp.handoff_attempt(id text) returns jsonb language sql as $$
select jsonb_build_object('version',1,'id',id,'owner',public.require_actor(),'routineId','r','recordedRoutineName','Handoff','completedAt','2026-09-10T12:00:00Z','durationSeconds',60,'restTimerSeconds',30,
'exercises',jsonb_build_array(jsonb_build_object('exerciseId','e','recordedName','Press','sets',jsonb_build_array(jsonb_build_object('plan',jsonb_build_object('id','s'),'result',jsonb_build_object('setId','s','performed',true,'performance',jsonb_build_object('mode','external-load','reps',8,'load',20,'unit','kg')))))), 'completion','{}'::jsonb,'reward','{}'::jsonb,'rewardApplication','{}'::jsonb)
$$;
select is(public.sync_offline_workout(pg_temp.handoff_draft('third'),pg_temp.handoff_draft('third') || jsonb_build_object('pendingFinalization',jsonb_build_object('attempt',pg_temp.handoff_attempt('third'))),pg_temp.handoff_attempt('third'))->>'status','saved','managed workout finalizes through CAS');
select throws_ok($$select public.save_training_state(active_workout_draft_input=>pg_temp.handoff_draft('third'),active_workout_draft_supplied=>true)$$,'40001','solo workout requires compare-and-swap','managed flag survives finalization');
select throws_ok($$select public.start_training_workout(pg_temp.handoff_draft('third'))$$,'22023','workout attempt already completed','completed ID cannot start again');
select is(public.start_training_workout(pg_temp.handoff_draft('fourth'))->>'status','started','new start after finalization');
select throws_ok($$select public.save_training_state(active_workout_draft_input=>pg_temp.handoff_draft('fourth') || jsonb_build_object('pendingFinalization',jsonb_build_object('attempt',pg_temp.handoff_attempt('fourth'))),active_workout_draft_supplied=>true)$$,'40001','solo workout requires compare-and-swap','blind pending finalization cannot bypass CAS');
select * from finish();
rollback;
