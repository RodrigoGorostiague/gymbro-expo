begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'onboarding@example.com', '', now(), '{}', '{}', now(), now()),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, alias) values
  ('60000000-0000-0000-0000-000000000001', 'Onboarding Athlete'),
  ('60000000-0000-0000-0000-000000000002', 'Another Athlete');

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);

select is((public.get_own_onboarding() ->> 'completed')::boolean, false, 'new profiles require onboarding');
select lives_ok($$select public.complete_own_onboarding('{
  "alias":"  Neon Athlete  ","real_name":"  Alex Martinez  ","birth_date":"1997-05-14","sex":"female"
}'::jsonb)$$, 'onboarding accepts all required private fields');
select is(public.get_own_onboarding() ->> 'real_name', 'Alex Martinez', 'onboarding trims and returns the private name to its owner');
select is(public.get_own_onboarding() ->> 'sex', 'female', 'onboarding returns the stored sex only to its owner');
select is((public.get_own_onboarding() ->> 'completed')::boolean, true, 'onboarding is marked completed once');
select is(public.get_own_profile() ->> 'avatar_id', 'capigirl', 'female onboarding selects a female avatar default');
select throws_ok($$select public.complete_own_onboarding('{"alias":"Valid Alias","real_name":"Alex","birth_date":"1990-01-01","sex":"other"}'::jsonb)$$, 'P0001', 'invalid onboarding input', 'onboarding rejects unsupported sex values');
select lives_ok($$select public.record_body_metric('height', 175.5, 'cm', now(), null)$$, 'height can be recorded in centimeters');
select lives_ok($$select public.record_body_metric('biceps_flexed', 39, 'cm', now(), null)$$, 'bodybuilding circumferences can be recorded');
select throws_ok($$select public.record_body_metric('height', 175, 'kg', now(), null)$$, 'P0001', 'invalid body metric input', 'metrics enforce their canonical unit');

reset role;
select * from finish();
rollback;
