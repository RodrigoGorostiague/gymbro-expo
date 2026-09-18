begin;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('61000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reset-owner@example.com', '', now(), '{}', '{}', now(), now()),
  ('61000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reset-peer@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, alias) values
  ('61000000-0000-0000-0000-000000000001', 'Reset Owner'),
  ('61000000-0000-0000-0000-000000000002', 'Reset Peer');

insert into public.training_libraries (owner_id, routines, mesocycles) values
  ('61000000-0000-0000-0000-000000000001', '[{"id":"owner-routine","name":"Owner Routine","createdAt":"2026-08-08T00:00:00Z","muscleGroups":["GM-100"],"exercises":[]}]', '[{"id":"owner-mesocycle","name":"Owner Block","goal":"","status":"active","durationWeeks":1,"createdAt":"2026-08-08T00:00:00Z","weeks":[{"id":"owner-week","weekNumber":1,"entries":[{"id":"owner-plan","ref":{"routineId":"owner-routine","routineName":"Owner Routine","source":"local"}}]}]}]'),
  ('61000000-0000-0000-0000-000000000002', '[{"id":"peer-routine","name":"Peer Routine","createdAt":"2026-08-08T00:00:00Z","muscleGroups":["GM-100"],"exercises":[]}]', '[{"id":"peer-mesocycle","name":"Peer Block","goal":"","status":"active","durationWeeks":1,"createdAt":"2026-08-08T00:00:00Z","weeks":[{"id":"peer-week","weekNumber":1,"entries":[{"id":"peer-plan","ref":{"routineId":"peer-routine","routineName":"Peer Routine","source":"local"}}]}]}]');
insert into public.training_states (owner_id, definitions, attempts, sessions, active_workout_draft) values
  ('61000000-0000-0000-0000-000000000001',
    '[{"id":"custom:reset-owner:row","source":{"kind":"custom","owner":"61000000-0000-0000-0000-000000000001","originId":"row"},"name":"Custom Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","defaultSets":[]}]',
    '[{"id":"owner-attempt","version":1,"owner":"61000000-0000-0000-0000-000000000001","recordedRoutineName":"Upper","completedAt":"2026-08-08T00:00:00Z","durationSeconds":60,"restTimerSeconds":0,"exercises":[],"completion":{},"reward":{"setGems":0,"completionGems":0,"fullCompletionBonus":0,"totalGems":0,"qualifiesForCompletion":false},"rewardApplication":{"id":"61000000-0000-0000-0000-000000000001:owner-attempt:v1","state":"applied"}}]',
    '[{"id":"owner-session","routineId":"owner-routine","routineName":"Upper","completedAt":"2026-08-08T00:00:00Z","durationSeconds":60,"restTimerSeconds":0,"exercises":[]}]',
    '{"version":1,"owner":"61000000-0000-0000-0000-000000000001","attemptId":"owner-attempt","routineId":"owner-routine","startedAtMs":1,"restTimerSeconds":0,"completedSets":{},"setValues":{}}'),
  ('61000000-0000-0000-0000-000000000002', '[]', '[]', '[]', null);

insert into public.workout_recaps (id, author_id, routine_name, completed_at, duration_seconds, exercise_count, metrics, exercise_details) values
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'Owner recap', now(), 60, 1, '{}'::jsonb, '{"exercises":[]}'::jsonb),
  ('62000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000002', 'Peer recap', now(), 60, 1, '{}'::jsonb, '{"exercises":[]}'::jsonb);
insert into public.workout_recap_reactions (recap_id, actor_id) values
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002'),
  ('62000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000001');
insert into public.workout_recap_comments (recap_id, author_id, body) values
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', 'Peer on owner recap'),
  ('62000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000001', 'Owner on peer recap');
insert into public.notification_inbox (recipient_id, actor_id, kind, title, data, deduplication_key) values
  ('61000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', 'workout_recap_comment', 'Training', '{"url":"/social/recap/62000000-0000-0000-0000-000000000001"}', 'owner-training'),
  ('61000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000001', 'workout_recap_reaction', 'Training', '{"url":"/social/recap/62000000-0000-0000-0000-000000000002"}', 'peer-training-from-owner'),
  ('61000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', 'partner_message', 'Social', '{}'::jsonb, 'owner-social');
insert into public.reward_wallets (owner_id, balance) values ('61000000-0000-0000-0000-000000000001', 73);
insert into public.reward_ledger_entries (owner_id, idempotency_key, amount, kind) values ('61000000-0000-0000-0000-000000000001', 'preserve-reward', 73, 'manual');
insert into public.experience_progress (owner_id, level, xp_into_level, total_xp) values ('61000000-0000-0000-0000-000000000001', 3, 15, 210);
insert into public.experience_ledger_entries (owner_id, idempotency_key, attempt_id, amount, kind) values ('61000000-0000-0000-0000-000000000001', 'preserve-xp', 'owner-attempt', 15, 'valid_sets');
insert into public.notification_device_tokens (owner_id, token, platform) values ('61000000-0000-0000-0000-000000000001', 'ExponentPushToken[reset-owner]', 'ios');

insert into public.joint_workouts (id, initiator_id, suggested_routine) values
  ('63000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', '{"name":"Upper","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":80,"reps":8}]}]}'::jsonb),
  ('63000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000002', '{"name":"Upper","muscleGroups":["back"],"exercises":[{"name":"Row","muscleGroups":["back"],"loadMode":"external-load","loadUnit":"kg","variant":"barbell","sets":[{"tipo":1,"weight":80,"reps":8}]}]}'::jsonb);
