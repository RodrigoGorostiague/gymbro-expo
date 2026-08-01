begin;
select plan(12);

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
select lives_ok(
  $$select public.save_training_library(null, '[{"id":"scheduled","name":"Scheduled","goal":"","status":"draft","durationWeeks":1,"weeks":[{"id":"week-1","weekNumber":1,"entries":[{"id":"session-1","ref":{"routineId":"routine-1","routineName":"Upper","source":"local"},"order":1}]}],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb)$$,
  'a mesocycle can schedule an existing routine'
);
select throws_ok(
  $$select public.save_training_library('[]'::jsonb, null)$$,
  'invalid training library input',
  'a scheduled routine cannot be deleted without updating its mesocycle'
);
select throws_ok(
  $$select public.save_training_library('[{"id":"routine-1","name":"Upper","muscleGroups":["GM-100"],"exercises":[],"createdAt":"2026-08-01T00:00:00.000Z"},{"id":"routine-1","name":"Duplicate","muscleGroups":["GM-100"],"exercises":[],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb, null)$$,
  'invalid training library input',
  'duplicate routine ids are rejected at the server boundary'
);
select throws_ok(
  $$select public.save_training_library(null, '[{"id":"broken","name":"Broken","goal":"","status":"draft","durationWeeks":1,"weeks":[{"id":"week-1","weekNumber":1,"entries":[{"id":"session-1","ref":{"routineId":"missing","routineName":"Missing","source":"local"},"order":1}]}],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb)$$,
  'invalid training library input',
  'mesocycles with broken routine references are rejected'
);
select is(
  public.sanitize_training_routines('[{"id":"valid","name":"Valid","muscleGroups":["GM-100"],"exercises":[],"createdAt":"2026-08-01T00:00:00.000Z"},{"id":"bad"}]'::jsonb),
  '[{"id":"valid","name":"Valid","muscleGroups":["GM-100"],"exercises":[],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb,
  'the migration sanitizer preserves valid routines and prunes malformed records'
);
set local role postgres;
alter table public.training_libraries disable trigger training_libraries_validate_content;
insert into public.training_libraries (owner_id, routines, mesocycles) values (
  '20000000-0000-0000-0000-000000000002',
  '[{"id":"kept-routine","name":"Kept","muscleGroups":["GM-100"],"exercises":[],"createdAt":"2026-08-01T00:00:00.000Z"},{"id":"malformed-routine"}]'::jsonb,
  '[{"id":"kept-mesocycle","name":"Kept","goal":"","status":"draft","durationWeeks":1,"weeks":[{"id":"week-1","weekNumber":1,"entries":[{"id":"session-1","ref":{"routineId":"kept-routine","routineName":"Kept","source":"local"},"order":1}]}],"createdAt":"2026-08-01T00:00:00.000Z"},{"id":"broken-reference","name":"Broken","goal":"","status":"draft","durationWeeks":1,"weeks":[{"id":"week-1","weekNumber":1,"entries":[{"id":"session-1","ref":{"routineId":"missing","routineName":"Missing","source":"local"},"order":1}]}],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb
);
alter table public.training_libraries enable trigger training_libraries_validate_content;
select public.sanitize_training_libraries();
select is(
  (select routines from public.training_libraries where owner_id = '20000000-0000-0000-0000-000000000002'),
  '[{"id":"kept-routine","name":"Kept","muscleGroups":["GM-100"],"exercises":[],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb,
  'cleanup preserves valid routines while pruning malformed routines from a mixed row'
);
select is(
  (select mesocycles from public.training_libraries where owner_id = '20000000-0000-0000-0000-000000000002'),
  '[{"id":"kept-mesocycle","name":"Kept","goal":"","status":"draft","durationWeeks":1,"weeks":[{"id":"week-1","weekNumber":1,"entries":[{"id":"session-1","ref":{"routineId":"kept-routine","routineName":"Kept","source":"local"},"order":1}]}],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb,
  'cleanup prunes only mesocycles with broken routine references from a mixed row'
);

select * from finish();
rollback;
