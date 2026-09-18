begin;
select plan(34);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'xp-owner@example.com', '', now(), '{}', '{}', now(), now()),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'xp-bro@example.com', '', now(), '{}', '{}', now(), now()),
  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'xp-stranger@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles(id, alias) values
  ('50000000-0000-0000-0000-000000000001', 'XP Owner'),
  ('50000000-0000-0000-0000-000000000002', 'XP Bro'),
  ('50000000-0000-0000-0000-000000000003', 'XP Stranger');
update public.profiles set presentation_theme_id = 'violeta'
where id = '50000000-0000-0000-0000-000000000001';
insert into public.relationships(member_low, member_high, kind)
values ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'bro');

select is(public.experience_xp_for_level(1), 100, 'level one curve is ceil(80 + 20 * level^1.45)');
select is(public.experience_xp_for_level(2), ceil(80 + 20 * power(2::numeric, 1.45))::integer, 'curve is calculated on the server');
select is(
  array[public.experience_rank(1), public.experience_rank(5), public.experience_rank(10), public.experience_rank(20), public.experience_rank(35), public.experience_rank(50), public.experience_rank(70), public.experience_rank(85)],
  array['Principiante', 'Intermedio', 'Avanzado', 'GymBro', 'GymRat', 'G-Boom', 'Alfa', 'Sigma'],
  'rank labels use all requested level boundaries'
);
select is(public.profile_frame_unlock_level('alfa-user'), 1, 'Alfa User frame is globally unlocked during alpha');
select is(public.profile_title_unlock_level('alfa-user'), 1, 'Alfa User title is globally unlocked during alpha');

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);

select is(
  public.load_experience_progress(),
  '{"level":1,"rank":"Principiante","xp_into_level":0,"xp_for_next_level":100,"total_xp":0}'::jsonb,
  'load progress creates and returns the default receipt-shaped level-one payload'
);
set local role postgres;
select is((select count(*) from public.experience_progress where owner_id = '50000000-0000-0000-0000-000000000001'), 1::bigint, 'load progress creates only one server-owned row');
set local role authenticated;

create function pg_temp.test_xp_attempt(attempt_id text, set_count integer, load_value numeric, claimed_pr boolean default false)
returns jsonb language sql as $$
  select jsonb_build_object(
    'version', 1, 'id', attempt_id, 'owner', public.require_actor(), 'routineId', 'routine-xp',
    'recordedRoutineName', 'XP routine', 'completedAt', '2026-08-03T12:00:00Z',
    'durationSeconds', 60, 'restTimerSeconds', 30,
    'exercises', jsonb_build_array(jsonb_build_object('exerciseId', 'bench-press', 'recordedName', 'Bench press', 'claimedPersonalRecord', claimed_pr, 'sets', (
      select jsonb_agg(jsonb_build_object(
        'plan', jsonb_build_object('id', attempt_id || '-set-' || value),
        'result', jsonb_build_object('setId', attempt_id || '-set-' || value, 'performed', true,
          'performance', jsonb_build_object('mode', 'external-load', 'reps', 8, 'load', load_value, 'unit', 'kg'))
      )) from generate_series(1, set_count) value
    ))), 'completion', '{}'::jsonb, 'reward', '{}'::jsonb, 'rewardApplication', '{}'::jsonb
  )
$$;

select is((public.finalize_training_attempt(pg_temp.test_xp_attempt('baseline', 10, 20)) -> 'experience_receipt' ->> 'earned_xp')::integer, 50, 'valid sets, completion, and perfection XP are server-calculated');
select is((public.finalize_training_attempt(pg_temp.test_xp_attempt('personal-record', 10, 30, false)) -> 'experience_receipt' ->> 'earned_xp')::integer, 58, 'a higher immutable snapshot earns one server-derived personal record');
select is((public.finalize_training_attempt(pg_temp.test_xp_attempt('personal-record', 10, 30, false)) -> 'experience_receipt' -> 'entries' -> 3 ->> 'amount')::integer, 8, 'client PR claims are not needed for the PR award');
select set_config('test.weekly_cap_receipt', (public.finalize_training_attempt(pg_temp.test_xp_attempt('weekly-cap', 15, 40, true)) -> 'experience_receipt')::text, true);
select is((current_setting('test.weekly_cap_receipt')::jsonb ->> 'earned_xp')::integer, 75, 'the session XP award is capped at 75 after the weekly target and PR');
select is((current_setting('test.weekly_cap_receipt')::jsonb -> 'entries' -> 0 ->> 'amount')::integer, 24, 'valid-set XP is capped at twelve sets');
select is((current_setting('test.weekly_cap_receipt')::jsonb -> 'entries' -> 3 ->> 'amount')::integer, 21, 'the final component is reduced only by the session cap');
select is(
  public.finalize_training_attempt(pg_temp.test_xp_attempt('weekly-cap', 15, 999, false)) -> 'experience_receipt',
  current_setting('test.weekly_cap_receipt')::jsonb,
  'retry returns the exact original experience receipt despite changed client input'
);
set local role postgres;
select is((select count(*) from public.experience_ledger_entries where owner_id = '50000000-0000-0000-0000-000000000001' and attempt_id = 'weekly-cap'), 4::bigint, 'retry creates no duplicate XP ledger entries');
set local role authenticated;
select is((current_setting('test.weekly_cap_receipt')::jsonb -> 'progress' ->> 'total_xp')::integer, 183, 'XP progress is separate from the gem wallet balance');
select is((public.finalize_training_attempt(pg_temp.test_xp_attempt('weekly-cap', 15, 999, false)) -> 'receipt' ->> 'balance')::integer, 105, 'existing gem rewards retain their independent calculation');
select throws_ok($$select * from public.experience_progress$$, '42501', null, 'authenticated clients cannot directly read XP progress');

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select is_empty($$select activity.value from jsonb_array_elements(public.list_community_activities() -> 'activities') activity(value) where activity.value ->> 'kind' = 'rank_up'$$, 'level changes inside the same rank do not publish rank activities');
select throws_ok($$select * from public.community_activities$$, '42501', null, 'community activities have no direct authenticated reads');

