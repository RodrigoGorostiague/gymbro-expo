begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'insight-actor@example.com', '', now(), '{}', '{}', now(), now()),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'insight-target@example.com', '', now(), '{}', '{}', now(), now()),
  ('60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'insight-stranger@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, alias) values
  ('60000000-0000-0000-0000-000000000001', 'Insight Actor'),
  ('60000000-0000-0000-0000-000000000002', 'Insight Target'),
  ('60000000-0000-0000-0000-000000000003', 'Insight Stranger');
insert into public.relationships (member_low, member_high, kind) values ('60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'bro');
insert into public.muscle_groups (id, name, type, level, visible_in_filters, display_name, path) values
  ('GM-901', 'Pecho', 'Grupo padre', 0, true, 'Pecho', 'Pecho'),
  ('GM-902', 'Pectoral mayor', 'Músculo', 1, false, 'Pectoral mayor', 'Pecho > Pectoral mayor');
insert into public.muscle_group_relations (id, parent_muscle_group_id, child_muscle_group_id, relation_type) values ('RG-9901', 'GM-901', 'GM-902', 'anatomical');
insert into public.training_states (owner_id, attempts) values ('60000000-0000-0000-0000-000000000002', '[{"id":"attempt-1","version":1,"owner":"60000000-0000-0000-0000-000000000002","recordedRoutineName":"Upper","completedAt":"2026-08-01T10:00:00Z","durationSeconds":60,"restTimerSeconds":0,"completion":{"validSets":1,"plannedSets":1,"adherence":1,"displayPercent":100,"status":"fully-completed"},"reward":{"setGems":0,"completionGems":0,"fullCompletionBonus":0,"totalGems":0,"qualifiesForCompletion":false},"rewardApplication":{"id":"receipt-1","state":"pending"},"exercises":[{"exerciseId":"EX-0001","recordedName":"Press","catalog":{"muscleParticipations":[{"muscleGroupId":"GM-902"}]},"sets":[{"result":{"performed":true}}]}]}]'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select is((select (entry.value ->> 'value')::integer from jsonb_array_elements(public.get_social_profile_insights('60000000-0000-0000-0000-000000000002') -> 'muscle_distribution') entry(value) where entry.value ->> 'id' = 'GM-901'), 1, 'accepted connection receives the parent-group exercise aggregate');
select is((public.get_social_profile_insights('60000000-0000-0000-0000-000000000002') -> 'statistics' ->> 'completed_exercises_last_90_days')::integer, 1, 'safe statistics expose aggregate counts only');
select is((public.list_social_profile_insights(array['60000000-0000-0000-0000-000000000002'::uuid, '60000000-0000-0000-0000-000000000003'::uuid]) ? '60000000-0000-0000-0000-000000000002'), true, 'batch projection includes an accepted connection');
select is((public.list_social_profile_insights(array['60000000-0000-0000-0000-000000000002'::uuid, '60000000-0000-0000-0000-000000000003'::uuid]) ? '60000000-0000-0000-0000-000000000003'), false, 'batch projection omits a disconnected profile');
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000003', true);
select throws_like($$select public.get_social_profile_insights('60000000-0000-0000-0000-000000000002')$$, 'social profile unavailable', 'stranger cannot read profile insights');
reset role;
update public.profiles set share_social_muscle_distribution = false where id = '60000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select ok(not (public.get_social_profile_insights('60000000-0000-0000-0000-000000000002') ? 'muscle_distribution'), 'profile owner can hide muscle distribution');
select throws_like($$select attempts from public.training_states$$, 'permission denied for table training_states', 'raw training history remains inaccessible');
select * from finish();
rollback;
