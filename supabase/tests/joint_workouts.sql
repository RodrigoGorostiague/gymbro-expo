begin;
select plan(28);

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
insert into public.workout_start_activities (author_id, routine_name, expires_at) values
  ('40000000-0000-0000-0000-000000000001', 'Upper', now() + interval '1 hour'),
  ('40000000-0000-0000-0000-000000000002', 'Upper', now() + interval '1 hour'),
  ('40000000-0000-0000-0000-000000000003', 'Upper', now() + interval '1 hour'),
  ('40000000-0000-0000-0000-000000000004', 'Upper', now() + interval '1 hour');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select lives_ok($$select set_config('test.joint_id', public.create_joint_workout('40000000-0000-0000-0000-000000000002', '{"name":"Upper","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":80,"reps":8}]}]}'::jsonb)::text, true)$$, 'initiator creates the first joint invite');
select lives_ok($$select public.add_joint_workout_participant(current_setting('test.joint_id')::uuid, '40000000-0000-0000-0000-000000000003')$$, 'active initiator adds a Partner');
select lives_ok($$select public.add_joint_workout_participant(current_setting('test.joint_id')::uuid, '40000000-0000-0000-0000-000000000004')$$, 'active initiator adds a second Bro');
select throws_like($$select public.add_joint_workout_participant(current_setting('test.joint_id')::uuid, '40000000-0000-0000-0000-000000000005')$$, 'joint workout participant limit reached', 'server limits a session to four total participants');

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select lives_ok($$select public.respond_joint_workout_invite(current_setting('test.joint_id')::uuid, true)$$, 'Bro accepts before initiator completion');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000003', true);
select lives_ok($$select public.respond_joint_workout_invite(current_setting('test.joint_id')::uuid, true)$$, 'Partner accepts before action testing');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select throws_like($$select public.graph_send_request('40000000-0000-0000-0000-000000000004', 'partner')$$, 'each account can have only one Partner', 'server rejects a second Partner request for an already partnered account');
select is((select count(*)::integer from pg_proc where proname in ('send_joint_workout_action', 'list_joint_workout_actions')), 0, 'joint canned action functions are removed');
select lives_ok($$select public.finish_joint_workout(current_setting('test.joint_id')::uuid, 'circle', '{"routineName":"Upper","durationSeconds":60,"exercises":[{"name":"Row","muscleGroupIds":["back"],"sets":[{"weight":80,"reps":8,"completed":true}]}],"sharePayload":{"version":1,"routine":{"name":"Upper","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":80,"reps":8}]}]},"mesocycle":{"name":"Block","goal":"","durationWeeks":1,"weeks":[[{"routineIndex":0}]],"routines":[{"name":"Upper","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":80,"reps":8}]}]}]},"performedSets":[{"exerciseIndex":0,"sets":[{"weight":80,"reps":8,"completed":true}]}]}}'::jsonb)$$, 'initiator completion stores the validated import payload');
set local role postgres;
select is((select status::text from public.joint_workout_participants where joint_workout_id = current_setting('test.joint_id')::uuid and participant_id = '40000000-0000-0000-0000-000000000004'), 'declined', 'an unaccepted invitation expires when the initiator finishes');
select is((select count(*)::integer from public.joint_workout_posts where joint_workout_id = current_setting('test.joint_id')::uuid), 1, 'first real completion creates the single live group post');
select is((select completed_at is null from public.joint_workouts where id = current_setting('test.joint_id')::uuid), true, 'accepted active participants keep the group live after initiator completion');
select is((select closed_at is not null from public.workout_start_activities where author_id = '40000000-0000-0000-0000-000000000001'), true, 'completion closes the initiator workout-start presence transactionally');
update public.joint_workout_participants set visibility = 'public' where joint_workout_id = current_setting('test.joint_id')::uuid and participant_id = '40000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000005', true);
select is(jsonb_array_length(public.list_joint_workout_posts()), 1, 'a public completed participant makes the post visible without a relationship');
select is((public.get_joint_workout_detail(current_setting('test.joint_id')::uuid) -> 'suggested_routine'), 'null'::jsonb, 'a recipient projection never includes the initiator routine');
select ok(jsonb_path_exists(public.get_joint_workout_detail(current_setting('test.joint_id')::uuid), '$.participants[*] ? (@.share_payload.mesocycle.name == "Block")'), 'a visible participant detail exposes the validated mesocycle import payload');
select lives_ok($$select public.create_joint_participant_comment(current_setting('test.joint_id')::uuid, '40000000-0000-0000-0000-000000000001', 'Buen entrenamiento')$$, 'a visible participant result accepts comments');
select is(jsonb_array_length(public.list_joint_participant_comments(current_setting('test.joint_id')::uuid, '40000000-0000-0000-0000-000000000001')), 1, 'the participant discussion thread returns the created comment');
select is(((public.get_joint_participant_reaction_states(current_setting('test.joint_id')::uuid) -> '40000000-0000-0000-0000-000000000001' ->> 'comment_count'))::integer, 1, 'joint participant engagement states include comment counters');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000004', true);
select throws_like($$select public.respond_joint_workout_invite(current_setting('test.joint_id')::uuid, true)$$, 'joint workout invite unavailable', 'expired invitation cannot be accepted later');

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.send_partner_message('40000000-0000-0000-0000-000000000003', 'kiss')$$, 'current Partners can create a private message notification');
set local role postgres;
select is((select count(*)::integer from public.notification_inbox where recipient_id = '40000000-0000-0000-0000-000000000003' and kind = 'partner_message'), 1, 'the Partner recipient receives the only message notification');
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select throws_like($$select public.send_partner_message('40000000-0000-0000-0000-000000000003', 'kiss')$$, 'partner message unavailable', 'a Bro cannot invoke the Partner message RPC');
select is((select count(*) from jsonb_array_elements(public.list_notification_inbox()) item where item ->> 'kind' = 'partner_message'), 0::bigint, 'a Bro cannot read or infer Partner message notifications');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000003', true);
select is((select count(*) from jsonb_array_elements(public.list_notification_inbox()) item where item ->> 'kind' = 'partner_message'), 1::bigint, 'only the recipient can read their private Partner message notification');

