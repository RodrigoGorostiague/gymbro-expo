begin;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select format('40000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', format('joint%s@example.com', value), '', now(), '{}', '{}', now(), now()
from generate_series(1, 5) value;
insert into public.profiles (id, alias) values
  ('40000000-0000-0000-0000-000000000001', 'Initiator'), ('40000000-0000-0000-0000-000000000002', 'Bro One'),
  ('40000000-0000-0000-0000-000000000003', 'Partner One'), ('40000000-0000-0000-0000-000000000004', 'Bro Two'), ('40000000-0000-0000-0000-000000000005', 'Bro Three');
insert into public.relationships (member_low, member_high, kind) values
  ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'bro'),
  ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'partner'),
  ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'bro'),
  ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', 'bro');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select lives_ok($$select set_config('test.joint_id', public.create_joint_workout('40000000-0000-0000-0000-000000000002', '{"name":"Upper","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":80,"reps":8}]}]}'::jsonb)::text, true)$$, 'initiator creates the first joint invite');
select lives_ok($$select public.add_joint_workout_participant(current_setting('test.joint_id')::uuid, '40000000-0000-0000-0000-000000000003')$$, 'active initiator adds a Partner');
select lives_ok($$select public.add_joint_workout_participant(current_setting('test.joint_id')::uuid, '40000000-0000-0000-0000-000000000004')$$, 'active initiator adds a second Bro');
select throws_like($$select public.add_joint_workout_participant(current_setting('test.joint_id')::uuid, '40000000-0000-0000-0000-000000000005')$$, 'joint workout participant limit reached', 'server limits a session to four total participants');

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select lives_ok($$select public.respond_joint_workout_invite(current_setting('test.joint_id')::uuid, true, '{"name":"Upper","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":80,"reps":8}]}]}'::jsonb)$$, 'Bro accepts before initiator completion');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000003', true);
select lives_ok($$select public.respond_joint_workout_invite(current_setting('test.joint_id')::uuid, true, '{"name":"Upper","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":80,"reps":8}]}]}'::jsonb)$$, 'Partner accepts before action testing');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.send_joint_workout_action(current_setting('test.joint_id')::uuid, '40000000-0000-0000-0000-000000000003', 'partner_proud')$$, 'Partner-only canned action is allowed for a current Partner');
select throws_like($$select public.send_joint_workout_action(current_setting('test.joint_id')::uuid, '40000000-0000-0000-0000-000000000002', 'partner_proud')$$, 'joint workout action unavailable', 'Partner-only canned action is denied for a Bro');
select lives_ok($$select public.finish_joint_workout(current_setting('test.joint_id')::uuid, 'circle', '{"routineName":"Upper","durationSeconds":60,"exercises":[{"name":"Row","muscleGroupIds":["back"],"sets":[{"weight":80,"reps":8,"completed":true}]}]}'::jsonb)$$, 'initiator completion closes every remaining invitation');
set local role postgres;
select is((select status::text from public.joint_workout_participants where joint_workout_id = current_setting('test.joint_id')::uuid and participant_id = '40000000-0000-0000-0000-000000000004'), 'declined', 'an unaccepted invitation expires when the initiator finishes');
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000004', true);
select throws_like($$select public.respond_joint_workout_invite(current_setting('test.joint_id')::uuid, true, '{"name":"Upper","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":80,"reps":8}]}]}'::jsonb)$$, 'joint workout invite unavailable', 'expired invitation cannot be accepted later');

select * from finish();
rollback;