set local role postgres;
update public.experience_progress
set level = 4, xp_into_level = public.experience_xp_for_level(4) - 50
where owner_id = '50000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.finalize_training_attempt(pg_temp.test_xp_attempt('rank-boundary', 10, 45))$$, 'crossing into a new rank finalizes');
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select is((select activity.value ->> 'kind' from jsonb_array_elements(public.list_community_activities() -> 'activities') activity(value) where activity.value ->> 'kind' = 'rank_up'), 'rank_up', 'connected viewer receives a generic rank-up activity');
select is((select (activity.value -> 'payload' ->> 'level')::integer from jsonb_array_elements(public.list_community_activities() -> 'activities') activity(value) where activity.value ->> 'kind' = 'rank_up'), 5, 'rank-up activity records the new level');
select is((select activity.value -> 'payload' ->> 'rank' from jsonb_array_elements(public.list_community_activities() -> 'activities') activity(value) where activity.value ->> 'kind' = 'rank_up'), 'Intermedio', 'rank-up activity records the crossed rank');
select is((select activity.value -> 'payload' ->> 'unlocked_frame_id' from jsonb_array_elements(public.list_community_activities() -> 'activities') activity(value) where activity.value ->> 'kind' = 'rank_up'), 'intermedio', 'rank-up activity records the unlocked frame');
select is((select activity.value -> 'payload' ->> 'unlocked_title_id' from jsonb_array_elements(public.list_community_activities() -> 'activities') activity(value) where activity.value ->> 'kind' = 'rank_up'), 'intermedio', 'rank-up activity records the unlocked title');
select is(
  (public.list_community_activities() -> 'activities' -> 0) - 'id' - 'kind' - 'payload' - 'created_at' - 'author_alias',
  '{"author_avatar_id":"capybara-athlete","author_frame_id":"principiante","author_title_id":"principiante","author_theme_id":"violeta"}'::jsonb,
  'activity projection exposes only safe author presentation metadata'
);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.finalize_training_attempt(pg_temp.test_xp_attempt('rank-boundary', 10, 999))$$, 'rank-boundary retry remains successful');
set local role postgres;
select is((select count(*) from public.community_activities where author_id = '50000000-0000-0000-0000-000000000001' and source_key = 'rank-up:Intermedio'), 1::bigint, 'rank-specific activity source key is idempotent');
set local role authenticated;

set local role postgres;
insert into public.blocks(blocker_id, blocked_id) values ('50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select is_empty($$select jsonb_array_elements(public.list_community_activities() -> 'activities')$$, 'blocked connected viewer cannot see rank-up activity');
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000003', true);
select is_empty($$select jsonb_array_elements(public.list_community_activities() -> 'activities')$$, 'unconnected viewer cannot see rank-up activity');

set local role postgres;
delete from public.blocks;
insert into public.community_activities(author_id, kind, source_key, payload, created_at) values
  ('50000000-0000-0000-0000-000000000001', 'rank_up', 'rank-up:98', '{"level": 98, "rank": "Sigma"}', '2030-01-01T00:00:00Z'),
  ('50000000-0000-0000-0000-000000000001', 'rank_up', 'rank-up:99', '{"level": 99, "rank": "Sigma"}', '2030-01-02T00:00:00Z');
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select is((public.list_community_activities(null, 1) -> 'activities' -> 0 -> 'payload' ->> 'level')::integer, 99, 'activity feed orders newest first');
select ok((public.list_community_activities(null, 1) ->> 'next_cursor') is not null, 'activity feed exposes an opaque keyset cursor');
select set_config('test.activity_cursor', public.list_community_activities(null, 1) ->> 'next_cursor', true);
select is((public.list_community_activities(current_setting('test.activity_cursor'), 1) -> 'activities' -> 0 -> 'payload' ->> 'level')::integer, 98, 'activity feed cursor continues in descending order');

select * from finish();
rollback;