set local role postgres;
update public.profiles set avatar_id = 'capybro-spiky' where id = '40000000-0000-0000-0000-000000000005';
insert into public.workout_start_activities (author_id, routine_name, expires_at)
values ('40000000-0000-0000-0000-000000000005', 'Lower', now() + interval '1 hour');
select is((select count(*)::integer from public.notification_inbox where recipient_id = '40000000-0000-0000-0000-000000000001' and kind = 'circle_workout_started' and data ->> 'actor_id' = '40000000-0000-0000-0000-000000000005'), 1, 'an active Circle member receives the durable workout-start notification');
select ok((select data @> jsonb_build_object('actor_id', '40000000-0000-0000-0000-000000000005', 'actor_avatar_id', 'capybro-spiky', 'activity_id', (select id from public.workout_start_activities where author_id = '40000000-0000-0000-0000-000000000005'), 'expires_at', (select expires_at from public.workout_start_activities where author_id = '40000000-0000-0000-0000-000000000005')) from public.notification_inbox where recipient_id = '40000000-0000-0000-0000-000000000001' and kind = 'circle_workout_started' and data ->> 'actor_id' = '40000000-0000-0000-0000-000000000005'), 'the workout-start payload contains actor, avatar, activity, and expiry identifiers');
select is((select count(*)::integer from public.notification_inbox where recipient_id = '40000000-0000-0000-0000-000000000005' and kind = 'circle_workout_started' and data ->> 'actor_id' = '40000000-0000-0000-0000-000000000005'), 0, 'the starter does not receive their own workout-start notification');

select * from finish();
rollback;
