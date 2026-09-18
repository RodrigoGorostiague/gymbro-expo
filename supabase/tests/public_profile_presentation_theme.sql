begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select format('40000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', format('theme%s@example.com', value), '', now(), '{}', '{}', now(), now()
from generate_series(1, 3) as value;

insert into public.profiles (id, alias, presentation_theme_id) values
  ('40000000-0000-0000-0000-000000000001', 'Theme Actor', 'profile-rodaja'),
  ('40000000-0000-0000-0000-000000000002', 'Theme Circle', 'violeta'),
  ('40000000-0000-0000-0000-000000000003', 'Theme Directory', 'blue');
update public.public_profiles set directory_bucket = 1, directory_rank = id;

select is((select presentation_theme_id from public.public_profiles where id = '40000000-0000-0000-0000-000000000002'), 'violeta', 'profile inserts synchronize the safe presentation theme');
update public.profiles set presentation_theme_id = 'moon' where id = '40000000-0000-0000-0000-000000000002';
select is((select presentation_theme_id from public.public_profiles where id = '40000000-0000-0000-0000-000000000002'), 'moon', 'profile presentation theme updates synchronize the public projection');
select hasnt_column('public', 'public_profiles', 'equipped_theme_id', 'the public profile excludes private equipped theme state');
select hasnt_column('public', 'public_profiles', 'owned_theme_ids', 'the public profile excludes private theme inventory');

insert into public.relationships (member_low, member_high, kind) values ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'partner');
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);

select is(public.list_directory(null, 20) #>> '{profiles,0,presentation_theme_id}', 'blue', 'directory projection includes the safe presentation theme');
select is(public.list_circle(null, 20) #>> '{profiles,0,presentation_theme_id}', 'moon', 'circle projection includes the safe presentation theme');
select is(
  (select value ->> 'presentation_theme_id' from jsonb_array_elements(public.search_aliases('theme', null, 20) -> 'profiles') value where value ->> 'id' = '40000000-0000-0000-0000-000000000003'),
  'blue',
  'search projection includes the safe presentation theme'
);

select * from finish();
rollback;
