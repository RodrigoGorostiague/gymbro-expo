begin;
select plan(36);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select format('00000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', format('member%s@example.com', value), '', now(), '{}', '{}', now(), now()
from generate_series(11, 14) as value;
insert into public.profiles (id, alias)
select format('00000000-0000-0000-0000-%s', lpad(value::text, 12, '0'))::uuid, format('Member %s', value) from generate_series(11, 14) as value;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select lives_ok($$select public.graph_send_request('00000000-0000-0000-0000-000000000012', 'bro')$$, 'an explicitly Bro request is created through the trusted RPC');
select results_eq($$select requested_kind::text from public.relationship_requests where requester_id = '00000000-0000-0000-0000-000000000011' and recipient_id = '00000000-0000-0000-0000-000000000012'$$, $$values ('bro')$$, 'the requested kind is persisted before acceptance');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);
select lives_ok($$select public.graph_respond_request('00000000-0000-0000-0000-000000000011', true)$$, 'acceptance uses the persisted request kind atomically');
select results_eq($$select kind::text from public.relationships where member_low = '00000000-0000-0000-0000-000000000011'$$, $$values ('bro')$$, 'accepted relationship is reciprocal canonical Bro state');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select lives_ok($$select public.graph_send_request('00000000-0000-0000-0000-000000000012', 'partner')$$, 'an existing Bro can request a Partner upgrade');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);
select is(public.graph_summary('00000000-0000-0000-0000-000000000011') ->> 'requestKind', 'partner', 'the recipient summary exposes the exact requested kind');
select lives_ok($$select public.graph_respond_request('00000000-0000-0000-0000-000000000011', true)$$, 'the recipient accepts the Partner upgrade without choosing its kind');
select results_eq($$select kind::text from public.relationships where member_low = '00000000-0000-0000-0000-000000000011'$$, $$values ('partner')$$, 'accepted upgrade changes the existing relationship to Partner');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select lives_ok($$select public.graph_send_request('00000000-0000-0000-0000-000000000013', 'partner')$$, 'a new explicit Partner invitation is valid');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000013', true);
select lives_ok($$select public.graph_respond_request('00000000-0000-0000-0000-000000000011', true)$$, 'partner replacement commits from the stored request kind');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select results_eq($$select array_agg(kind::text order by member_high) from public.relationships where member_low = '00000000-0000-0000-0000-000000000011'$$, $$values (array['bro','partner']::text[])$$, 'prior partner is demoted to bro');
select throws_like($$select public.graph_send_request('00000000-0000-0000-0000-000000000011', 'bro')$$, 'self graph actions are not allowed', 'self actions fail without mutation');

select lives_ok($$select public.graph_send_request('00000000-0000-0000-0000-000000000014', 'bro')$$, 'a request may be created for an unrelated member');
select lives_ok($$select public.graph_send_request('00000000-0000-0000-0000-000000000014', 'bro')$$, 'repeating the same request is idempotent');
select results_eq($$select count(*)::int from public.relationship_requests where requester_id = '00000000-0000-0000-0000-000000000011' and recipient_id = '00000000-0000-0000-0000-000000000014'$$, $$values (1)$$, 'idempotent requests leave one canonical pending row');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000014', true);
select lives_ok($$select public.graph_respond_request('00000000-0000-0000-0000-000000000011', false)$$, 'a recipient can reject a request');
select is_empty($$select 1 from public.relationship_requests where member_low = '00000000-0000-0000-0000-000000000011' and member_high = '00000000-0000-0000-0000-000000000014'$$, 'rejection removes only the pending request');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select lives_ok($$select public.graph_send_request('00000000-0000-0000-0000-000000000014', 'bro')$$, 'a request exists before block cleanup');
select lives_ok($$select public.graph_block('00000000-0000-0000-0000-000000000014')$$, 'blocking a pending requester succeeds');
select is_empty($$select 1 from public.relationship_requests where member_low = '00000000-0000-0000-0000-000000000011' and member_high = '00000000-0000-0000-0000-000000000014'$$, 'blocking removes pending requests');
select lives_ok($$select public.graph_block('00000000-0000-0000-0000-000000000012')$$, 'blocking a member succeeds');
select is_empty($$select 1 from public.relationships where member_low = '00000000-0000-0000-0000-000000000011' and member_high = '00000000-0000-0000-0000-000000000012'$$, 'blocking removes the active relationship for that pair');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);
select throws_like($$select public.graph_send_request('00000000-0000-0000-0000-000000000011', 'bro')$$, 'graph action blocked', 'a blocked member cannot recreate contact');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000013', true);
select results_eq($$select public.graph_summary('00000000-0000-0000-0000-000000000011') ->> 'relationshipKind'$$, $$values ('partner')$$, 'the trusted summary reports the remaining canonical relationship');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);
select lives_ok($$select public.graph_send_request('00000000-0000-0000-0000-000000000013', 'partner')$$, 'the first competing Partner request is created');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000013', true);
select lives_ok($$select public.graph_respond_request('00000000-0000-0000-0000-000000000012', true)$$, 'the first competing Partner transition commits');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000014', true);
select lives_ok($$select public.graph_send_request('00000000-0000-0000-0000-000000000013', 'partner')$$, 'the second competing Partner request is created');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000013', true);
select lives_ok($$select public.graph_respond_request('00000000-0000-0000-0000-000000000014', true)$$, 'the second competing Partner transition commits');
select results_eq($$select count(*)::int from public.relationships where kind = 'partner' and ('00000000-0000-0000-0000-000000000013' in (member_low, member_high))$$, $$values (1)$$, 'competing Partner transitions retain one Partner for their shared member');
select results_eq($$select kind::text from public.relationships where member_low = '00000000-0000-0000-0000-000000000012' and member_high = '00000000-0000-0000-0000-000000000013'$$, $$values ('bro')$$, 'the displaced competing Partner is demoted to Bro');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);
select lives_ok($$select public.graph_send_request('00000000-0000-0000-0000-000000000014', 'bro')$$, 'a request exists before a forced transactional failure');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000014', true);
select throws_like($$select public.graph_respond_request('00000000-0000-0000-0000-000000000013', true)$$, 'request unavailable', 'a failed acceptance rejects without partial graph mutation');
select results_eq($$select count(*)::int from public.relationship_requests where requester_id = '00000000-0000-0000-0000-000000000012' and recipient_id = '00000000-0000-0000-0000-000000000014'$$, $$values (1)$$, 'atomic failure preserves the unrelated pending request');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000014', true);
select lives_ok($$select public.graph_downgrade_partner('00000000-0000-0000-0000-000000000013')$$, 'either Partner can explicitly downgrade the relationship to Bro');
select results_eq($$select kind::text from public.relationships where member_low = '00000000-0000-0000-0000-000000000013' and member_high = '00000000-0000-0000-0000-000000000014'$$, $$values ('bro')$$, 'downgrade preserves the relationship as Bro');
select throws_like($$select public.graph_downgrade_partner('00000000-0000-0000-0000-000000000013')$$, 'partner relationship unavailable', 'a stale duplicate downgrade is rejected without mutation');

select * from finish();
rollback;
