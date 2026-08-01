begin;
select plan(22);

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
select lives_ok($$select public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":3600,"exercise_count":1,"metrics":{"volume":1200},"caption":"Strong day","exercise_details":{"exercises":[{"name":"Bench press","muscle_group_ids":["pecho","tríceps"]}]},"publication_key":"automatic-upper"}'::jsonb)$$, 'author can create an approved reduced recap with normalized exercises');
select is(
  public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":3600,"exercise_count":1,"metrics":{"volume":1200},"exercise_details":{"exercises":[{"name":"Bench press","muscle_group_ids":["pecho","tríceps"]}]},"publication_key":"automatic-upper"}'::jsonb),
  public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":3600,"exercise_count":5,"metrics":{"volume":1200},"publication_key":"automatic-upper"}'::jsonb),
  'same publication key returns the original recap without a duplicate'
);
select results_eq($$select jsonb_array_length(public.list_workout_recaps() -> 'recaps')$$, $$values (1)$$, 'publication key is unique per author');
select throws_like($$select public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":1,"exercise_count":1,"metrics":{},"exercise_details":{"exercises":[{"name":"Bench","muscle_group_ids":[],"sets":[]}]},"publication_key":"forbidden"}'::jsonb)$$, 'invalid recap input', 'raw sets and unapproved exercise fields are rejected');
select throws_like($$select public.create_workout_recap('{"routine_name":"Upper","completed_at":"2026-08-01T10:00:00Z","duration_seconds":1,"exercise_count":1,"metrics":{"volume":"private"},"exercise_details":{"exercises":[{"name":"Bench","muscle_group_ids":[]}]},"publication_key":"invalid-metrics"}'::jsonb)$$, 'invalid recap input', 'aggregate metrics accept numbers only');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select results_eq($$select (public.list_workout_recaps() -> 'recaps' -> 0) ? 'author_id'$$, $$values (false)$$, 'projection omits author ID and raw fields');
select results_eq($$select (public.list_workout_recaps() -> 'recaps' -> 0 ->> 'author_alias')$$, $$values ('Recap 1')$$, 'accepted Bro receives recap projection');
select results_eq($$select public.list_workout_recaps() -> 'recaps' -> 0 -> 'muscle_group_ids'$$, $$values ('["pecho", "tríceps"]'::jsonb)$$, 'preview exposes only deduplicated muscle group identifiers');
select results_eq($$select public.get_workout_recap_detail((public.list_workout_recaps() -> 'recaps' -> 0 ->> 'id')::uuid) -> 'exercises'$$, $$values ('[{"name": "Bench press", "muscle_group_ids": ["pecho", "tríceps"]}]'::jsonb)$$, 'accepted Bro receives normalized exercise details without sets');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is_empty($$select jsonb_array_elements(public.list_workout_recaps() -> 'recaps')$$, 'unrelated member receives no recaps');
select throws_like($$select public.get_workout_recap_detail((select id from public.workout_recaps limit 1))$$, 'recap unavailable', 'unrelated member cannot read recap details');
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
select lives_ok($$select public.create_workout_recap('{"routine_name":"Lower","completed_at":"2026-08-01T11:00:00Z","duration_seconds":1800,"exercise_count":1,"metrics":{},"exercise_details":{"exercises":[{"name":"Squat","muscle_group_ids":["cuadriceps"]}]},"publication_key":"automatic-lower"}'::jsonb)$$, 'second recap creates for pagination');
select results_eq($$select jsonb_array_length(public.list_workout_recaps(null, 1) -> 'recaps')$$, $$values (1)$$, 'page size is applied');
select ok((public.list_workout_recaps(null, 1) ->> 'next_cursor') is not null, 'page exposes opaque keyset cursor');
select throws_like($$select public.list_workout_recaps('not-base64')$$, 'invalid cursor', 'malformed cursor returns safe validation error');
select lives_ok($$select public.delete_workout_recap((select (recap.value ->> 'id')::uuid from jsonb_array_elements(public.list_workout_recaps() -> 'recaps') as recap(value) where recap.value ->> 'routine_name' = 'Upper'))$$, 'author soft deletes recap');
select is_empty($$select recap.value from jsonb_array_elements(public.list_workout_recaps() -> 'recaps') as recap(value) where recap.value ->> 'routine_name' = 'Upper'$$, 'soft-deleted recap is omitted');

select * from finish();
rollback;
