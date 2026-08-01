begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'planner@example.com', '', now(), '{}', '{}', now(), now()),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-planner@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, alias) values
  ('20000000-0000-0000-0000-000000000001', 'Planner'),
  ('20000000-0000-0000-0000-000000000002', 'Other Planner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

select is(public.load_training_library(), '{"routines": [], "mesocycles": []}'::jsonb, 'a new planner receives an empty remote library');
select lives_ok($$select public.save_training_library('[{"id":"routine-1","name":"Upper","muscleGroups":["GM-100"],"exercises":[],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb, null)$$, 'a planner saves routines');
select is(public.load_training_library() -> 'routines' -> 0 ->> 'id', 'routine-1', 'saved routines persist in the owner library');
select lives_ok($$select public.save_training_library(null, '[{"id":"mesocycle-1","name":"Block","goal":"","status":"draft","durationWeeks":1,"weeks":[],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb)$$, 'a planner saves mesocycles without replacing routines');
select is(public.load_training_library() -> 'routines' -> 0 ->> 'id', 'routine-1', 'partial mesocycle save preserves routines');

select * from finish();
rollback;
