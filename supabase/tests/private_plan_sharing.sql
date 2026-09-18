begin;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select format('30000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', format('share%s@example.com', value), '', now(), '{}', '{}', now(), now()
from generate_series(1, 4) value;
insert into public.profiles (id, alias) values
  ('30000000-0000-0000-0000-000000000001', 'Sender'),
  ('30000000-0000-0000-0000-000000000002', 'Recipient'),
  ('30000000-0000-0000-0000-000000000003', 'Unrelated'),
  ('30000000-0000-0000-0000-000000000004', 'Blocked');
insert into public.relationships (member_low, member_high, kind) values
  ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'bro'),
  ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 'bro');
insert into public.training_libraries (owner_id, routines, mesocycles) values (
  '30000000-0000-0000-0000-000000000001',
  '[{"id":"source-routine","name":"Upper","muscleGroups":["pecho"],"exercises":[{"id":"source-exercise","name":"Press","muscleGroups":["pecho"],"sets":[{"id":"source-set","tipo":1,"weight":80,"reps":8}]}],"createdAt":"2026-08-02T00:00:00.000Z"}]'::jsonb,
  '[{"id":"source-mesocycle","name":"Strength","goal":"Build","status":"draft","durationWeeks":1,"weeks":[{"id":"source-week","weekNumber":1,"entries":[{"id":"source-entry","ref":{"routineId":"source-routine","routineName":"Upper","source":"local"},"order":1}]}],"createdAt":"2026-08-02T00:00:00.000Z"}]'::jsonb
);

set local role anon;
select throws_like($$select public.list_received_private_plan_share_requests()$$, 'permission denied for function list_received_private_plan_share_requests', 'anonymous callers cannot invoke plan sharing RPCs');

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select throws_like($$select public.get_profile_plan_library('30000000-0000-0000-0000-000000000001')$$, 'plan library unavailable', 'unrelated users cannot read a profile plan library');
select throws_like($$select public.create_private_plan_share_request('30000000-0000-0000-0000-000000000001', 'routine', 'source-routine')$$, 'plan share unavailable', 'unrelated users cannot create plan share requests');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000004', true);
set local role postgres;
insert into public.blocks (blocker_id, blocked_id) values ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004');
set local role authenticated;
select throws_like($$select public.get_profile_plan_library('30000000-0000-0000-0000-000000000001')$$, 'plan library unavailable', 'blocked users cannot read a profile plan library');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
set local role postgres;
update public.profiles set avatar_id = 'capigirl', presentation_theme_id = 'moon' where id = '30000000-0000-0000-0000-000000000001';
update public.profiles set share_routine_template = false where id = '30000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_like($$select public.create_private_plan_share_request('30000000-0000-0000-0000-000000000002', 'routine', 'source-routine')$$, 'plan share unavailable', 'routine privacy prevents sender creation');
set local role postgres;
update public.profiles set share_routine_template = true where id = '30000000-0000-0000-0000-000000000001';
set local role authenticated;

select lives_ok($$select set_config('test.routine_request', public.create_private_plan_share_request('30000000-0000-0000-0000-000000000002', 'routine', 'source-routine')::text, true)$$, 'sender creates a routine request from the server-side library');
select lives_ok($$select set_config('test.mesocycle_request', public.create_private_plan_share_request('30000000-0000-0000-0000-000000000002', 'mesocycle', 'source-mesocycle')::text, true)$$, 'sender creates a mesocycle request with an immutable snapshot');
select throws_like($$select * from public.private_plan_share_requests$$, 'permission denied for table private_plan_share_requests', 'senders cannot read the request table directly');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select is(jsonb_array_length(public.list_received_private_plan_share_requests()), 2, 'recipient lists pending requests only through the projection RPC');
select is(public.list_received_private_plan_share_requests() -> 0 ->> 'senderAlias', 'Sender', 'receiver projection includes sender presentation only');
select is(public.list_received_private_plan_share_requests() -> 0 ->> 'senderAvatarId', 'capigirl', 'recipient projection includes the sender avatar metadata');
select is(public.list_received_private_plan_share_requests() -> 0 ->> 'senderThemeId', 'moon', 'recipient projection includes the sender presentation theme metadata');
select is(public.accept_private_plan_share_request(current_setting('test.mesocycle_request')::uuid) ->> 'mesocycleId' is not null, true, 'recipient accepts a mesocycle request atomically');
select is(jsonb_array_length(public.load_training_library() -> 'routines'), 1, 'accept imports the mesocycle routine once');
select isnt(public.load_training_library() -> 'routines' -> 0 ->> 'id', 'source-routine', 'accepted routines receive independent UUID string IDs');
select is(
  public.load_training_library() -> 'mesocycles' -> 0 -> 'weeks' -> 0 -> 'entries' -> 0 -> 'ref' ->> 'routineId',
  public.load_training_library() -> 'routines' -> 0 ->> 'id',
  'accepted mesocycle references the imported routine ID'
);
select is(
  public.accept_private_plan_share_request(current_setting('test.mesocycle_request')::uuid),
  public.accept_private_plan_share_request(current_setting('test.mesocycle_request')::uuid),
  'duplicate acceptance returns the original imported IDs idempotently'
);
select is(jsonb_array_length(public.load_training_library() -> 'routines'), 1, 'duplicate acceptance does not import routines again');
select lives_ok($$select public.reject_private_plan_share_request(current_setting('test.routine_request')::uuid)$$, 'recipient rejects a pending request');
select is(jsonb_array_length(public.list_received_private_plan_share_requests()), 0, 'rejected requests leave the recipient pending projection');

select * from finish();
rollback;
