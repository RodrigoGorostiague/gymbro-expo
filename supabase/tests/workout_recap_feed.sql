begin;
select plan(37);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select format('10000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', format('recap%s@example.com', value), '', now(), '{}', '{}', now(), now()
from generate_series(1, 4) as value;
insert into public.profiles (id, alias)
select format('10000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid, format('Recap %s', value) from generate_series(1, 4) as value;
insert into public.relationships (member_low, member_high, kind) values
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'bro'),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'partner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select col_default_is('public', 'profiles', 'auto_share_completed_workouts', 'true', 'completed workout sharing defaults to enabled');
select col_default_is('public', 'profiles', 'share_routine_template', 'true', 'routine template sharing defaults to enabled');
select col_default_is('public', 'profiles', 'share_mesocycle_template', 'true', 'mesocycle template sharing defaults to enabled');
select lives_ok($$select public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":3600,"exercise_count":1,"metrics":{"volume":1200},"caption":"Strong day","exercise_details":{"exercises":[{"name":"Bench press","muscle_group_ids":["pecho","tríceps"],"sets":[{"weight":80,"reps":8,"completed":true}]}]},"publication_key":"automatic-upper"}'::jsonb)$$, 'author can create an approved recap with normalized exercises and performed sets');
select is(
  public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":3600,"exercise_count":1,"metrics":{"volume":1200},"exercise_details":{"exercises":[{"name":"Bench press","muscle_group_ids":["pecho","tríceps"],"sets":[{"weight":80,"reps":8,"completed":true}]}]},"publication_key":"automatic-upper"}'::jsonb),
  public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":3600,"exercise_count":1,"metrics":{"volume":1200},"exercise_details":{"exercises":[{"name":"Bench press","muscle_group_ids":["pecho","tríceps"],"sets":[{"weight":80,"reps":8,"completed":true}]}]},"publication_key":"automatic-upper"}'::jsonb),
  'same publication key returns the original recap without a duplicate'
);
select results_eq($$select jsonb_array_length(public.list_workout_recaps() -> 'recaps')$$, $$values (1)$$, 'publication key is unique per author');
select throws_like($$select public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":1,"exercise_count":1,"metrics":{},"exercise_details":{"exercises":[{"name":"Bench","muscle_group_ids":[],"sets":[{"weight":80,"reps":8,"completed":true,"id":"local-set"}]}]},"publication_key":"forbidden"}'::jsonb)$$, 'invalid recap input', 'performed sets reject local identifiers and unapproved fields');
select throws_like($$select public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":1,"exercise_count":1,"metrics":{"volume":"private"},"exercise_details":{"exercises":[{"name":"Bench","muscle_group_ids":[],"sets":[]}]},"publication_key":"invalid-metrics"}'::jsonb)$$, 'invalid recap input', 'aggregate metrics accept numbers only');
select throws_like($$select public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":1,"exercise_count":1,"metrics":{},"exercise_details":{"exercises":[{"name":"Bench","muscle_group_ids":[],"sets":[]}]},"share_payload":{"version":1,"routine":{"id":"private"}},"publication_key":"invalid-template"}'::jsonb)$$, 'invalid recap share payload', 'template payload rejects internal identifiers and unexpected fields');
select throws_like($$select public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":1,"exercise_count":1,"metrics":{},"exercise_details":{"exercises":[{"name":"Bench","muscle_group_ids":[],"sets":[]}]},"share_payload":{"version":1,"routine":{"name":"Upper","muscleGroups":["pecho"],"exercises":[{"name":"Bench","muscleGroups":["pecho"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"id":"local-set","tipo":"C","weight":80,"reps":8}]}]}},"publication_key":"invalid-template-id"}'::jsonb)$$, 'invalid recap share payload', 'nested template sets reject internal IDs');
select throws_like($$select public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":1,"exercise_count":1,"metrics":{},"exercise_details":{"exercises":[{"name":"Bench","muscle_group_ids":[],"sets":[]}]},"share_payload":{"version":1,"routine":{"name":"Upper","muscleGroups":["pecho"],"exercises":[{"name":"Bench","muscleGroups":["pecho"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":"C","weight":"private","reps":8}]}]}},"publication_key":"invalid-template-shape"}'::jsonb)$$, 'invalid recap share payload', 'nested template primitive types are validated');
select throws_like($$select public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":1,"exercise_count":1,"metrics":{},"exercise_details":{"exercises":[{"name":"Bench","muscle_group_ids":[],"sets":[]}]},"share_payload":{"version":1,"routine":{"name":"Upper","muscleGroups":["pecho"],"exercises":[{"name":"Bench","muscleGroups":["pecho"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[null]}]}},"publication_key":"invalid-template-null-set"}'::jsonb)$$, 'invalid recap share payload', 'template payload rejects null set entries');
select throws_like($$select public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":1,"exercise_count":1,"metrics":{},"exercise_details":{"exercises":[{"name":"Bench","muscle_group_ids":[],"sets":[]}]},"share_payload":{"version":"1","routine":{"name":"Upper","muscleGroups":["pecho"],"exercises":[{"name":"Bench","muscleGroups":["pecho"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":"C","weight":80,"reps":8}]}]}},"publication_key":"invalid-template-version"}'::jsonb)$$, 'invalid recap share payload', 'template version must be JSON number one');
select throws_like($$select public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":1,"exercise_count":1,"metrics":{},"exercise_details":{"exercises":[{"name":"Bench","muscle_group_ids":[],"sets":[]}]},"share_payload":{"version":1,"routine":{"name":"Upper","muscleGroups":["pecho"],"exercises":[{"name":"Bench","muscleGroups":["pecho"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":"C","weight":80,"reps":8}]}]},"mesocycle":{"name":"Plan","goal":"Goal","durationWeeks":1,"routines":[{"name":"Upper","muscleGroups":["pecho"],"exercises":[{"name":"Bench","muscleGroups":["pecho"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":"C","weight":80,"reps":8}]}]}],"weeks":[[{"routineIndex":0,"progressionNote":"private"}]]}},"publication_key":"invalid-template-note"}'::jsonb)$$, 'invalid recap share payload', 'template payload rejects private progression notes');
select lives_ok($$select public.create_workout_recap('{"routine_name":"Shared template","completed_at":"2026-08-01T10:30:00Z","duration_seconds":3600,"exercise_count":1,"metrics":{"volume":1200},"exercise_details":{"exercises":[{"name":"Bench press","muscle_group_ids":["pecho","tríceps"],"sets":[{"weight":80,"reps":8,"completed":true}]}]},"share_payload":{"version":1,"routine":{"name":"Shared template","muscleGroups":["pecho","tríceps"],"exercises":[{"name":"Bench press","muscleGroups":["pecho","tríceps"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":"C","weight":80,"reps":8}]}]},"mesocycle":{"name":"Strength plan","goal":"Build strength","durationWeeks":1,"routines":[{"name":"Shared template","muscleGroups":["pecho","tríceps"],"exercises":[{"name":"Bench press","muscleGroups":["pecho","tríceps"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":"C","weight":80,"reps":8}]}]}],"weeks":[[{"routineIndex":0,"dayLabel":"Monday"}]]},"performedSets":[{"exerciseIndex":0,"sets":[{"weight":80,"reps":8,"completed":true}]}]},"publication_key":"shared-template"}'::jsonb)$$, 'author can create a recap with a complete optional share payload');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select results_eq($$select (public.list_workout_recaps() -> 'recaps' -> 0) ? 'author_id'$$, $$values (false)$$, 'projection omits author ID and raw fields');
select results_eq($$select (public.list_workout_recaps() -> 'recaps' -> 0 ->> 'author_alias')$$, $$values ('Recap 1')$$, 'accepted Bro receives recap projection');
select results_eq($$select (public.list_workout_recaps() -> 'recaps' -> 0 ->> 'is_author')$$, $$values ('false')$$, 'non-author list projection is server-marked');
select results_eq($$select public.list_workout_recaps() -> 'recaps' -> 0 -> 'muscle_group_ids'$$, $$values ('["pecho", "tríceps"]'::jsonb)$$, 'preview exposes only deduplicated muscle group identifiers');
select results_eq($$select public.list_workout_recaps() -> 'recaps' -> 0 -> 'muscle_distribution'$$, $$values ('[{"id": "pecho", "value": 1}, {"id": "tríceps", "value": 1}]'::jsonb)$$, 'preview exposes only safe per-exercise muscle group counts');
select results_eq($$select public.get_workout_recap_detail((public.list_workout_recaps() -> 'recaps' -> 0 ->> 'id')::uuid) -> 'exercises'$$, $$values ('[{"name": "Bench press", "muscle_group_ids": ["pecho", "tríceps"], "sets": [{"weight": 80, "reps": 8, "completed": true}]}]'::jsonb)$$, 'accepted Bro receives normalized exercise details with performed sets');
select results_eq($$select public.get_workout_recap_detail((public.list_workout_recaps() -> 'recaps' -> 0 ->> 'id')::uuid) ->> 'is_author'$$, $$values ('false')$$, 'non-author detail projection is server-marked');
select results_eq($$select public.get_workout_recap_detail((select (recap.value ->> 'id')::uuid from jsonb_array_elements(public.list_workout_recaps() -> 'recaps') as recap(value) where recap.value ->> 'routine_name' = 'Shared template')) -> 'share_payload'$$, $$values ('{"version": 1, "routine": {"name": "Shared template", "muscleGroups": ["pecho", "tríceps"], "exercises": [{"name": "Bench press", "muscleGroups": ["pecho", "tríceps"], "loadMode": "external-load", "loadUnit": "kg", "variant": "barbell", "sets": [{"tipo": "C", "weight": 80, "reps": 8}]}]}, "mesocycle": {"name": "Strength plan", "goal": "Build strength", "durationWeeks": 1, "routines": [{"name": "Shared template", "muscleGroups": ["pecho", "tríceps"], "exercises": [{"name": "Bench press", "muscleGroups": ["pecho", "tríceps"], "loadMode": "external-load", "loadUnit": "kg", "variant": "barbell", "sets": [{"tipo": "C", "weight": 80, "reps": 8}]}]}], "weeks": [[{"routineIndex": 0, "dayLabel": "Monday"}]]}, "performedSets": [{"exerciseIndex": 0, "sets": [{"weight": 80, "reps": 8, "completed": true}]}]}'::jsonb)$$, 'authorized detail returns the persisted complete share payload');
select set_config('test.recap_id', public.list_workout_recaps() -> 'recaps' -> 0 ->> 'id', true);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is_empty($$select jsonb_array_elements(public.list_workout_recaps() -> 'recaps')$$, 'unrelated member receives no recaps');
select throws_like($$select public.get_workout_recap_detail(current_setting('test.recap_id')::uuid)$$, 'recap unavailable', 'unrelated member cannot read recap details');
select throws_like($$select * from public.workout_recaps$$, 'permission denied for table workout_recaps', 'base table is not directly readable');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role postgres;
insert into public.blocks (blocker_id, blocked_id) values ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');
set local role authenticated;
select is_empty($$select jsonb_array_elements(public.list_workout_recaps() -> 'recaps')$$, 'either-direction block removes feed eligibility');
set local role postgres;
delete from public.blocks;
delete from public.relationships where member_low = '10000000-0000-0000-0000-000000000001' and member_high = '10000000-0000-0000-0000-000000000002';
set local role authenticated;
select is_empty($$select jsonb_array_elements(public.list_workout_recaps() -> 'recaps')$$, 'relationship removal removes feed eligibility');
set local role postgres;
insert into public.relationships (member_low, member_high, kind) values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'bro');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_like($$select public.delete_workout_recap((public.list_workout_recaps() -> 'recaps' -> 0 ->> 'id')::uuid)$$, 'recap unavailable', 'non-author cannot delete');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select results_eq($$select (public.list_workout_recaps() -> 'recaps' -> 0 ->> 'is_author')$$, $$values ('true')$$, 'author list projection is server-marked');
select results_eq($$select public.get_workout_recap_detail((public.list_workout_recaps() -> 'recaps' -> 0 ->> 'id')::uuid) ->> 'is_author'$$, $$values ('true')$$, 'author detail projection is server-marked');
select lives_ok($$select public.create_workout_recap('{"routine_name":"Lower","completed_at":"2026-08-01T11:00:00Z","duration_seconds":1800,"exercise_count":1,"metrics":{},"exercise_details":{"exercises":[{"name":"Squat","muscle_group_ids":["cuadriceps"],"sets":[{"weight":100,"reps":5,"completed":true}]}]},"publication_key":"automatic-lower"}'::jsonb)$$, 'second recap creates for pagination');
select results_eq($$select jsonb_array_length(public.list_workout_recaps(null, 1) -> 'recaps')$$, $$values (1)$$, 'page size is applied');
select ok((public.list_workout_recaps(null, 1) ->> 'next_cursor') is not null, 'page exposes opaque keyset cursor');
select throws_like($$select public.list_workout_recaps('not-base64')$$, 'invalid cursor', 'malformed cursor returns safe validation error');
select lives_ok($$select public.delete_workout_recap((select (recap.value ->> 'id')::uuid from jsonb_array_elements(public.list_workout_recaps() -> 'recaps') as recap(value) where recap.value ->> 'routine_name' = 'Upper'))$$, 'author soft deletes recap');
select is_empty($$select recap.value from jsonb_array_elements(public.list_workout_recaps() -> 'recaps') as recap(value) where recap.value ->> 'routine_name' = 'Upper'$$, 'soft-deleted recap is omitted');

select * from finish();
rollback;
