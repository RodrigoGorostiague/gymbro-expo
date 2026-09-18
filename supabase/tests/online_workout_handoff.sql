begin;
select no_plan();
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('90000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000000','authenticated','authenticated','online@test.invalid','',now(),'{}','{}',now(),now());
insert into public.profiles(id,alias) values ('90000000-0000-0000-0000-000000000093','Online');
select ok(not has_function_privilege('anon','public.claim_online_workout(jsonb)','execute'),'anonymous claim denied');
select ok(not has_function_privilege('authenticated','public.finalize_training_attempt_before_online(jsonb)','execute'),'full reward chain internal only');
select ok(not has_function_privilege('authenticated','public.sync_offline_workout_before_online(jsonb,jsonb,jsonb)','execute'),'offline old implementation private');
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000093',true);
create function pg_temp.handoff_draft(id text) returns jsonb language sql as $$
select jsonb_build_object('version',1,'owner',public.require_actor(),'attemptId',id,'routineId','r','startedAtMs',1,'restTimerSeconds',30,'completedSets','{}'::jsonb,'setValues','{}'::jsonb,'routineSnapshot',jsonb_build_object('id','r','name','Handoff','exercises','[]'::jsonb))
$$;
create function pg_temp.handoff_attempt(id text) returns jsonb language sql as $$
select jsonb_build_object('version',1,'id',id,'owner',public.require_actor(),'routineId','r','recordedRoutineName','Handoff','completedAt','2026-09-10T12:00:00Z','durationSeconds',60,'restTimerSeconds',30,
'exercises',jsonb_build_array(jsonb_build_object('exerciseId','e','recordedName','Press','sets',jsonb_build_array(jsonb_build_object('plan',jsonb_build_object('id','s'),'result',jsonb_build_object('setId','s','performed',true,'performance',jsonb_build_object('mode','external-load','reps',8,'load',20,'unit','kg')))))), 'completion','{}'::jsonb,'reward','{}'::jsonb,'rewardApplication','{}'::jsonb)
$$;

select is(public.online_workout_capability(),1,'online capability available');
select is(public.start_training_workout(pg_temp.handoff_draft('online'))->>'status','started','start solo');
select throws_ok($$select public.claim_online_workout(pg_temp.handoff_draft('online') || '{"owner":"90000000-0000-0000-0000-000000000099"}')$$,'22023','invalid online claim input','foreign owner rejected');
select is(public.claim_online_workout(pg_temp.handoff_draft('online'))->'draft'->>'transportMode','online','claim stores explicit mode');
select is(public.claim_online_workout(pg_temp.handoff_draft('online'))->>'status','claimed','lost claim response retry safe');
create function pg_temp.online_draft(id text) returns jsonb language sql as $$select pg_temp.handoff_draft(id)||'{"transportMode":"online"}'::jsonb$$;
select is(public.sync_offline_workout(pg_temp.handoff_draft('online'),pg_temp.handoff_draft('online')||'{"restTimerSeconds":90}')->>'status','conflict','old offline pending command not reinterpreted');
select throws_ok($$select public.save_training_state(active_workout_draft_input=>null,active_workout_draft_supplied=>true)$$,'40001','claimed workout requires online compare-and-swap','legacy cannot clear');
select throws_ok($$select public.finalize_training_attempt(pg_temp.handoff_attempt('online'))$$,'40001','claimed workout requires online compare-and-swap','public finalizer cannot bypass CAS');
select throws_ok($$select public.save_training_state(attempts_input=>jsonb_build_array(pg_temp.handoff_attempt('online')))$$,'40001','claimed attempt collection is immutable','collection finalization bypass denied');
select is(public.sync_online_workout(pg_temp.online_draft('online'),pg_temp.online_draft('online')||'{"restTimerSeconds":60}')->>'status','saved','online CAS updates');
select is(public.sync_online_workout(pg_temp.online_draft('online'),pg_temp.online_draft('online')||'{"restTimerSeconds":70}')->>'status','conflict','second same-base writer conflicts');
select is(public.claim_online_workout(pg_temp.handoff_draft('online'))->>'status','conflict','stale claim cannot erase subsequent updates');
select is(public.sync_online_workout(pg_temp.online_draft('online'),pg_temp.online_draft('online')||'{"restTimerSeconds":60}')->>'status','saved','exact next idempotent');
select throws_ok($$select public.sync_online_workout(pg_temp.online_draft('online')||'{"restTimerSeconds":60}',pg_temp.online_draft('online')||'{"routineId":"other"}')$$,'22023','online workout identity changed','routine identity immutable');
select is(public.sync_online_workout(pg_temp.online_draft('online')||'{"restTimerSeconds":60}',pg_temp.online_draft('online')||'{"restTimerSeconds":60,"jointWorkoutId":"90000000-0000-0000-0000-000000000001"}')->>'status','conflict','forged group rejected');
select is(public.sync_online_workout(pg_temp.online_draft('online')||'{"restTimerSeconds":60}',null)->>'cancelled','true','atomic cancel');
select is(public.start_training_workout(pg_temp.handoff_draft('later'))->>'status','started','new session after cancel');
select is(public.sync_online_workout(pg_temp.online_draft('online')||'{"restTimerSeconds":60}',null)->>'cancelled','true','cancel retry returns terminal receipt');
select is(public.load_training_state()->'activeWorkoutDraft'->>'attemptId','later','cancel retry preserves new session');
select throws_ok($$select public.start_training_workout(pg_temp.handoff_draft('online'))$$,'22023','online workout attempt cannot restart','cancelled ID tombstoned');
select is(public.sync_offline_workout(pg_temp.handoff_draft('later'),null)->>'status','saved','unclaimed offline preserved');
select is(public.start_training_workout(pg_temp.handoff_draft('final'))->>'status','started','new finalization session');
select is(public.claim_online_workout(pg_temp.handoff_draft('final'))->>'status','claimed','claim finalization session');
create function pg_temp.final_draft() returns jsonb language sql as $$select pg_temp.online_draft('final')||jsonb_build_object('pendingFinalization',jsonb_build_object('attempt',pg_temp.handoff_attempt('final')))$$;
select is(public.sync_online_workout(pg_temp.online_draft('final'),pg_temp.final_draft(),pg_temp.handoff_attempt('final'))->>'status','saved','online finalization full chain');
select ok(public.sync_online_workout(pg_temp.online_draft('final'),pg_temp.final_draft(),pg_temp.handoff_attempt('final'))->'finalized' ? 'experience_receipt','retry retains XP receipt');
select is(public.start_training_workout(pg_temp.handoff_draft('newer'))->>'status','started','new session after finalization');
select is(public.sync_online_workout(pg_temp.online_draft('final'),pg_temp.final_draft(),pg_temp.handoff_attempt('final'))->>'status','saved','finalization exact retry');
select is(public.load_training_state()->'activeWorkoutDraft'->>'attemptId','newer','final retry preserves newer session');
select is(public.sync_online_workout(pg_temp.online_draft('final'),pg_temp.final_draft(),pg_temp.handoff_attempt('final')||'{"durationSeconds":10}')->>'status','conflict','terminal altered capture rejected');

