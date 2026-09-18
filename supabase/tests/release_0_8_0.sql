begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('40800000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'release-080@example.com', '', now(), '{}', '{}', now(), now());
insert into public.profiles(id, alias) values ('40800000-0000-0000-0000-000000000001', 'Beta Release');
set local role authenticated;
select set_config('request.jwt.claim.sub', '40800000-0000-0000-0000-000000000001', true);

select is(jsonb_array_length(public.claim_pending_release_updates(9) -> 'releases'), 9, 'older app receives only compatible announcements');
set local role postgres;
select is((select count(*) from public.reward_ledger_entries where owner_id = public.require_actor() and idempotency_key = 'release:0.8.0:1000-gems'), 0::bigint, 'older release digest does not claim the beta gift');
set local role authenticated;
select is((public.claim_pending_release_updates(10) ->> 'claimed')::boolean, true, 'beta release claims its gift');
select is((public.claim_pending_release_updates(10) ->> 'claimed')::boolean, false, 'retry does not duplicate the gift');
select is((public.claim_pending_release_updates(10) -> 'releases' -> 9 ->> 'rewardGems')::integer, 1000, 'announcement displays 1000 gems');
select is((public.claim_pending_release_updates(10) -> 'releases' -> 9 ->> 'version'), '0.8.0', 'new announcement is last in the digest');
set local role postgres;
select is((select count(*) from public.reward_ledger_entries where owner_id = public.require_actor() and idempotency_key = 'release:0.8.0:1000-gems'), 1::bigint, 'one ledger entry per account');
select is((select amount from public.reward_ledger_entries where owner_id = public.require_actor() and idempotency_key = 'release:0.8.0:1000-gems'), 1000, 'gift credits exactly 1000 gems');
set local role authenticated;
select lives_ok($$select public.acknowledge_release_updates(array['0.8.0'])$$, 'beta announcement can be acknowledged');
select is(jsonb_array_length(public.claim_pending_release_updates(10) -> 'releases'), 9, 'acknowledged beta announcement stays hidden');
select * from finish();
rollback;
