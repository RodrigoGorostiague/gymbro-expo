begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('81000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'web-theme@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, alias, avatar_id, equipped_frame_id, equipped_title_id, presentation_theme_id)
values ('81000000-0000-0000-0000-000000000001', 'Web Theme', 'capigirl', 'alfa', 'gymbro', 'profile-brisas');
insert into public.reward_wallets (owner_id, balance, purchased_theme_ids, equipped_theme_id)
values ('81000000-0000-0000-0000-000000000001', 999, '["moon"]', 'moon');

select ok(not has_function_privilege('anon', 'public.get_own_web_presentation()', 'execute'), 'anonymous callers cannot read presentation');
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select is(public.get_own_web_presentation() ->> 'themeId', 'moon', 'equipped wallet theme wins over public presentation fallback');
select is(public.get_own_web_presentation() ->> 'avatarId', 'capigirl', 'authorized avatar is projected');
select ok(not (public.get_own_web_presentation() ?| array['balance', 'purchasedThemeIds', 'price']), 'wallet and store state are omitted');

select * from finish();
rollback;