-- Real social RPCs establish and merge canonical groups across three claimed attempts.
set local role postgres;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,'',now(),'{}','{}',now(),now()
from (values ('90000000-0000-0000-0000-000000000094','online-b@test.invalid'),('90000000-0000-0000-0000-000000000095','online-c@test.invalid')) v(id,email);
insert into public.profiles(id,alias) values('90000000-0000-0000-0000-000000000094','Online B'),('90000000-0000-0000-0000-000000000095','Online C');
insert into public.relationships(member_low,member_high,kind) values
('90000000-0000-0000-0000-000000000093','90000000-0000-0000-0000-000000000094','bro'),
('90000000-0000-0000-0000-000000000094','90000000-0000-0000-0000-000000000095','bro');
set local role authenticated;
select public.claim_online_workout(pg_temp.handoff_draft('newer'));
select public.publish_workout_start_activity('{"routine_name":"Handoff","attempt_id":"newer"}');
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000094',true);
select public.start_training_workout(pg_temp.handoff_draft('group-b'));
select public.claim_online_workout(pg_temp.handoff_draft('group-b'));
select public.publish_workout_start_activity('{"routine_name":"Handoff","attempt_id":"group-b"}');
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000095',true);
select public.start_training_workout(pg_temp.handoff_draft('group-c'));
select public.claim_online_workout(pg_temp.handoff_draft('group-c'));
select public.publish_workout_start_activity('{"routine_name":"Handoff","attempt_id":"group-c"}');
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000093',true);
select set_config('test.first_group',public.invite_active_workout_member('90000000-0000-0000-0000-000000000094','{"name":"Handoff","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":20,"reps":8}]}]}')::text,true);
select is(public.sync_online_workout(pg_temp.online_draft('newer'),pg_temp.online_draft('newer')||jsonb_build_object('jointWorkoutId',current_setting('test.first_group')))->>'status','saved','claimed solo transitions to proven canonical group');
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000094',true);
select lives_ok($$select public.respond_joint_workout_invite(current_setting('test.first_group')::uuid,true)$$,'second client accepts real invitation');
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000095',true);
select set_config('test.merged_group',public.invite_active_workout_member('90000000-0000-0000-0000-000000000094','{"name":"Handoff","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":20,"reps":8}]}]}')::text,true);
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000094',true);
select lives_ok($$select public.respond_joint_workout_invite(current_setting('test.merged_group')::uuid,true)$$,'acceptance merges entire active source group');
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000093',true);
select is(public.resolve_joint_workout_attempt('newer')::text,current_setting('test.merged_group'),'attempt resolves merged canonical group');
select is(public.sync_online_workout(pg_temp.online_draft('newer')||jsonb_build_object('jointWorkoutId',current_setting('test.first_group')),pg_temp.online_draft('newer')||jsonb_build_object('jointWorkoutId',current_setting('test.first_group'),'restTimerSeconds',60))->>'status','conflict','stale group edit conflicts rather than silently rewriting capture');
select is(public.sync_online_workout(pg_temp.online_draft('newer')||jsonb_build_object('jointWorkoutId',current_setting('test.first_group')),pg_temp.online_draft('newer')||jsonb_build_object('jointWorkoutId',current_setting('test.merged_group')))->>'status','saved','clean client adopts canonical merge');
select is(public.sync_online_workout(pg_temp.online_draft('newer')||jsonb_build_object('jointWorkoutId',current_setting('test.merged_group')),null)->>'cancelled','true','canonical group leave and cancellation atomic');
set local role postgres;
select is((select status::text from public.joint_workout_participants where participant_id='90000000-0000-0000-0000-000000000093' and joint_workout_id=current_setting('test.merged_group')::uuid),'declined','cancel leaves actual canonical group');
select * from finish();
rollback;
