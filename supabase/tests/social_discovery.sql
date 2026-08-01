begin;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select format('00000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', format('member%s@example.com', value), '', now(), '{}', '{}', now(), now()
from generate_series(21, 27) as value;
insert into public.profiles (id, alias, categories, category_visibility) values
  ('00000000-0000-0000-0000-000000000021', 'Searcher Main', '{}', '{}'),
  ('00000000-0000-0000-0000-000000000022', 'Alpha One', '{"public":"visible","private":"hidden"}', '{"private":false}'),
  ('00000000-0000-0000-0000-000000000023', 'Alpha Two', '{}', '{}'),
  ('00000000-0000-0000-0000-000000000024', 'Alpha Three', '{}', '{}'),
  ('00000000-0000-0000-0000-000000000025', 'Alpha Four', '{}', '{}'),
  ('00000000-0000-0000-0000-000000000026', 'Alpha Five', '{}', '{}'),
  ('00000000-0000-0000-0000-000000000027', 'Alpha Six', '{}', '{}');
update public.public_profiles set directory_bucket = 1, directory_rank = id;
insert into public.relationships (member_low, member_high, kind) values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000024', 'bro');
insert into public.relationship_requests (requester_id, recipient_id, requested_kind) values ('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000021', 'partner');
insert into public.blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000027');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', true);

select is(
  (select array_agg(value ->> 'id' order by n) from jsonb_array_elements(public.list_directory(null, 20) -> 'profiles') with ordinality as t(value, n)),
  array['00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000023'],
  'directory excludes self, relationships, pending requests, and both block directions'
);
select is(
  (select value -> 'categories' from jsonb_array_elements(public.list_directory(null, 20) -> 'profiles') as value where value ->> 'id' = '00000000-0000-0000-0000-000000000022'),
  '{"public": "visible"}'::jsonb,
  'hidden categories are never projected by the directory'
);
select is(
  (select count(*)::int from jsonb_array_elements(public.list_directory(null, 1) -> 'profiles')),
  1,
  'the page size bounds directory results'
);
select ok(public.list_directory(null, 1) ->> 'next_cursor' is not null, 'a full page exposes an opaque continuation cursor');
select is(
  (select array_agg(value ->> 'id' order by n) from jsonb_array_elements(public.list_directory(public.list_directory(null, 1) ->> 'next_cursor', 1) -> 'profiles') with ordinality as t(value, n)),
  array['00000000-0000-0000-0000-000000000023'],
  'the cursor continues with the next eligible profile without duplicates'
);
select is(public.list_directory(public.list_directory(null, 1) ->> 'next_cursor', 1) ->> 'next_cursor', null, 'the final directory page has no continuation cursor');
select throws_like($$select public.list_directory('not-a-valid-cursor', 20)$$, 'invalid cursor', 'a malformed directory cursor is rejected');
select throws_like($$select public.list_directory(encode(convert_to('{"x": 1}', 'UTF8'), 'base64'), 20)$$, 'invalid cursor', 'a well-formed cursor with the wrong shape is rejected');

reset role;
set local role anon;
select throws_ok($$select public.list_directory(null, 20)$$, '42501', 'permission denied for function list_directory', 'anonymous callers cannot execute the directory RPC');
select throws_ok($$select public.search_aliases('alpha', null, 20)$$, '42501', 'permission denied for function search_aliases', 'anonymous callers cannot execute the search RPC');

reset role;
set local role authenticated;
select is(
  (select array_agg(value ->> 'id' order by n) from jsonb_array_elements(public.search_aliases('alpha', null, 20) -> 'profiles') with ordinality as t(value, n)),
  array['00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000023'],
  'search includes allowed existing connections and requests while excluding blocked profiles'
);
select is(
  public.search_aliases('alpha three', null, 20) #>> '{profiles,0,relationship_status}',
  'bro',
  'search labels allowed existing connections with their relationship status'
);
select is(
  (select array_agg(value ->> 'id' order by n) from jsonb_array_elements(public.list_circle(null, 20) -> 'profiles') with ordinality as t(value, n)),
  array['00000000-0000-0000-0000-000000000024'],
  'circle projection returns accepted relationships only'
);
select is(
  public.list_requests(null, 20) #>> '{profiles,0,relationship_status}',
  'incoming_request',
  'requests projection labels incoming pending requests'
);
select is(public.list_requests(null, 20) #>> '{profiles,0,requested_kind}', 'partner', 'requests projection exposes the requested relationship kind');
select is(
  (select array_agg(value ->> 'id' order by n) from jsonb_array_elements(public.search_aliases('  ÁLPHA ', null, 20) -> 'profiles') with ordinality as t(value, n)),
  array['00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000023'],
  'the server normalizes untrusted prefixes before matching'
);
select throws_like($$select public.search_aliases('   ', null, 20)$$, 'invalid prefix', 'a blank prefix is rejected');
select is(
  (select array_agg(value ->> 'id' order by n) from jsonb_array_elements(public.search_aliases('alpha', public.search_aliases('alpha', null, 1) ->> 'next_cursor', 1) -> 'profiles') with ordinality as t(value, n)),
  array['00000000-0000-0000-0000-000000000022'],
  'the search cursor continues with the next matching profile without duplicates'
);
select is_empty($$select value from jsonb_array_elements(public.search_aliases('alpha six', null, 20) -> 'profiles') as value$$, 'a prefix that only matches blocked profiles returns an empty page');
select throws_like($$select public.search_aliases('alpha', 'not-a-valid-cursor', 20)$$, 'invalid cursor', 'a malformed search cursor is rejected');

select * from finish();
rollback;
