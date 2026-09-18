begin;
select plan(30);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('62000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','review1@test.invalid','',now(),'{}','{}',now(),now()),
('62000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','review2@test.invalid','',now(),'{}','{}',now(),now());
insert into public.profiles(id,alias) values ('62000000-0000-0000-0000-000000000001','Review Owner'),('62000000-0000-0000-0000-000000000002','Other Owner');
insert into public.exercises(id,canonical_name) values ('EX-6201','Press'),('EX-6202','Remo');
create function pg_temp.attempt(attempt_id text, at_time text, improved boolean)
returns jsonb language sql as $$
select jsonb_build_object('version',1,'id',attempt_id,'owner',public.require_actor(),'routineId','r','recapPublicationKey','key-' || attempt_id,
  'recordedRoutineName','Upper','completedAt',at_time,'durationSeconds',120,'restTimerSeconds',60,
  'completion','{}'::jsonb,'reward','{}'::jsonb,'rewardApplication','{}'::jsonb,
  'exercises',(select jsonb_agg(jsonb_build_object('exerciseId',eid,'variant','Barra','recordedName',eid,
    'sets',jsonb_build_array(
      jsonb_build_object('plan',jsonb_build_object('id',eid || '-a','type',1),'result',jsonb_build_object('setId',eid || '-a','performed',true,'performance',jsonb_build_object('mode','external-load','unit','kg','load',case when improved then 25 else 20 end,'reps',8))),
      jsonb_build_object('plan',jsonb_build_object('id',eid || '-b','type',1),'result',jsonb_build_object('setId',eid || '-b','performed',true,'performance',jsonb_build_object('mode','external-load','unit','kg','load',30,'reps',case when improved then 6 else 5 end)))
    ))) from unnest(array['EX-6201','EX-6202']) eid));
