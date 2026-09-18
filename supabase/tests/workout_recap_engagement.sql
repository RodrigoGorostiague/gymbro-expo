begin;
select plan(24);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select format('30000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', format('recap%s@example.com', value), '', now(), '{}', '{}', now(), now() from generate_series(1, 3) as value;
insert into public.profiles (id, alias) select format('30000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid, format('Recap %s', value) from generate_series(1, 3) as value;
insert into public.relationships (member_low, member_high, kind) values ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'bro');
insert into public.workout_recaps (id, author_id, routine_name, completed_at, duration_seconds, exercise_count, metrics, exercise_details) values ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Upper', now(), 1200, 1, '{}'::jsonb, '{"exercises":[]}'::jsonb);
insert into public.workout_recaps (id, author_id, routine_name, completed_at, duration_seconds, exercise_count, metrics, exercise_details) values ('31000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000001', 'Upper', now() - interval '7 days', 900, 1, '{"volume":500}'::jsonb, '{"exercises":[]}'::jsonb);
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workout_recaps'), 'recaps are published for Realtime authorization');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workout_recaps' and policyname = 'workout_recaps_realtime_read'), 'recaps have an explicit Realtime read policy');

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select lives_ok($$select public.get_workout_recap_detail('31000000-0000-0000-0000-000000000001')$$, 'authorized viewer can open an individual workout detail');
select is(public.get_workout_recap_detail('31000000-0000-0000-0000-000000000001') -> 'previous_comparable' ->> 'id', '31000000-0000-0000-0000-000000000000', 'detail compares only the previous visible recap of the same routine');
select lives_ok($$select public.set_workout_recap_reaction('31000000-0000-0000-0000-000000000001', true)$$, 'circle member can react');
select results_eq($$select (public.set_workout_recap_reaction('31000000-0000-0000-0000-000000000001', true) ->> 'reaction_count')::integer$$, $$values (1)$$, 'setting the same reaction is idempotent');
select results_eq($$select public.set_workout_recap_reaction('31000000-0000-0000-0000-000000000001', false) ->> 'reacted'$$, $$values ('false')$$, 'reaction can be removed');
select results_eq($$select (public.get_workout_recap_detail('31000000-0000-0000-0000-000000000001') ->> 'reaction_count')::integer$$, $$values (0)$$, 'detail projects a safe reaction count');
select lives_ok($$select public.create_workout_recap_comment('31000000-0000-0000-0000-000000000001', '  Excelente sesión  ')$$, 'circle member can comment');
select results_eq($$select public.get_workout_recap_detail('31000000-0000-0000-0000-000000000001') -> 'comments' -> 0 ->> 'body'$$, $$values ('Excelente sesión')$$, 'detail returns trimmed comment projection');
select results_eq($$select public.get_workout_recap_detail('31000000-0000-0000-0000-000000000001') -> 'comments' -> 0 ? 'author_id'$$, $$values (false)$$, 'comment projection omits author IDs');
select throws_like($$select public.create_workout_recap_comment('31000000-0000-0000-0000-000000000001', '')$$, 'invalid recap comment', 'blank comments are rejected');
select throws_like($$select * from public.workout_recap_comments$$, 'permission denied for table workout_recap_comments', 'comments table is not directly readable');
select throws_like($$select * from public.workout_recap_reactions$$, 'permission denied for table workout_recap_reactions', 'reactions table is not directly readable');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select throws_like($$select public.get_workout_recap_detail('31000000-0000-0000-0000-000000000001')$$, 'recap unavailable', 'unrelated member cannot read recap engagement');
select throws_like($$select public.set_workout_recap_reaction('31000000-0000-0000-0000-000000000001', true)$$, 'recap unavailable', 'unrelated member cannot react');
select throws_like($$select public.create_workout_recap_comment('31000000-0000-0000-0000-000000000001', 'Nope')$$, 'recap unavailable', 'unrelated member cannot comment');

reset role;
insert into public.blocks (blocker_id, blocked_id) values ('30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select throws_like($$select public.get_workout_recap_detail('31000000-0000-0000-0000-000000000001')$$, 'recap unavailable', 'blocked member cannot read recap engagement');
select throws_like($$select public.set_workout_recap_reaction('31000000-0000-0000-0000-000000000001', true)$$, 'recap unavailable', 'blocked member cannot react');
select throws_like($$select public.create_workout_recap_comment('31000000-0000-0000-0000-000000000001', 'Nope')$$, 'recap unavailable', 'blocked member cannot comment');

reset role;
delete from public.blocks;
delete from public.relationships where member_low = '30000000-0000-0000-0000-000000000001' and member_high = '30000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select throws_like($$select public.get_workout_recap_detail('31000000-0000-0000-0000-000000000001')$$, 'recap unavailable', 'former member cannot read recap engagement');
select throws_like($$select public.set_workout_recap_reaction('31000000-0000-0000-0000-000000000001', true)$$, 'recap unavailable', 'former member cannot react');
select throws_like($$select public.create_workout_recap_comment('31000000-0000-0000-0000-000000000001', 'Nope')$$, 'recap unavailable', 'former member cannot comment');

reset role;
select results_eq($$select count(*)::integer from public.notification_inbox where recipient_id = '30000000-0000-0000-0000-000000000001' and kind in ('workout_recap_reaction', 'workout_recap_comment')$$, $$values (2)$$, 'engagement creates author inbox events');

select * from finish();
rollback;
