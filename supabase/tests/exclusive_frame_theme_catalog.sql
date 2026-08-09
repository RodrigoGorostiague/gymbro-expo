begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('61000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'exclusive-theme@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles(id, alias) values ('61000000-0000-0000-0000-000000000001', 'Exclusive Theme Owner');

select is((select count(*) from public.reward_theme_catalog where theme_id in ('boca', 'river', 'snowflake', 'aurora', 'prisma', 'red', 'cyberpunk', 'frame-campeon-indiscutible', 'frame-heavy-duty', 'frame-alfa', 'frame-celtic-spirit', 'frame-hierro-fe-disciplina', 'frame-yo-soy-el-huno', 'frame-spqr', 'frame-fuerza-rinoceronte', 'frame-fuerza-pantera', 'frame-ruby-fit', 'frame-valhalla-training', 'frame-holy-fit', 'frame-medjay-core', 'frame-fuerza-cocodrilo', 'frame-fuerza-gorila', 'frame-elegante-sport', 'frame-banzai', 'frame-neon-gym', 'frame-fuerza-elefante', 'frame-this-is-sparta', 'frame-fuerza-tigre')), 28::bigint, 'all commercial frames have catalog themes');
select is((select price from public.reward_theme_catalog where theme_id = 'boca'), 700, 'reused Boca ID retains its price');
select is((select min(price) from public.reward_theme_catalog where theme_id like 'frame-%'), 1800, 'new frame themes start at the exclusive price floor');
select is((select max(price) from public.reward_theme_catalog where theme_id like 'frame-%'), 3500, 'new frame themes respect the exclusive price ceiling');

set local role postgres;
insert into public.reward_wallets(owner_id, balance, purchased_theme_ids) values ('61000000-0000-0000-0000-000000000001', 4000, '["boca"]'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select is(public.purchase_reward_theme('boca') -> 'purchasedThemeIds', '["boca"]'::jsonb, 'existing owners retain their reused theme purchase');
select ok((public.purchase_reward_theme('frame-neon-gym') -> 'purchasedThemeIds') ? 'frame-neon-gym', 'purchase RPC accepts a new frame theme from the catalog');

select * from finish();
rollback;
