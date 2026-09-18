begin;
select no_plan();
select ok(private.is_valid_actual_effort('{"kind":"rir","value":0}'), 'actual RIR zero accepted');
select ok(private.is_valid_actual_effort('{"kind":"rpe","value":10}'), 'actual RPE ten accepted');
select ok(not private.is_valid_actual_effort('{"kind":"rpe","value":5}'), 'out of range rejected');
select ok(not private.is_valid_actual_effort('{"kind":"rir","value":1.5}'), 'fraction rejected');
select ok(not private.is_valid_actual_effort('{"kind":"rir","value":0,"note":"private"}'), 'unknown fields rejected');
select ok(private.is_valid_recap_share_payload('{"version":1,"performedSets":[{"exerciseIndex":0,"sets":[{"weight":20,"reps":8,"completed":true,"actualEffort":{"kind":"rir","value":0}}]}]}'), 'performed payload keeps actual effort');
select ok(not private.is_valid_recap_share_payload('{"version":1,"performedSets":[{"exerciseIndex":0,"sets":[{"weight":20,"reps":8,"completed":false,"actualEffort":{"kind":"rir","value":0}}]}]}'), 'unperformed sets cannot carry actual effort');

create function pg_temp.effort_workout(set_patch jsonb default '{}') returns jsonb language sql as $$
select jsonb_build_object('routineName', 'Upper', 'durationSeconds', 123,
  'exercises', jsonb_build_array(jsonb_build_object('name', 'Row', 'muscleGroupIds', jsonb_build_array('back'),
  'sets', jsonb_build_array('{"weight":20,"reps":8,"completed":true}'::jsonb || set_patch))))
$$;
select ok(private.is_valid_joint_completed_workout(pg_temp.effort_workout()), 'legacy joint sets remain valid');
select ok(private.is_valid_joint_completed_workout(pg_temp.effort_workout('{"actualEffort":{"kind":"rir","value":0}}')), 'joint execution accepts actual RIR zero');
select ok(private.is_valid_joint_completed_workout(pg_temp.effort_workout('{"actualEffort":{"kind":"rpe","value":10}}')), 'joint execution accepts actual RPE');
select ok(not private.is_valid_joint_completed_workout(pg_temp.effort_workout(patch)), label)
from (values
  ('{"actualEffort":{"kind":"rpe","value":5}}'::jsonb, 'joint rejects invalid RPE'),
  ('{"actualEffort":{"kind":"rir","value":6}}'::jsonb, 'joint rejects invalid RIR'),
  ('{"actualEffort":{"kind":"rir","value":1.5}}'::jsonb, 'joint rejects fractional effort'),
  ('{"actualEffort":null}'::jsonb, 'joint rejects null effort'),
  ('{"actualEffort":{"kind":"rir","value":0,"privateNote":"secret"}}'::jsonb, 'joint rejects unknown effort fields'),
  ('{"completed":false,"actualEffort":{"kind":"rir","value":0}}'::jsonb, 'joint rejects effort on unperformed sets'),
  ('{"effortTarget":{"kind":"rir","value":2}}'::jsonb, 'joint rejects planned effort in execution sets')
) invalid(patch, label);
create function pg_temp.effort_template(set_patch jsonb default '{}') returns jsonb language sql as $$
select '{"name":"Upper","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[]}]}'::jsonb
  || jsonb_build_object('exercises', jsonb_build_array(
    '{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell"}'::jsonb
    || jsonb_build_object('sets', jsonb_build_array('{"tipo":1,"weight":20,"reps":8,"effortTarget":{"kind":"rir","value":2}}'::jsonb || set_patch))))
$$;
select ok(private.is_valid_recap_template_routine(pg_temp.effort_template()), 'copyable routine retains planned effort');
select ok(not private.is_valid_recap_template_routine(pg_temp.effort_template('{"actualEffort":{"kind":"rir","value":0}}')), 'copyable routine rejects execution effort');


