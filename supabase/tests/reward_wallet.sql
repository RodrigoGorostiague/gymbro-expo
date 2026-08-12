begin;
select plan(49);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wallet@example.com', '', now(), '{}', '{}', now(), now()),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wallet-other@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles(id, alias) values ('40000000-0000-0000-0000-000000000001', 'Wallet One'), ('40000000-0000-0000-0000-000000000002', 'Wallet Two');
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);

select throws_ok($$insert into public.reward_wallets(owner_id, balance) values ('40000000-0000-0000-0000-000000000002', 99)$$, '42501', null, 'wallet tables have no direct authenticated writes');
select lives_ok($$select public.save_training_library('[{"id":"routine-1","name":"Routine","createdAt":"2026-08-03T00:00:00Z","muscleGroups":["GM-100"],"exercises":[]}]', '[{"id":"meso-1","name":"Block","status":"active","durationWeeks":1,"createdAt":"2026-08-03T00:00:00Z","weeks":[{"id":"week-1","weekNumber":1,"entries":[{"id":"plan-1","ref":{"routineId":"routine-1","routineName":"Routine","source":"local"}},{"id":"plan-2","ref":{"routineId":"routine-1","routineName":"Routine","source":"local"}}]}]}]')$$, 'active mesocycle is saved for target derivation');

create function pg_temp.test_attempt(id text, performed integer, lineage jsonb default null)
returns jsonb language sql as $$
  select jsonb_build_object('version', 1, 'id', id, 'owner', public.require_actor(), 'routineId', 'routine-1', 'recordedRoutineName', 'Routine', 'completedAt', '2026-08-03T12:00:00Z', 'durationSeconds', 60, 'restTimerSeconds', 30, 'lineage', lineage, 'exercises', jsonb_build_array(jsonb_build_object('recordedName', 'Press', 'sets', (
    select jsonb_agg(jsonb_build_object('plan', jsonb_build_object('id', 'set-' || value), 'result', jsonb_build_object('setId', 'set-' || value, 'performed', value <= performed, 'performance', case when value <= performed then jsonb_build_object('mode', 'external-load', 'reps', 8, 'load', 20, 'unit', 'kg') else null end))) from generate_series(1, 10) value
  ))), 'completion', '{}'::jsonb, 'reward', '{}'::jsonb, 'rewardApplication', '{}'::jsonb)
$$;

select is((public.finalize_training_attempt(pg_temp.test_attempt('partial', 6)) -> 'attempt' -> 'reward' ->> 'totalGems')::integer, 6, 'under 70 percent earns valid sets only');
select lives_ok($$select public.save_training_state(null, null, null, '{"version":1,"owner":"40000000-0000-0000-0000-000000000001","attemptId":"partial","routineId":"routine-1","startedAtMs":1,"restTimerSeconds":30,"completedSets":{},"setValues":{}}', true)$$, 'late draft save after finalization is accepted without restoring the draft');
select is(public.load_training_state() -> 'activeWorkoutDraft', 'null'::jsonb, 'late finalized draft stays cleared');
select ok(public.load_training_state() -> 'attempts' @> '[{"id":"partial"}]'::jsonb, 'late draft save preserves the finalized attempt');
select is((public.finalize_training_attempt(pg_temp.test_attempt('completed', 7)) -> 'attempt' -> 'reward' ->> 'totalGems')::integer, 11, '70 to 99 percent earns valid sets plus completion');
select is((public.finalize_training_attempt(pg_temp.test_attempt('perfect', 10)) -> 'attempt' -> 'reward' ->> 'totalGems')::integer, 26, '100 percent earns capped valid sets plus completion and perfection');
set local role postgres;
select is((select count(*) from public.reward_ledger_entries where owner_id = public.require_actor() and attempt_id = 'perfect'), 3::bigint, 'attempt receipt has one ledger entry per reward component');
select is((public.finalize_training_attempt(pg_temp.test_attempt('perfect', 10)) -> 'receipt' ->> 'balance')::integer, (select balance from public.reward_wallets where owner_id = public.require_actor()), 'retry returns the original receipt without duplicate credit');
select ok(not exists(select 1 from public.reward_ledger_entries where owner_id = public.require_actor() and kind = 'weekly_goal'), 'weekly target waits for three completed routines');

