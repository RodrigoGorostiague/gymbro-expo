begin;
select plan(14);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select format('49000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', format('recovery%s@example.invalid', value), '', now(), '{}', '{}', now(), now()
from generate_series(1, 3) value;
insert into public.profiles (id, alias) values
 ('49000000-0000-0000-0000-000000000001','Recovery One'),
 ('49000000-0000-0000-0000-000000000002','Recovery Two'),
 ('49000000-0000-0000-0000-000000000003','Never Joined');
insert into public.joint_workouts(id,initiator_id,suggested_routine) values
 ('49000000-0000-0000-0001-000000000001','49000000-0000-0000-0000-000000000001','{"name":"Upper","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":80,"reps":8}]}]}');
insert into public.joint_workout_participants(joint_workout_id,participant_id,status,joined_at,visibility,completed_workout) values
 ('49000000-0000-0000-0001-000000000001','49000000-0000-0000-0000-000000000001','completed',now(),'private','{"routineName":"Private","durationSeconds":60,"exercises":[{"name":"Row","muscleGroupIds":["back"],"sets":[{"weight":80,"reps":8,"completed":true}]}]}'),
 ('49000000-0000-0000-0001-000000000001','49000000-0000-0000-0000-000000000002','active',now(),'circle',null),
 ('49000000-0000-0000-0001-000000000001','49000000-0000-0000-0000-000000000003','declined',null,'circle',null);
insert into public.joint_workout_posts(joint_workout_id) values('49000000-0000-0000-0001-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','49000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.respond_joint_workout_invite('49000000-0000-0000-0001-000000000001',true)$$,'lost acceptance acknowledgement can be retried');
select lives_ok($$select public.get_joint_workout_detail('49000000-0000-0000-0001-000000000001')$$,'actual joined member retains private result access');
select set_config('request.jwt.claim.sub','49000000-0000-0000-0000-000000000003',true);
select throws_like($$select public.get_joint_workout_detail('49000000-0000-0000-0001-000000000001')$$,'joint workout unavailable','never-joined invitee cannot read private results');
select lives_ok($$select public.respond_joint_workout_invite('49000000-0000-0000-0001-000000000001',false)$$,'terminal rejection is safely repeatable');
set local role postgres;
select ok(has_column_privilege('authenticated','public.workout_start_activities','id','select'),'presence identity can authorize Realtime');
select ok(not has_column_privilege('authenticated','public.workout_start_activities','routine_name','select'),'presence payload remains RPC-only');
insert into public.workout_start_activities(author_id,routine_name,expires_at,closed_at) values('49000000-0000-0000-0000-000000000002','Private',now()+interval '1 hour',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','49000000-0000-0000-0000-000000000002',true);
select case when has_column_privilege('authenticated','public.workout_start_activities','id','select') then results_eq($$select count(id)::int from public.workout_start_activities$$,array[1],'closed presence still provides an authorized invalidation identity') else fail('closed presence still provides an authorized invalidation identity') end;
select is(jsonb_array_length(public.list_workout_start_activities()),0,'closed presence is absent from visible feed projection');
set local role postgres;
select has_function('public','resolve_joint_workout_attempt',array['text'],'attempt-bound authoritative resolution is available');
set local role postgres;
insert into public.relationships(member_low,member_high,kind) values('49000000-0000-0000-0000-000000000001','49000000-0000-0000-0000-000000000003','bro');
set local role authenticated;
select set_config('request.jwt.claim.sub','49000000-0000-0000-0000-000000000003',true);
select is(public.get_joint_workout_detail('49000000-0000-0000-0001-000000000001')->'participants'->0->'workout','null'::jsonb,'connection visibility does not expose private workout to declined invitee');
select is(public.get_joint_workout_detail('49000000-0000-0000-0001-000000000001')->'participants'->0->'share_payload','null'::jsonb,'connection visibility does not expose private import payload');
select throws_like($$select public.set_joint_participant_reaction('49000000-0000-0000-0001-000000000001','49000000-0000-0000-0000-000000000001',true)$$,'joint workout unavailable','declined invitee cannot engage private result');
select throws_like($$select public.list_joint_participant_comments('49000000-0000-0000-0001-000000000001','49000000-0000-0000-0000-000000000001')$$,'joint workout unavailable','declined invitee cannot list private result comments');
select throws_like($$select public.finish_joint_workout_attempt('49000000-0000-0000-0000-000000000001','old','49000000-0000-0000-0001-000000000001','circle','{}')$$,'joint workout owner mismatch','an old-account queue cannot publish after an account switch');
select * from finish();
rollback;