-- Exercise public write/read boundaries with transaction-scoped users.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select format('76000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  format('actual-effort-%s@example.com', value), '', now(), '{}', '{}', now(), now()
from generate_series(1, 2) value;
insert into public.profiles (id, alias) values
  ('76000000-0000-0000-0000-000000000001', 'Effort Author'),
  ('76000000-0000-0000-0000-000000000002', 'Effort Partner');
insert into public.relationships (member_low, member_high, kind) values
  ('76000000-0000-0000-0000-000000000001', '76000000-0000-0000-0000-000000000002', 'bro');
create function pg_temp.effort_recap(set_patch jsonb default '{}') returns jsonb language sql as $$
select jsonb_build_object('routine_name', 'Upper', 'completed_at', now(), 'duration_seconds', 123,
  'exercise_count', 1, 'metrics', '{}'::jsonb, 'publication_key', 'actual-effort-test',
  'exercise_details', jsonb_build_object('exercises', jsonb_build_array(
    jsonb_build_object('name', 'Row', 'muscle_group_ids', jsonb_build_array('back'),
      'sets', pg_temp.effort_workout(set_patch) #> '{exercises,0,sets}'))),
  'share_payload', jsonb_build_object('version', 1, 'routine', pg_temp.effort_template()))
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000001', true);
select lives_ok($$select set_config('test.effort_recap', public.create_workout_recap(pg_temp.effort_recap('{"actualEffort":{"kind":"rpe","value":9}}'))::text, true)$$, 'solo RPC accepts actual RPE');
select is(public.get_workout_recap_detail(current_setting('test.effort_recap')::uuid) #> '{exercises,0,sets,0,actualEffort}', '{"kind":"rpe","value":9}'::jsonb, 'solo detail returns actual effort');
select is(public.get_workout_recap_detail(current_setting('test.effort_recap')::uuid) ->> 'duration_seconds', '123', 'solo detail retains total duration');
select is(public.get_workout_recap_detail(current_setting('test.effort_recap')::uuid) #> '{share_payload,routine,exercises,0,sets,0,effortTarget}', '{"kind":"rir","value":2}'::jsonb, 'copyable solo routine keeps planned effort independent of actual RPE');
select throws_like($$select public.create_workout_recap(pg_temp.effort_recap('{"completed":false,"actualEffort":{"kind":"rir","value":0}}'))$$, 'invalid recap input', 'solo RPC rejects effort on an unperformed set');
select lives_ok($$select set_config('test.effort_joint', public.create_joint_workout('76000000-0000-0000-0000-000000000002', pg_temp.effort_template())::text, true)$$, 'joint RPC accepts planned template');
select throws_like($$select public.finish_joint_workout(current_setting('test.effort_joint')::uuid, 'circle', pg_temp.effort_workout('{"completed":false,"actualEffort":{"kind":"rir","value":0}}'))$$, 'invalid joint completed workout', 'joint RPC rejects effort on an unperformed set');
select lives_ok($$select public.finish_joint_workout(current_setting('test.effort_joint')::uuid, 'circle', pg_temp.effort_workout('{"actualEffort":{"kind":"rir","value":0}}') || jsonb_build_object('sharePayload', jsonb_build_object('version', 1, 'routine', pg_temp.effort_template())))$$, 'joint RPC persists actual RIR zero and separate planned template');
select ok(jsonb_path_exists(public.get_joint_workout_detail(current_setting('test.effort_joint')::uuid), '$.participants[*].workout.exercises[*].sets[*] ? (@.actualEffort.kind == "rir" && @.actualEffort.value == 0)'), 'joint detail returns actual RIR zero');
select ok(jsonb_path_exists(public.get_joint_workout_detail(current_setting('test.effort_joint')::uuid), '$.participants[*].workout ? (@.durationSeconds == 123)'), 'joint detail retains total duration');
select ok(jsonb_path_exists(public.get_joint_workout_detail(current_setting('test.effort_joint')::uuid), '$.participants[*].share_payload.routine.exercises[*].sets[*] ? (@.effortTarget.kind == "rir" && @.effortTarget.value == 2)'), 'joint copyable template retains planned RIR two');
set local role postgres;

select * from finish();
rollback;
