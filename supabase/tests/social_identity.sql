begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, alias, categories, category_visibility) values
  ('00000000-0000-0000-0000-000000000001', 'One User', '{"public":"visible","private":"hidden"}', '{"private":false}');

select results_eq('select categories from public.public_profiles where id = ''00000000-0000-0000-0000-000000000001''', $$values ('{"public": "visible"}'::jsonb)$$, 'hidden categories are omitted from the projection');
select throws_ok($$insert into public.profiles (id, alias) values ('00000000-0000-0000-0000-000000000002', ' one   user ')$$, '23505', 'duplicate key value violates unique constraint "profiles_normalized_alias_key"', 'normalized aliases are unique');

set local role anon;
select throws_ok('select * from public.public_profiles', '42501', 'permission denied for table public_profiles', 'anonymous callers cannot read public profiles');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select results_eq('select count(*)::int from public.public_profiles', 'values (1)', 'eligible members can read safe projections');
select throws_ok($$insert into public.relationships (member_low, member_high, kind) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'bro')$$, '42501', 'permission denied for table relationships', 'direct graph writes are denied');
reset role;
insert into public.profiles (id, alias) values ('00000000-0000-0000-0000-000000000002', 'Two User');
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
set local role authenticated;
select is_empty('select * from public.public_profiles', 'blocked pairs cannot read projections or receive Realtime rows');

select * from finish();
rollback;
