begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select format('20000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', format('start%s@example.com', value), '', now(), '{}', '{}', now(), now()
from generate_series(1, 3) as value;
insert into public.profiles (id, alias)
select format('20000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid, format('Start %s', value) from generate_series(1, 3) as value;
insert into public.relationships (member_low, member_high, kind) values
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'bro');

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.publish_workout_start_activity('{"routine_name":"Upper"}'::jsonb)$$, 'author can publish a reduced start activity');
select results_eq($$select jsonb_array_length(public.list_workout_start_activities())$$, $$values (1)$$, 'author sees their active activity');
select results_eq($$select (public.list_workout_start_activities() -> 0) ? 'author_id'$$, $$values (false)$$, 'projection omits author ID');
select throws_like($$select public.publish_workout_start_activity('{"routine_name":""}'::jsonb)$$, 'invalid workout start activity', 'blank routine is rejected');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select results_eq($$select public.list_workout_start_activities() -> 0 ->> 'author_alias'$$, $$values ('Start 1')$$, 'accepted circle member sees activity');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', true);
select is_empty($$select jsonb_array_elements(public.list_workout_start_activities())$$, 'unrelated member sees no activity');
select throws_like($$select * from public.workout_start_activities$$, 'permission denied for table workout_start_activities', 'base table is not directly readable');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.close_workout_start_activity()$$, 'author can close their activity');
select is_empty($$select jsonb_array_elements(public.list_workout_start_activities())$$, 'closed activity leaves the feed');
select lives_ok($$select public.close_workout_start_activity()$$, 'closing an already closed activity is idempotent');

select * from finish();
rollback;
