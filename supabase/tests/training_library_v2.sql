begin;
select plan(41);

create function pg_temp.v2_routine(routine_id text, routine_name text, content_version integer default 1)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id', routine_id, 'version', content_version, 'versionOf', routine_id || '-lineage',
    'previousVersionId', routine_id || '-previous', 'name', routine_name,
    'muscleGroups', jsonb_build_array('GM-100'), 'exercises', '[]'::jsonb,
    'createdAt', '2026-09-05T00:00:00.000Z'
  )
$$;

create function pg_temp.v2_mesocycle(
  mesocycle_id text,
  routine_id text,
  duration_weeks integer default 1,
  lifecycle_status text default 'draft',
  content_version integer default 1
)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id', mesocycle_id, 'version', content_version, 'versionOf', mesocycle_id || '-lineage',
    'previousVersionId', mesocycle_id || '-previous', 'name', mesocycle_id, 'goal', '',
    'status', lifecycle_status, 'durationWeeks', duration_weeks,
    'weeks', case when routine_id = '' then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'id', mesocycle_id || '-week', 'weekNumber', 1,
      'entries', jsonb_build_array(jsonb_build_object(
        'id', mesocycle_id || '-session',
        'ref', jsonb_build_object('routineId', routine_id, 'routineName', routine_id, 'source', 'local'),
        'order', 1
      ))
    )) end,
    'createdAt', '2026-09-05T00:00:00.000Z'
  )
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('22000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'v2-owner@example.com', '', now(), '{}', '{}', now(), now()),
  ('22000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'v2-peer@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, alias) values
  ('22000000-0000-0000-0000-000000000001', 'V2 Owner'),
  ('22000000-0000-0000-0000-000000000002', 'V2 Peer');

set local role anon;
select throws_like($$select public.load_routines_v2()$$, 'permission denied for function load_routines_v2', 'anonymous callers cannot load V2 routines');
select throws_like($$select public.save_routines_v2('{"expectedRevision":0,"items":[]}'::jsonb)$$, 'permission denied for function save_routines_v2', 'anonymous callers cannot save V2 routines');

set local role authenticated;
select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000001', true);
select is(public.load_routines_v2(), '{"revision":0,"items":[]}'::jsonb, 'a new actor loads an empty revision-zero routine collection');
select is(public.load_mesocycles_v2(), '{"revision":0,"items":[]}'::jsonb, 'a new actor loads an empty revision-zero mesocycle collection');

select set_config(
  'test.v2_routine_save',
  public.save_routines_v2(jsonb_build_object('expectedRevision', 0, 'items', jsonb_build_array(pg_temp.v2_routine('routine-1', 'Upper', 7))))::text,
  true
);
select is(
  current_setting('test.v2_routine_save')::jsonb ->> 'status',
  'saved',
  'a current routine write succeeds'
);
select is(current_setting('test.v2_routine_save')::jsonb -> 'collection', public.load_routines_v2(), 'a successful save returns the canonical persisted routine collection');
select is(public.load_routines_v2() ->> 'revision', '1', 'a successful routine write increments its storage revision');
select is(public.load_routines_v2() -> 'items' -> 0 ->> 'version', '7', 'storage revision does not replace content lineage version');
select is(public.load_mesocycles_v2() ->> 'revision', '0', 'a routine write leaves the mesocycle revision stable');

select throws_ok(
  $$select public.save_routines_v2(jsonb_build_object('expectedRevision', 1, 'items', jsonb_build_array(pg_temp.v2_routine('invalid-version', 'Invalid', 0))))$$,
  'invalid training library input',
  'routine content versions must be positive integers'
);
select is(public.load_routines_v2() ->> 'revision', '1', 'invalid content lineage does not advance the routine revision');

select is(
  public.save_routines_v2(jsonb_build_object('expectedRevision', 0, 'items', jsonb_build_array(pg_temp.v2_routine('routine-1', 'Stale')))) ->> 'status',
  'conflict',
  'a stale routine write returns the stable conflict status'
);
select is(
  public.save_routines_v2(jsonb_build_object('expectedRevision', 0, 'items', jsonb_build_array(pg_temp.v2_routine('routine-1', 'Stale')))) -> 'current',
  public.load_routines_v2(),
  'a routine conflict returns canonical current state for reconciliation'
);
select is(public.load_routines_v2() -> 'items' -> 0 ->> 'name', 'Upper', 'a stale routine write cannot overwrite current content');

select is(
  public.save_mesocycles_v2(jsonb_build_object('expectedRevision', 0, 'items', jsonb_build_array(pg_temp.v2_mesocycle('mesocycle-1', 'routine-1')))) ->> 'status',
  'saved',
  'a current mesocycle write succeeds independently'
);
select is(public.load_mesocycles_v2() ->> 'revision', '1', 'a successful mesocycle write increments its storage revision');
select is(public.load_routines_v2() ->> 'revision', '1', 'a mesocycle write leaves the routine revision stable');

select throws_ok(
  $$select public.save_mesocycles_v2(jsonb_build_object('expectedRevision', 1, 'items', jsonb_build_array(pg_temp.v2_mesocycle('mesocycle-1', 'routine-1', 1, 'paused'))))$$,
  'invalid mesocycle lifecycle transition',
  'an illegal draft-to-paused lifecycle transition is rejected'
);
select is(public.load_mesocycles_v2() ->> 'revision', '1', 'an invalid lifecycle transition leaves the mesocycle revision stable');

select throws_ok(
  $$select public.save_routines_v2(jsonb_build_object('expectedRevision', 1, 'items', '[]'::jsonb))$$,
  'invalid training library input',
  'a referenced routine cannot be deleted'
);
select is(public.load_routines_v2() ->> 'revision', '1', 'rejected routine deletion does not advance its revision');

select throws_ok(
  $$select public.save_mesocycles_v2(jsonb_build_object('expectedRevision', 1, 'items', jsonb_build_array(pg_temp.v2_mesocycle('completed-without-attempt', '', 1, 'completed'))))$$,
  'mesocycle cannot be completed yet',
  'mesocycle completion eligibility remains server-enforced'
);
select is(public.load_mesocycles_v2() ->> 'revision', '1', 'rejected lifecycle mutation does not advance its revision');

select throws_ok(
  $$select public.save_mesocycles_v2(jsonb_build_object('expectedRevision', 1, 'items', jsonb_build_array(pg_temp.v2_mesocycle('zero-week', '', 0))))$$,
  'invalid training library input',
  'zero-week mesocycles are rejected'
);
select throws_ok(
  $$select public.save_mesocycles_v2(jsonb_build_object('expectedRevision', 1, 'items', jsonb_build_array(pg_temp.v2_mesocycle('too-long', '', 53))))$$,
  'invalid training library input',
  'mesocycles longer than 52 weeks are rejected'
);
select is(
  public.save_mesocycles_v2(jsonb_build_object('expectedRevision', 1, 'items', jsonb_build_array(pg_temp.v2_mesocycle('max-weeks', '', 52, 'draft', 9)))) -> 'collection' ->> 'revision',
  '2',
  'a 52-week mesocycle is accepted and returns its new revision'
);
select is(public.load_mesocycles_v2() -> 'items' -> 0 ->> 'version', '9', 'mesocycle content version remains independent from storage revision');

select lives_ok(
  $$select public.save_mesocycles_v2(jsonb_build_object('expectedRevision', 2, 'items', jsonb_build_array(pg_temp.v2_mesocycle('max-weeks', '', 52, 'active', 9))))$$,
  'a draft mesocycle can enter the active lifecycle state'
);
select lives_ok(
  $$select public.save_mesocycles_v2(jsonb_build_object('expectedRevision', 3, 'items', jsonb_build_array(pg_temp.v2_mesocycle('max-weeks', '', 52, 'cancelled', 9))))$$,
  'an active mesocycle can enter a terminal lifecycle state'
);
select throws_ok(
  $$select public.save_mesocycles_v2(jsonb_build_object('expectedRevision', 4, 'items', jsonb_build_array(jsonb_set(pg_temp.v2_mesocycle('max-weeks', '', 52, 'cancelled', 9), '{name}', '"Mutated terminal"'::jsonb))))$$,
  'protected mesocycle version cannot be mutated',
  'terminal mesocycle content is immutable in place'
);
select is(public.load_mesocycles_v2() ->> 'revision', '4', 'rejected terminal mutation leaves the mesocycle revision stable');

select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000002', true);
select is(public.load_routines_v2(), '{"revision":0,"items":[]}'::jsonb, 'a second actor cannot load the first actor collection');
select is(
  public.save_routines_v2(jsonb_build_object('expectedRevision', 0, 'items', jsonb_build_array(pg_temp.v2_routine('routine-1', 'Peer routine')))) ->> 'status',
  'saved',
  'a second actor writes only an independently owned collection'
);
select throws_like(
  $$update public.training_libraries set routines = '[]'::jsonb where owner_id = '22000000-0000-0000-0000-000000000001'$$,
  'permission denied for table training_libraries',
  'authenticated actors cannot bypass RPC ownership through the table'
);
select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000001', true);
select is(public.load_routines_v2() -> 'items' -> 0 ->> 'name', 'Upper', 'the first actor collection remains unchanged by the second actor');

set local role postgres;
update public.training_libraries
set routines = routines || jsonb_build_array(pg_temp.v2_routine('server-imported', 'Server import'))
where owner_id = '22000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.load_routines_v2() ->> 'revision', '2', 'a server-side routine mutation cannot bypass the routine revision trigger');
select is(public.load_mesocycles_v2() ->> 'revision', '4', 'a server-side routine-only mutation leaves the mesocycle revision stable');

set local role postgres;
insert into public.relationships (member_low, member_high, kind)
values ('22000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000002', 'bro');
update public.profiles set share_mesocycle_template = true where id = '22000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.save_mesocycles_v2(jsonb_build_object(
    'expectedRevision', 4,
    'items', jsonb_build_array(
      pg_temp.v2_mesocycle('max-weeks', '', 52, 'cancelled', 9),
      pg_temp.v2_mesocycle('share-mesocycle', 'routine-1')
    )
  ))$$,
  'the source owner prepares a referenced mesocycle for private sharing'
);
select set_config('test.v2_share_request', public.create_private_plan_share_request('22000000-0000-0000-0000-000000000002', 'mesocycle', 'share-mesocycle')::text, true);
select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000002', true);
select lives_ok($$select public.accept_private_plan_share_request(current_setting('test.v2_share_request')::uuid)$$, 'private-share acceptance imports planning collections');
select is(public.load_routines_v2() ->> 'revision', '2', 'private-share import increments the recipient routine revision');
select is(public.load_mesocycles_v2() ->> 'revision', '1', 'private-share import increments the recipient mesocycle revision');

select * from finish();
rollback;
