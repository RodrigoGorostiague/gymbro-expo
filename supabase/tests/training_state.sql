begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'state-one@example.com', '', now(), '{}', '{}', now(), now()),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'state-two@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, alias) values ('30000000-0000-0000-0000-000000000001', 'State One'), ('30000000-0000-0000-0000-000000000002', 'State Two');

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select is(public.load_training_state(), '{"definitions": [], "attempts": [], "sessions": [], "activeWorkoutDraft": null}'::jsonb, 'new owner receives an empty execution state');
select lives_ok($$select public.save_training_state('[{"id":"custom:one:press","source":{"kind":"custom","owner":"30000000-0000-0000-0000-000000000001","originId":"press"},"name":"Press","muscleGroups":[],"loadMode":"external-load","loadUnit":"kg","variant":"barra","defaultSets":[]}]', '[]', '[]', '{"version":1,"owner":"30000000-0000-0000-0000-000000000001","attemptId":"attempt-1","routineId":"routine-1","startedAtMs":1,"restTimerSeconds":0,"completedSets":{},"setValues":{}}', true)$$, 'owner saves custom definitions and active draft');
select is(public.load_training_state() -> 'activeWorkoutDraft' ->> 'attemptId', 'attempt-1', 'active draft round-trips for its owner');
select throws_ok($$select public.save_training_state('[{"id":"custom:wrong","source":{"kind":"custom","owner":"30000000-0000-0000-0000-000000000002","originId":"wrong"},"name":"Wrong","muscleGroups":[],"loadMode":"external-load","loadUnit":"kg","variant":"barra","defaultSets":[]}]', null, null, null, false)$$, 'invalid training state input', 'cross-owner custom definitions are rejected');
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select is(public.load_training_state() -> 'definitions', '[]'::jsonb, 'another owner cannot read the first owner state');
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select throws_ok($$select public.import_legacy_training_state('[]', '[]', '[]', null)$$, '42501', null, 'legacy execution-state import is no longer callable');
select lives_ok($$select public.import_legacy_custom_definitions('[{"id":"custom:one:legacy","source":{"kind":"custom","owner":"30000000-0000-0000-0000-000000000001","originId":"legacy"},"name":"Legacy","muscleGroups":[],"loadMode":"external-load","loadUnit":"kg","variant":"barra","defaultSets":[]}]')$$, 'custom definition handoff succeeds');
select ok(public.load_training_state() -> 'definitions' @> '[{"id":"custom:one:legacy","name":"Legacy"}]'::jsonb, 'custom definitions survive the clean slate');
select throws_ok($$select public.save_training_state(null, '[{"id":"attempt-1","version":1,"owner":"30000000-0000-0000-0000-000000000001","recordedRoutineName":"Forged","completedAt":"2026-08-01T00:00:00Z","durationSeconds":0,"restTimerSeconds":0,"exercises":[],"completion":{},"reward":{"setGems":999,"completionGems":999,"fullCompletionBonus":999,"totalGems":999,"qualifiesForCompletion":true},"rewardApplication":{"id":"forged","state":"pending"}}]', null, null, false)$$, 'invalid training state input', 'server rejects client-controlled reward credit');

select * from finish();
rollback;
