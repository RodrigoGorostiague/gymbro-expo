begin;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'milestone-owner@example.com', '', now(), '{}', '{}', now(), now()),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'milestone-bro@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles(id, alias) values
  ('60000000-0000-0000-0000-000000000001', 'Milestone Owner'),
  ('60000000-0000-0000-0000-000000000002', 'Milestone Bro');
insert into public.relationships(member_low, member_high, kind)
values ('60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'bro');
insert into public.exercises(id, canonical_name) values ('EX-6000', 'Catalog Bench Press');
insert into public.workout_start_activities(author_id, routine_name, expires_at)
values ('60000000-0000-0000-0000-000000000001', 'Upper', now() + interval '1 hour');

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
create function pg_temp.attempt(attempt_id text, completed_at text, load_value integer)
returns jsonb language sql as $attempt$
  select jsonb_build_object(
    'version', 1, 'id', attempt_id, 'owner', public.require_actor(), 'routineId', 'routine-milestone',
    'recapPublicationKey', 'milestone-' || attempt_id, 'recordedRoutineName', 'Private routine name', 'completedAt', completed_at, 'durationSeconds', 60, 'restTimerSeconds', 30,
    'exercises', jsonb_build_array(jsonb_build_object('exerciseId', 'EX-6000', 'variant', 'Barra', 'recordedName', 'Untrusted name', 'sets', jsonb_build_array(
      jsonb_build_object('plan', jsonb_build_object('id', attempt_id || '-set', 'type', 1), 'result', jsonb_build_object('setId', attempt_id || '-set', 'performed', true, 'performance', jsonb_build_object('mode', 'external-load', 'reps', 8, 'load', load_value, 'unit', 'kg'))
    )))), 'completion', '{}'::jsonb, 'reward', '{}'::jsonb, 'rewardApplication', '{}'::jsonb
  );
$attempt$;

select lives_ok($$select public.finalize_training_attempt(pg_temp.attempt('baseline', '2026-08-03T12:00:00Z', 20))$$, 'baseline finalizes');
set local role postgres;
select is((select closed_at is not null from public.workout_start_activities where author_id = public.require_actor()), true, 'individual completion closes workout-start presence transactionally');
set local role authenticated;
select lives_ok($$select public.finalize_training_attempt(pg_temp.attempt('pr', '2026-08-10T12:00:00Z', 30))$$, 'personal record finalizes');
set local role postgres;
select is((select count(*) from public.community_activities where author_id = public.require_actor() and kind = 'personal_record'), 0::bigint, 'record stays private before review');
set local role authenticated;
select is(public.stage_workout_completion('pr', '{"routine_name":"Upper","completed_at":"2026-08-10T12:00:00Z","duration_seconds":60,"exercise_count":0,"metrics":{},"publication_key":"milestone-pr","exercise_details":{"exercises":[]}}'), true, 'recap is staged before confirmation');
select lives_ok($$select public.confirm_workout_completion('pr', array[(public.get_workout_completion_preview('pr')->'records'->0->>'id')::uuid])$$, 'one selected record is confirmed');
set local role postgres;
select is((select count(*) from public.community_activities where author_id = public.require_actor() and kind = 'personal_record'), 1::bigint, 'selected record activity is server-generated once');
select is((select payload ->> 'exercise_name' from public.community_activities where author_id = public.require_actor() and kind = 'personal_record'), 'Catalog Bench Press', 'personal record uses the catalog display name, not attempt text');
set local role authenticated;
select lives_ok($$select public.finalize_training_attempt(pg_temp.attempt('pr', '2026-08-10T12:00:00Z', 999))$$, 'retry remains successful');
set local role postgres;
select is((select count(*) from public.community_activities where author_id = public.require_actor() and source_key like 'selected-record:%'), 1::bigint, 'event idempotency survives a changed retry');
set local role authenticated;
select is_empty($$select item.value from jsonb_array_elements(public.list_community_activities() -> 'activities') item(value) where item.value ->> 'kind' = 'rank_up'$$, 'ordinary levels do not create a per-level activity');

set local role postgres;
update public.profiles set share_social_muscle_distribution = false where id = '60000000-0000-0000-0000-000000000001';
select private.publish_training_community_milestones('60000000-0000-0000-0000-000000000001', 'pr');
select is((select count(*) from public.community_activities where author_id = '60000000-0000-0000-0000-000000000001' and kind = 'muscle_balance_improved'), 0::bigint, 'muscle balance activity requires the explicit social sharing opt-in');

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select is((public.list_community_activities() -> 'activities' -> 0) ? 'author_id', false, 'viewer projection omits the internal author ID');
select throws_ok($$select * from public.community_activities$$, '42501', null, 'authenticated callers cannot directly read milestone rows');

select * from finish();
rollback;
