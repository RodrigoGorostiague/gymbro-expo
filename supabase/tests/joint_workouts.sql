begin;
select plan(20);

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
select throws_like($$select public.graph_send_request('40000000-0000-0000-0000-000000000004', 'partner')$$, 'each account can have only one Partner', 'server rejects a second Partner request for an already partnered account');
select is((select count(*)::integer from pg_proc where proname in ('send_joint_workout_action', 'list_joint_workout_actions')), 0, 'joint canned action functions are removed');
select lives_ok($$select public.finish_joint_workout(current_setting('test.joint_id')::uuid, 'circle', '{"routineName":"Upper","durationSeconds":60,"exercises":[{"name":"Row","muscleGroupIds":["back"],"sets":[{"weight":80,"reps":8,"completed":true}]}]}'::jsonb)$$, 'initiator completion closes every remaining invitation');
set local role postgres;
select is((select status::text from public.joint_workout_participants where joint_workout_id = current_setting('test.joint_id')::uuid and participant_id = '40000000-0000-0000-0000-000000000004'), 'declined', 'an unaccepted invitation expires when the initiator finishes');
select is((select count(*)::integer from public.joint_workout_posts where joint_workout_id = current_setting('test.joint_id')::uuid), 1, 'first real completion creates the single live group post');
select is((select completed_at is null from public.joint_workouts where id = current_setting('test.joint_id')::uuid), true, 'accepted active participants keep the group live after initiator completion');
update public.joint_workout_participants set visibility = 'public' where joint_workout_id = current_setting('test.joint_id')::uuid and participant_id = '40000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000005', true);
select is(jsonb_array_length(public.list_joint_workout_posts()), 1, 'a public completed participant makes the post visible without a relationship');
select is((public.get_joint_workout_detail(current_setting('test.joint_id')::uuid) -> 'suggested_routine'), 'null'::jsonb, 'a recipient projection never includes the initiator routine');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000004', true);
select throws_like($$select public.respond_joint_workout_invite(current_setting('test.joint_id')::uuid, true, '{"name":"Upper","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":80,"reps":8}]}]}'::jsonb)$$, 'joint workout invite unavailable', 'expired invitation cannot be accepted later');

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.send_partner_message('40000000-0000-0000-0000-000000000003', 'kiss')$$, 'current Partners can create a private message notification');
set local role postgres;
select is((select count(*)::integer from public.notification_inbox where recipient_id = '40000000-0000-0000-0000-000000000003' and kind = 'partner_message'), 1, 'the Partner recipient receives the only message notification');
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select throws_like($$select public.send_partner_message('40000000-0000-0000-0000-000000000003', 'kiss')$$, 'partner message unavailable', 'a Bro cannot invoke the Partner message RPC');
select is(jsonb_array_length(public.list_notification_inbox()), 0, 'a Bro cannot read or infer Partner message notifications');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000003', true);
select is(jsonb_array_length(public.list_notification_inbox()), 1, 'only the recipient can read their private Partner message notification');

select * from finish();
rollback;