insert into public.joint_workout_participants (joint_workout_id, participant_id, status) values
  ('63000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'active'),
  ('63000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', 'active'),
  ('63000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000001', 'active'),
  ('63000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000002', 'active');
insert into public.joint_workout_posts (joint_workout_id) values ('63000000-0000-0000-0000-000000000001'), ('63000000-0000-0000-0000-000000000002');
insert into public.workout_start_activities (author_id, routine_name, expires_at) values
  ('61000000-0000-0000-0000-000000000001', 'Owner activity', now() + interval '1 hour'),
  ('61000000-0000-0000-0000-000000000002', 'Peer activity', now() + interval '1 hour');

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select is((public.preview_training_data_reset() ->> 'routines')::integer, 1, 'preview is scoped to the authenticated owner');
select is((public.export_training_data_reset_backup() ->> 'owner_id')::uuid, '61000000-0000-0000-0000-000000000001'::uuid, 'backup export derives the owner from the authenticated actor');
select is((public.export_training_data_reset_backup() -> 'preview' ->> 'workout_recaps')::integer, 1, 'backup export includes owner-scoped preview counts');
select is((public.reset_training_data() ->> 'routines')::integer, 0, 'reset returns an empty post-reset preview');

reset role;
select is((select routines from public.training_libraries where owner_id = '61000000-0000-0000-0000-000000000001'), '[]'::jsonb, 'owner routines are cleared');
select is((select mesocycles from public.training_libraries where owner_id = '61000000-0000-0000-0000-000000000001'), '[]'::jsonb, 'owner mesocycles are cleared');
select is((select definitions from public.training_states where owner_id = '61000000-0000-0000-0000-000000000001') -> 0 ->> 'id', 'custom:reset-owner:row', 'custom definitions are preserved');
select is((select jsonb_build_object('attempts', attempts, 'sessions', sessions, 'draft', active_workout_draft) from public.training_states where owner_id = '61000000-0000-0000-0000-000000000001'), '{"draft":null,"attempts":[],"sessions":[]}'::jsonb, 'owner history and active draft are cleared');
select is((select count(*)::integer from public.workout_recaps where author_id = '61000000-0000-0000-0000-000000000001'), 0, 'owner recap publications are deleted');
select is((select count(*)::integer from public.workout_recap_reactions where actor_id = '61000000-0000-0000-0000-000000000001'), 0, 'owner recap reactions are deleted');
select is((select count(*)::integer from public.workout_recap_comments where author_id = '61000000-0000-0000-0000-000000000001'), 0, 'owner recap comments are deleted');
select is((select count(*)::integer from public.notification_inbox where kind like 'workout_recap_%' and (recipient_id = '61000000-0000-0000-0000-000000000001' or actor_id = '61000000-0000-0000-0000-000000000001')), 0, 'owner-scoped recap notifications are deleted');
select is((select count(*)::integer from public.notification_inbox where recipient_id = '61000000-0000-0000-0000-000000000001' and kind = 'partner_message'), 1, 'unrelated social notifications are preserved');
select is((select count(*)::integer from public.joint_workouts where id = '63000000-0000-0000-0000-000000000001'), 0, 'actor-initiated joint workouts are removed with their dependent data');
select is((select count(*)::integer from public.joint_workout_participants where joint_workout_id = '63000000-0000-0000-0000-000000000002' and participant_id = '61000000-0000-0000-0000-000000000001'), 0, 'actor participation is removed from peer-owned joint workouts');
select is((select count(*)::integer from public.workout_start_activities where author_id = '61000000-0000-0000-0000-000000000001'), 0, 'owner workout-start activity is removed');
select is((select jsonb_build_object('wallet', wallet.balance, 'xp', progress.total_xp, 'reward_entries', (select count(*) from public.reward_ledger_entries where owner_id = wallet.owner_id), 'xp_entries', (select count(*) from public.experience_ledger_entries where owner_id = wallet.owner_id), 'tokens', (select count(*) from public.notification_device_tokens where owner_id = wallet.owner_id)) from public.reward_wallets wallet join public.experience_progress progress on progress.owner_id = wallet.owner_id where wallet.owner_id = '61000000-0000-0000-0000-000000000001'), '{"wallet":73,"xp":210,"reward_entries":1,"xp_entries":1,"tokens":1}'::jsonb, 'wallet, reward ledger, XP, and device tokens are preserved');
select is((select jsonb_build_object('routines', routines, 'mesocycles', mesocycles) from public.training_libraries where owner_id = '61000000-0000-0000-0000-000000000002'), '{"routines":[{"id":"peer-routine","name":"Peer Routine","createdAt":"2026-08-08T00:00:00Z","muscleGroups":["GM-100"],"exercises":[]}],"mesocycles":[{"id":"peer-mesocycle","name":"Peer Block","goal":"","status":"active","durationWeeks":1,"createdAt":"2026-08-08T00:00:00Z","weeks":[{"id":"peer-week","weekNumber":1,"entries":[{"id":"peer-plan","ref":{"routineId":"peer-routine","routineName":"Peer Routine","source":"local"}}]}]}]}'::jsonb, 'peer training data is untouched');

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select is((public.reset_training_data() ->> 'routines')::integer, 0, 'a second reset is idempotent');

select * from finish();
rollback;