$$;
create function pg_temp.recap(key_input text) returns jsonb language sql as $$
select jsonb_build_object('routine_name','Upper','completed_at','2026-09-02T12:00:00Z','duration_seconds',120,'exercise_count',0,'metrics','{}'::jsonb,'publication_key',key_input,'exercise_details','{"exercises":[]}'::jsonb);
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.finalize_training_attempt(pg_temp.attempt('base','2026-09-01T12:00:00Z',false))$$,'baseline finalizes');
select lives_ok($$select public.finalize_training_attempt(pg_temp.attempt('new','2026-09-02T12:00:00Z',true))$$,'record session finalizes and awards independently');
select is(jsonb_array_length(public.get_workout_completion_preview('new')->'records'),6,'all six load, reps and volume records are available');
select is((public.get_workout_completion_preview('new')->>'review_required')::boolean,true,'review required before publication');
select is(jsonb_array_length(public.get_workout_completion_preview('new')->'activities'),0,'records are not public before selection');
select is((select count(*) from jsonb_array_elements(public.get_workout_completion_preview('new')->'records') item where (item->>'selected')::boolean),0::bigint,'no records preselected');
select throws_ok($$select public.create_workout_recap(pg_temp.recap('key-new'))$$,'P0001','workout publication requires review','old auto publisher cannot bypass review');
select is(public.stage_workout_completion('new',pg_temp.recap('key-new')),true,'prepares execution without publishing');
select is(public.get_workout_completion_preview('new')->'recap'->>'id','preview:new','preview is explicitly a draft');
select throws_ok($$select public.confirm_workout_completion('new',array['ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid])$$,'P0001','invalid record selection','rejects invented record IDs atomically');
select is((public.get_workout_completion_preview('new')->>'review_required')::boolean,true,'invalid choice does not close review');
create temporary table chosen as select array_agg((item->>'id')::uuid) ids from (select item from jsonb_array_elements(public.get_workout_completion_preview('new')->'records') item limit 2) selected;
select lives_ok($$select public.confirm_workout_completion('new',(select ids from chosen))$$,'selected records and execution publish atomically');
select is(jsonb_array_length(public.get_workout_completion_preview('new')->'activities'),2,'only selected records published');
select is(public.get_workout_completion_preview('new')->>'status','published','execution published according to profile');
select lives_ok($$select public.confirm_workout_completion('new',array[]::uuid[])$$,'retry with different selection returns original result');
select is(jsonb_array_length(public.get_workout_completion_preview('new')->'activities'),2,'retry cannot duplicate or change records');
select is(jsonb_array_length(public.get_record_gem_rewards('new')),6,'publishing only two records does not remove six rewards');
select is(public.stage_workout_completion('base',pg_temp.recap('key-base')),true,'session without records prepares normally');
select lives_ok($$select public.confirm_workout_completion('base',array[]::uuid[])$$,'zero selected records still publishes the execution');
select public.finalize_training_attempt(pg_temp.attempt('private','2026-09-03T12:00:00Z',false));
select public.stage_workout_completion('private',pg_temp.recap('key-private'));
set local role postgres;
update public.profiles set auto_share_completed_workouts=false where id='62000000-0000-0000-0000-000000000001';
set local role authenticated;
select lives_ok($$select public.confirm_workout_completion('private',array[]::uuid[])$$,'disabled sharing finishes without asking for an override');
select is(public.get_workout_completion_preview('private')->>'status','private','profile privacy respected');
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000002',true);
select is(jsonb_array_length(public.get_workout_completion_preview('new')->'records'),0,'other account cannot read draft records');
select throws_ok($$select public.confirm_workout_completion('new',(select ids from chosen))$$,'P0001','completion review unavailable','other account cannot publish the review');
select is(jsonb_array_length(public.list_pending_workout_reviews()),0,'pending list is owner scoped');
select throws_ok($$select public.stage_workout_completion('unconfirmed',pg_temp.recap('unknown'))$$,'P0001','completion not confirmed','unconfirmed offline attempts cannot fall back to automatic publication');

set local role postgres;
insert into public.joint_workouts(id,initiator_id,suggested_routine) values('62000000-0000-0000-0000-000000000100','62000000-0000-0000-0000-000000000001',
'{"name":"Upper","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":80,"reps":8}]}]}');
insert into public.joint_workout_participants(joint_workout_id,participant_id,status,joined_at,finished_at) values
('62000000-0000-0000-0000-000000000100','62000000-0000-0000-0000-000000000001','completed',now(),now()),
('62000000-0000-0000-0000-000000000100','62000000-0000-0000-0000-000000000002','completed',now(),now());
insert into public.experience_attempts(owner_id,attempt_id,completed_at,week_start,adherence,valid_sets,planned_sets,snapshot)
select owner,'joint-review',now(),current_date,1,4,4,pg_temp.attempt('joint-review','2026-09-04T12:00:00Z',false) || jsonb_build_object('jointWorkoutId','62000000-0000-0000-0000-000000000100')
from unnest(array['62000000-0000-0000-0000-000000000001'::uuid,'62000000-0000-0000-0000-000000000002'::uuid]) owner;
select is(private.finalize_joint_workout('62000000-0000-0000-0000-000000000100'),'waiting','completed participants still wait for their reviews');
set local role authenticated;
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000001',true);
select is(jsonb_array_length(public.list_pending_workout_reviews()),1,'review survives leaving the completion screen');
select public.confirm_workout_completion('joint-review',array[]::uuid[]);
set local role postgres;
select is((select count(*) from public.joint_workout_posts where joint_workout_id='62000000-0000-0000-0000-000000000100'),0::bigint,'one confirmation cannot publish the whole group early');
set local role authenticated;
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.confirm_workout_completion('joint-review',array[]::uuid[])$$,'last participant confirms');
set local role postgres;
select is((select count(*) from public.joint_workout_posts where joint_workout_id='62000000-0000-0000-0000-000000000100'),1::bigint,'group publishes after all reviews');

select * from finish();
rollback;
