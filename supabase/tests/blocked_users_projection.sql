begin;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select format('00000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', format('blocked%s@example.com', value), '', now(), '{}', '{}', now(), now()
from generate_series(31, 34) as value;
insert into public.profiles (id, alias, categories, category_visibility) values
  ('00000000-0000-0000-0000-000000000031', 'Blocker', '{}', '{}'),
  ('00000000-0000-0000-0000-000000000032', 'Alpha Blocked', '{"style":"strength","private":"hidden"}', '{"private":false}'),
  ('00000000-0000-0000-0000-000000000033', 'Bravo Blocked', '{}', '{}'),
  ('00000000-0000-0000-0000-000000000034', 'Observer', '{}', '{}');
insert into public.blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000032'),
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000033');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000031', true);
select is(
  (select array_agg(value ->> 'id' order by n) from jsonb_array_elements(public.list_blocked_users(null, 20) -> 'profiles') with ordinality as t(value, n)),
  array['00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000033'],
  'the blocker receives only their blocked users through the owned projection'
);
select is(
  public.list_blocked_users(null, 20) #> '{profiles,0,categories}',
  '{"style": "strength"}'::jsonb,
  'the projection exposes only the already-safe public profile summary'
);
select is_empty($$select 1 from public.public_profiles where id = '00000000-0000-0000-0000-000000000032'$$, 'the blocker cannot read the blocked public profile outside the owned projection');
select is(
  (select count(*)::int from jsonb_array_elements(public.list_blocked_users(null, 1) -> 'profiles')),
  1,
  'the blocked-users projection bounds its page size'
);
select ok(public.list_blocked_users(null, 1) ->> 'next_cursor' is not null, 'a full blocked-users page returns an opaque cursor');
select is(
  (select value ->> 'id' from jsonb_array_elements(public.list_blocked_users(public.list_blocked_users(null, 1) ->> 'next_cursor', 1) -> 'profiles') as value),
  '00000000-0000-0000-0000-000000000033',
  'the blocked-users cursor continues without a duplicate'
);
select throws_like($$select public.list_blocked_users('invalid', 20)$$, 'invalid cursor', 'malformed blocked-users cursors are rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000032', true);
select is_empty($$select value from jsonb_array_elements(public.list_blocked_users(null, 20) -> 'profiles') as value$$, 'the blocked user cannot observe the block through the owner projection');
select is_empty($$select 1 from public.blocks where blocker_id = '00000000-0000-0000-0000-000000000031'$$, 'the blocked user cannot read the blocker-owned block row');
select is_empty($$select 1 from public.public_profiles where id = '00000000-0000-0000-0000-000000000031'$$, 'the blocked user cannot read the blocker public profile');
select is_empty($$select value from jsonb_array_elements(public.list_directory(null, 20) -> 'profiles') as value where value ->> 'id' = '00000000-0000-0000-0000-000000000031'$$, 'discovery still hides the blocker from the blocked user');
select is_empty($$select value from jsonb_array_elements(public.search_aliases('blocker', null, 20) -> 'profiles') as value$$, 'search still hides the blocker from the blocked user');
select is_empty($$select value from jsonb_array_elements(public.list_circle(null, 20) -> 'profiles') as value$$, 'circle has no blocked relationship surface');
select is_empty($$select value from jsonb_array_elements(public.list_requests(null, 20) -> 'profiles') as value$$, 'requests have no blocked relationship surface');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000031', true);
select lives_ok($$select public.graph_unblock('00000000-0000-0000-0000-000000000032')$$, 'the blocker can unblock from the owned projection target');
select is_empty($$select 1 from public.blocks where blocker_id = '00000000-0000-0000-0000-000000000031' and blocked_id = '00000000-0000-0000-0000-000000000032'$$, 'unblocking removes only the blocker-owned block');
select is(
  (select value ->> 'id' from jsonb_array_elements(public.list_directory(null, 20) -> 'profiles') as value where value ->> 'id' = '00000000-0000-0000-0000-000000000032'),
  '00000000-0000-0000-0000-000000000032',
  'the unblocked user returns to normal discovery'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000032', true);
select is(
  (select value ->> 'id' from jsonb_array_elements(public.list_directory(null, 20) -> 'profiles') as value where value ->> 'id' = '00000000-0000-0000-0000-000000000031'),
  '00000000-0000-0000-0000-000000000031',
  'the formerly blocked user also returns to normal discovery'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000031', true);
select lives_ok($$select public.graph_send_request('00000000-0000-0000-0000-000000000032', 'bro')$$, 'the blocker can invite again after unblocking');

select * from finish();
rollback;
