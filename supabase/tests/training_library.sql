begin;
select plan(30);

create function pg_temp.test_mesocycle(mesocycle_id text, lifecycle_status text)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id', mesocycle_id, 'name', mesocycle_id, 'goal', '', 'status', lifecycle_status,
    'durationWeeks', 1, 'weeks', '[]'::jsonb, 'createdAt', '2026-08-01T00:00:00.000Z'
  )
$$;

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

select lives_ok($$select public.save_training_library(null, '[{"id":"paused","name":"Paused block","goal":"","status":"paused","pausedAt":"2026-09-05T10:00:00Z","durationWeeks":1,"weeks":[],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb)$$, 'the current mesocycle lifecycle contract accepts pause metadata');

select throws_ok(
  $$select public.save_training_library(null, '[{"id":"too-long","name":"Too long","goal":"","status":"draft","durationWeeks":53,"weeks":[],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb)$$,
  'invalid training library input',
  'mesocycles cannot exceed the product duration bound'
);
set local role postgres;
update public.training_libraries set mesocycles = '[{"id":"legacy-long","name":"Legacy","goal":"","status":"archived","durationWeeks":60,"weeks":[],"createdAt":"2020-01-01T00:00:00.000Z"}]'::jsonb
where owner_id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
select lives_ok($$select public.save_training_library('[{"id":"routine-1","name":"Upper","muscleGroups":["GM-100"],"exercises":[],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb, null)$$, 'routine saves preserve a grandfathered long mesocycle');
select is(public.load_training_library() -> 'mesocycles' -> 0 ->> 'durationWeeks', '60', 'loading preserves the grandfathered duration without rewriting it');
select throws_ok(
  $$select public.save_training_library(null, '[{"id":"legacy-long","name":"Legacy","goal":"","status":"archived","durationWeeks":61,"weeks":[],"createdAt":"2020-01-01T00:00:00.000Z"}]'::jsonb)$$,
  'invalid training library input',
  'a grandfathered long mesocycle cannot be extended'
);
select throws_ok(
  $$select public.save_training_library(null, '[{"id":"empty-completed","name":"Empty","goal":"","status":"completed","durationWeeks":1,"weeks":[],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb)$$,
  'mesocycle cannot be completed yet',
  'a mesocycle without a finalized training cannot be manually completed'
);
set local role postgres;
update public.training_libraries
set mesocycles = jsonb_build_array(jsonb_build_object(
  'id', 'future-completed', 'name', 'Future', 'goal', '', 'status', 'active', 'startDate', '2999-01-01',
  'durationWeeks', 1, 'weeks', jsonb_build_array(jsonb_build_object('id', 'week-1', 'weekNumber', 1, 'entries', jsonb_build_array(jsonb_build_object('id', 'session-1', 'ref', jsonb_build_object('routineId', 'routine-1', 'routineName', 'Upper', 'source', 'local'), 'order', 1)))),
  'createdAt', '2026-08-01T00:00:00.000Z'
)) where owner_id = '20000000-0000-0000-0000-000000000001';
insert into public.reward_attempts(owner_id, attempt_id, completed_at, week_start, adherence, valid_sets, planned_sets, mesocycle_id, mesocycle_week, planned_session_id)
values ('20000000-0000-0000-0000-000000000001', 'future-attempt', now(), current_date, 1, 1, 1, 'future-completed', 1, 'session-1');
set local role authenticated;
select throws_ok(
  $$select public.save_training_library(null, '[{"id":"future-completed","name":"Future","goal":"","status":"completed","startDate":"2999-01-01","durationWeeks":1,"weeks":[{"id":"week-1","weekNumber":1,"entries":[{"id":"session-1","ref":{"routineId":"routine-1","routineName":"Upper","source":"local"},"order":1}]}],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb)$$,
  'mesocycle cannot be completed yet',
  'a mesocycle with a future routine cannot be manually completed'
);
set local role postgres;
update public.training_libraries
set mesocycles = jsonb_build_array(jsonb_build_object(
  'id', 'shifted-completed', 'name', 'Shifted', 'goal', '', 'status', 'active', 'startDate', (current_date - 1)::text,
  'durationWeeks', 1, 'scheduleShiftDays', 2,
  'lifecycleHistory', jsonb_build_array(jsonb_build_object('type', 'resumed', 'shiftDays', 2, 'shiftedPlannedSessionIds', jsonb_build_array('pending-session'))),
  'weeks', jsonb_build_array(jsonb_build_object('id', 'week-1', 'weekNumber', 1, 'entries', jsonb_build_array(jsonb_build_object('id', 'done-session', 'ref', jsonb_build_object('routineId', 'routine-1', 'routineName', 'Upper', 'source', 'local'), 'order', 1), jsonb_build_object('id', 'pending-session', 'ref', jsonb_build_object('routineId', 'routine-1', 'routineName', 'Upper', 'source', 'local'), 'order', 2)))),
  'createdAt', '2026-08-01T00:00:00.000Z'
)) where owner_id = '20000000-0000-0000-0000-000000000001';
insert into public.reward_attempts(owner_id, attempt_id, completed_at, week_start, adherence, valid_sets, planned_sets, mesocycle_id, mesocycle_week, planned_session_id)
values ('20000000-0000-0000-0000-000000000001', 'shifted-attempt', now(), current_date, 1, 1, 1, 'shifted-completed', 1, 'done-session');
set local role authenticated;
select throws_ok(
  $$select public.save_training_library(null, jsonb_build_array(jsonb_build_object('id', 'shifted-completed', 'name', 'Shifted', 'goal', '', 'status', 'completed',
    'startDate', (current_date - 1)::text, 'durationWeeks', 1, 'createdAt', '2026-08-01T00:00:00.000Z', 'scheduleShiftDays', 2,
    'lifecycleHistory', jsonb_build_array(jsonb_build_object('type', 'resumed', 'shiftDays', 2, 'shiftedPlannedSessionIds', jsonb_build_array('pending-session'))),
    'weeks', jsonb_build_array(jsonb_build_object('id', 'week-1', 'weekNumber', 1, 'entries', jsonb_build_array(jsonb_build_object('id', 'done-session', 'ref', jsonb_build_object('routineId', 'routine-1', 'routineName', 'Upper', 'source', 'local'), 'order', 1), jsonb_build_object('id', 'pending-session', 'ref', jsonb_build_object('routineId', 'routine-1', 'routineName', 'Upper', 'source', 'local'), 'order', 2)))))))$$,
  'mesocycle cannot be completed yet',
  'server completion uses the per-session pause shift exactly once'
);
set local role postgres;
delete from public.reward_attempts where owner_id = '20000000-0000-0000-0000-000000000001' and attempt_id in ('future-attempt', 'shifted-attempt');
update public.training_libraries set mesocycles = '[]'::jsonb where owner_id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
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

set local role postgres;
update public.training_libraries set mesocycles = jsonb_build_array(
  pg_temp.test_mesocycle('unused-draft', 'draft'),
  pg_temp.test_mesocycle('completed-plan', 'completed'),
  pg_temp.test_mesocycle('cancelled-plan', 'cancelled'),
  pg_temp.test_mesocycle('archived-plan', 'archived')
) where owner_id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
select lives_ok(
  $$select public.save_training_library(null, jsonb_build_array(pg_temp.test_mesocycle('completed-plan', 'completed'), pg_temp.test_mesocycle('cancelled-plan', 'cancelled'), pg_temp.test_mesocycle('archived-plan', 'archived')))$$,
  'an unused draft can be deleted'
);
select throws_ok(
  $$select public.save_training_library(null, jsonb_build_array(pg_temp.test_mesocycle('cancelled-plan', 'cancelled'), pg_temp.test_mesocycle('archived-plan', 'archived')))$$,
  'protected mesocycle cannot be deleted',
  'a completed mesocycle cannot be deleted'
);
select throws_ok(
  $$select public.save_training_library(null, jsonb_build_array(pg_temp.test_mesocycle('completed-plan', 'completed'), pg_temp.test_mesocycle('archived-plan', 'archived')))$$,
  'protected mesocycle cannot be deleted',
  'a cancelled mesocycle cannot be deleted'
);
select throws_ok(
  $$select public.save_training_library(null, jsonb_build_array(pg_temp.test_mesocycle('completed-plan', 'completed'), pg_temp.test_mesocycle('cancelled-plan', 'cancelled')))$$,
  'protected mesocycle cannot be deleted',
  'a legacy archived mesocycle cannot be deleted'
);
set local role postgres;
alter table public.training_libraries disable trigger training_libraries_validate_content;
update public.training_libraries set mesocycles = '[{"name":"missing-id","goal":"","status":"draft","durationWeeks":1,"weeks":[],"createdAt":"2026-08-01T00:00:00.000Z"}]'::jsonb
where owner_id = '20000000-0000-0000-0000-000000000001';
alter table public.training_libraries enable trigger training_libraries_validate_content;
set local role authenticated;
select throws_ok(
  $$select public.save_training_library(null, '[]'::jsonb)$$,
  'invalid training library input',
  'a malformed persisted mesocycle id fails closed during replacement'
);
set local role postgres;
update public.training_libraries set mesocycles = jsonb_build_array(
  pg_temp.test_mesocycle('attempted-active', 'active'),
  pg_temp.test_mesocycle('attempted-draft', 'draft'),
  pg_temp.test_mesocycle('direct-rpc-plan', 'draft'),
  pg_temp.test_mesocycle('cross-owner-draft', 'draft')
) where owner_id = '20000000-0000-0000-0000-000000000001';
insert into public.training_libraries(owner_id, routines, mesocycles) values (
  '20000000-0000-0000-0000-000000000002', '[]'::jsonb, jsonb_build_array(pg_temp.test_mesocycle('cross-owner-draft', 'draft'))
) on conflict (owner_id) do update set routines = excluded.routines, mesocycles = excluded.mesocycles;
insert into public.reward_attempts(owner_id, attempt_id, completed_at, week_start, adherence, valid_sets, planned_sets, mesocycle_id, mesocycle_week, planned_session_id) values
  ('20000000-0000-0000-0000-000000000001', 'active-lineage', now(), current_date, 1, 1, 1, 'attempted-active', 1, 'active-session'),
  ('20000000-0000-0000-0000-000000000001', 'draft-lineage', now(), current_date, 1, 1, 1, 'attempted-draft', 1, 'draft-session'),
  ('20000000-0000-0000-0000-000000000001', 'direct-lineage', now(), current_date, 1, 1, 1, 'direct-rpc-plan', 1, 'direct-session'),
  ('20000000-0000-0000-0000-000000000002', 'other-lineage', now(), current_date, 1, 1, 1, 'cross-owner-draft', 1, 'other-session');
set local role authenticated;
select throws_ok(
  $$select public.save_training_library(null, jsonb_build_array(pg_temp.test_mesocycle('attempted-draft', 'draft'), pg_temp.test_mesocycle('direct-rpc-plan', 'draft'), pg_temp.test_mesocycle('cross-owner-draft', 'draft')))$$,
  'protected mesocycle cannot be deleted',
  'an attempted active mesocycle cannot be deleted'
);
select throws_ok(
  $$select public.save_training_library(null, jsonb_build_array(pg_temp.test_mesocycle('attempted-active', 'active'), pg_temp.test_mesocycle('direct-rpc-plan', 'draft'), pg_temp.test_mesocycle('cross-owner-draft', 'draft')))$$,
  'protected mesocycle cannot be deleted',
  'an attempted draft mesocycle cannot be deleted'
);
select throws_ok(
  $$select public.save_training_library(null, jsonb_build_array(pg_temp.test_mesocycle('attempted-active', 'active'), pg_temp.test_mesocycle('attempted-draft', 'draft'), pg_temp.test_mesocycle('cross-owner-draft', 'draft')))$$,
  'protected mesocycle cannot be deleted',
  'a modified authenticated client cannot bypass lineage protection through the direct RPC'
);
select lives_ok(
  $$select public.save_training_library(null, jsonb_build_array(pg_temp.test_mesocycle('attempted-active', 'active'), pg_temp.test_mesocycle('attempted-draft', 'draft'), pg_temp.test_mesocycle('direct-rpc-plan', 'draft')))$$,
  'another user attempt does not block deletion from the owner library'
);
select lives_ok(
  $$select public.save_training_library(null, jsonb_build_array(pg_temp.test_mesocycle('attempted-active', 'active'), pg_temp.test_mesocycle('attempted-draft', 'draft'), pg_temp.test_mesocycle('direct-rpc-plan', 'draft')))$$,
  'an ordinary unchanged mesocycle save succeeds'
);
set local role postgres;
delete from public.reward_attempts where owner_id = '20000000-0000-0000-0000-000000000002';
delete from public.training_libraries where owner_id = '20000000-0000-0000-0000-000000000002';
set local role authenticated;
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
