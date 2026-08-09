begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shop-frame@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles(id, alias) values ('60000000-0000-0000-0000-000000000001', 'Shop Frame Owner');

select is((select count(*) from public.reward_profile_frame_catalog), 28::bigint, 'the server catalog contains all supplied commercial frames');
select is((select min(price) from public.reward_profile_frame_catalog), 340, 'commercial frame prices start at 340 gems');
select is((select max(price) from public.reward_profile_frame_catalog), 1100, 'commercial frame prices end at 1100 gems');

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select is(public.load_reward_wallet() -> 'purchasedFrameIds', '[]'::jsonb, 'wallet exposes an empty independent frame inventory');
select throws_ok($$select * from public.reward_profile_frame_inventory$$, '42501', null, 'authenticated clients cannot read commercial frame inventory directly');
select throws_ok($$select public.save_own_profile('{"alias":"Shop Frame Owner","avatar_id":"capybara-athlete","equipped_frame_id":"shop-heavy-duty","equipped_title_id":null,"categories":{},"category_visibility":{},"auto_share_completed_workouts":true,"share_routine_template":true,"share_mesocycle_template":true,"share_performed_set_details":true,"share_social_activity":true,"share_social_progress":true,"share_social_consistency":true,"share_social_statistics":true,"share_social_muscle_distribution":true}'::jsonb)$$, 'P0001', 'profile frame is not unlocked', 'an unowned commercial frame cannot be equipped');

set local role postgres;
insert into public.reward_wallets(owner_id, balance) values ('60000000-0000-0000-0000-000000000001', 500);
set local role authenticated;
select is(public.purchase_reward_profile_frame('shop-heavy-duty') -> 'purchasedFrameIds', '["shop-heavy-duty"]'::jsonb, 'purchase RPC charges the catalog item into the separate inventory');
select lives_ok($$select public.save_own_profile('{"alias":"Shop Frame Owner","avatar_id":"capybara-athlete","equipped_frame_id":"shop-heavy-duty","equipped_title_id":null,"categories":{},"category_visibility":{},"auto_share_completed_workouts":true,"share_routine_template":true,"share_mesocycle_template":true,"share_performed_set_details":true,"share_social_activity":true,"share_social_progress":true,"share_social_consistency":true,"share_social_statistics":true,"share_social_muscle_distribution":true}'::jsonb)$$, 'an owned commercial frame and no title persist through the profile RPC');

select * from finish();
rollback;
