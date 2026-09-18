begin;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'actor@example.com', '', now(), '{}', '{}', now(), now()),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@example.com', '', now(), '{}', '{}', now(), now()),
  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bootstrap@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, alias) values
  ('50000000-0000-0000-0000-000000000001', 'Actor Profile'),
  ('50000000-0000-0000-0000-000000000002', 'Other Profile');

select ok(not has_table_privilege('authenticated', 'public.profiles', 'select'), 'authenticated cannot select private profiles directly');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'insert'), 'authenticated cannot insert private profiles directly');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'update'), 'authenticated cannot update private profiles directly');

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);

select throws_ok('select * from public.profiles', '42501', 'permission denied for table profiles', 'direct private-profile reads are denied');
select is(public.get_own_profile() ->> 'id', '50000000-0000-0000-0000-000000000001', 'get_own_profile returns only the authenticated actor');
select ok(not (public.get_own_profile() ? 'presentation_theme_id'), 'get_own_profile omits presentation-theme state');
select lives_ok($$select public.save_own_profile('{"alias":"  Updated Actor  ","avatar_id":"capigirl","equipped_frame_id":"principiante","equipped_title_id":null,"categories":{"style":"strength"},"category_visibility":{"style":false},"auto_share_completed_workouts":false,"share_routine_template":false,"share_mesocycle_template":true,"share_performed_set_details":false,"share_social_activity":true,"share_social_progress":true,"share_social_consistency":true,"share_social_statistics":true,"share_social_muscle_distribution":true}'::jsonb)$$, 'save_own_profile updates the authenticated actor');
select is(public.get_own_profile() ->> 'alias', 'Updated Actor', 'save_own_profile trims the alias');
select is(public.get_own_profile() -> 'categories', '{"style":"strength"}'::jsonb, 'save_own_profile returns the normalized private projection');
select throws_ok($$select public.save_own_profile('{"alias":"Actor","avatar_id":"capigirl","categories":[],"category_visibility":{},"auto_share_completed_workouts":true,"share_routine_template":true,"share_mesocycle_template":true,"share_performed_set_details":true}'::jsonb)$$, 'P0001', 'invalid profile input', 'save_own_profile rejects malformed fields');
select lives_ok($$select public.update_own_presentation_theme('moon')$$, 'update_own_presentation_theme updates only the authenticated actor');
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000003', true);
select lives_ok($$select public.ensure_own_profile()$$, 'bootstrap creates the authenticated profile');

reset role;
select is((select presentation_theme_id from public.profiles where id = '50000000-0000-0000-0000-000000000001'), 'moon', 'presentation-theme RPC persisted the actor theme');
select isnt((select alias from public.profiles where id = '50000000-0000-0000-0000-000000000003'), 'bootstrap@example.com', 'bootstrap never uses the authentication email as a public alias');

select * from finish();
rollback;