select lives_ok($$select public.finalize_training_attempt(pg_temp.test_attempt('plan-one', 10, '{"mesocycleId":"meso-1","weekNumber":1,"plannedSessionId":"plan-1"}'::jsonb))$$, 'first planned completion is accepted');
select is(public.finalize_training_attempt(pg_temp.test_attempt('plan-one-retry', 10, '{"mesocycleId":"meso-1","weekNumber":1,"plannedSessionId":"plan-1"}'::jsonb)) -> 'attempt' ->> 'id', 'plan-one', 'a different-id retry returns the original planned-session attempt');
select ok(exists(select 1 from public.reward_ledger_entries where owner_id = public.require_actor() and kind = 'weekly_goal'), 'weekly target grants once after three completed routines');
select lives_ok($$select public.finalize_training_attempt(pg_temp.test_attempt('plan-two', 10, '{"mesocycleId":"meso-1","weekNumber":1,"plannedSessionId":"plan-2"}'::jsonb))$$, 'second planned completion reaches mesocycle milestones');
select lives_ok($$select public.finalize_training_attempt(pg_temp.test_attempt('extra-one', 10)); select public.finalize_training_attempt(pg_temp.test_attempt('extra-two', 10))$$, 'additional completions are accepted after the weekly target');
select is((select count(*) from public.reward_ledger_entries where owner_id = public.require_actor() and kind = 'weekly_extra'), 2::bigint, 'weekly extra reward is capped at two');
select ok(exists(select 1 from public.reward_ledger_entries where owner_id = public.require_actor() and kind = 'mesocycle_perfect_week'), 'perfect planned week bonus is idempotently ledgered');
select ok(exists(select 1 from public.reward_ledger_entries where owner_id = public.require_actor() and kind = 'mesocycle_complete'), 'mesocycle completion bonus requires linked planned sessions');
select ok(exists(select 1 from public.reward_ledger_entries where owner_id = public.require_actor() and kind = 'mesocycle_perfect'), 'mesocycle perfection bonus requires all linked sessions at 100 percent');
select throws_ok($$select public.purchase_reward_theme('not-a-theme')$$, 'unknown theme', 'server rejects forged theme catalog entries');
select throws_ok($$select public.purchase_reward_theme('red')$$, 'insufficient reward balance', 'purchase is atomically rejected when unaffordable');
select throws_ok($$select public.finalize_training_attempt(jsonb_set(pg_temp.test_attempt('forged', 10), '{owner}', '"40000000-0000-0000-0000-000000000002"'::jsonb))$$, 'invalid training attempt input', 'forged cross-owner attempt is rejected');
select is((public.claim_welcome_gem_reward() ->> 'claimed')::boolean, true, 'welcome gift is granted once');
select is((public.claim_welcome_gem_reward() ->> 'claimed')::boolean, false, 'welcome gift retry does not grant again');
select is((select count(*) from public.reward_ledger_entries where owner_id = public.require_actor() and kind = 'welcome_gift'), 1::bigint, 'welcome gift has one ledger entry');
select is((select amount from public.reward_ledger_entries where owner_id = public.require_actor() and kind = 'welcome_gift'), 250, 'welcome gift amount is fixed');
select is((public.claim_release_0_2_0_gem_reward() ->> 'claimed')::boolean, true, 'release gift is granted once');
select is((public.claim_release_0_2_0_gem_reward() ->> 'claimed')::boolean, false, 'release gift retry does not grant again');
select is((select count(*) from public.reward_ledger_entries where owner_id = public.require_actor() and kind = 'release_gift'), 1::bigint, 'release gift has one ledger entry');
select is((select amount from public.reward_ledger_entries where owner_id = public.require_actor() and kind = 'release_gift'), 50, 'release gift amount is fixed');
select is((public.claim_release_0_3_0_gem_reward() ->> 'claimed')::boolean, true, '0.3.0 release gift is granted once');
select is((public.claim_release_0_3_0_gem_reward() ->> 'claimed')::boolean, false, '0.3.0 release gift retry does not grant again');
select is((select count(*) from public.reward_ledger_entries where owner_id = public.require_actor() and idempotency_key = 'release:0.3.0:50-gems'), 1::bigint, '0.3.0 release gift has one ledger entry');
select is((select amount from public.reward_ledger_entries where owner_id = public.require_actor() and idempotency_key = 'release:0.3.0:50-gems'), 50, '0.3.0 release gift amount is fixed');
select is((public.claim_pending_release_gem_rewards() ->> 'claimed')::boolean, true, 'pending release campaigns grant the 0.4.x gifts');
select is((public.claim_pending_release_gem_rewards() ->> 'claimed')::boolean, false, 'pending release campaigns do not duplicate ledgered gifts');
select is((select count(*) from public.reward_ledger_entries where owner_id = public.require_actor() and idempotency_key = 'release:0.4.0:100-gems'), 1::bigint, '0.4.0 release gift has one ledger entry');
select is((select amount from public.reward_ledger_entries where owner_id = public.require_actor() and idempotency_key = 'release:0.4.0:100-gems'), 100, '0.4.0 release gift amount is fixed');
select is((select count(*) from public.reward_ledger_entries where owner_id = public.require_actor() and idempotency_key = 'release:0.4.1:150-gems'), 1::bigint, '0.4.1 release gift has one ledger entry');
select is((select amount from public.reward_ledger_entries where owner_id = public.require_actor() and idempotency_key = 'release:0.4.1:150-gems'), 150, '0.4.1 release gift amount is fixed');
select is((select amount from public.reward_ledger_entries where owner_id = public.require_actor() and idempotency_key = 'release:0.5.1:50-gems'), 50, '0.5.1 release gift amount is fixed');
select is(jsonb_array_length(public.claim_pending_release_updates(7) -> 'releases'), 7, 'release digest returns every unseen compatible announcement');
select is((public.claim_pending_release_updates(7) -> 'releases' -> 6 ->> 'rewardGems')::integer, 50, 'release digest reports the 0.5.1 reward');
select lives_ok($$select public.acknowledge_release_updates(array['0.4.1', '0.5.0'])$$, 'release acknowledgements are stored per user');
select is(jsonb_array_length(public.claim_pending_release_updates(7) -> 'releases'), 5, 'acknowledged releases are not returned again');
select throws_ok($$select public.acknowledge_release_updates(array['missing'])$$, 'invalid release acknowledgement', 'unknown releases cannot be acknowledged');
select lives_ok($$select public.purchase_reward_theme('arena')$$, 'new catalog themes can be purchased');
select ok((public.load_reward_wallet() -> 'purchasedThemeIds') ? 'arena', 'new theme purchase is persisted in the authoritative wallet');

select * from finish();
rollback;
