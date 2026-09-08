begin;
select plan(44);

create function pg_temp.pub_routine(id text, name text, version integer default 1) returns jsonb language sql immutable as $$
  select jsonb_build_object('id',id,'version',version,'versionOf',id||'-lineage','previousVersionId',id||'-previous','name',name,'muscleGroups',jsonb_build_array('chest'),'exercises',jsonb_build_array(jsonb_build_object('id',id||'-exercise','name','Press','muscleGroups',jsonb_build_array('chest'),'sets',jsonb_build_array(jsonb_build_object('id',id||'-set','tipo',1,'weight',80,'reps',8)))),'createdAt','2026-09-06T00:00:00Z')
$$;
create function pg_temp.pub_mesocycle(id text, routine_id text) returns jsonb language sql immutable as $$
  select jsonb_build_object('id',id,'version',3,'versionOf',id||'-lineage','previousVersionId',id||'-previous','name','Strength','goal','Build','status','active','startDate','2026-09-01','pausedAt','2026-09-02T00:00:00Z','scheduleShiftDays',2,'lifecycleHistory',jsonb_build_array(jsonb_build_object('status','active')),'durationWeeks',1,'weeks',jsonb_build_array(jsonb_build_object('id',id||'-week','weekNumber',1,'entries',jsonb_build_array(jsonb_build_object('id',id||'-entry','ref',jsonb_build_object('routineId',routine_id,'routineName','Upper','source','local'),'order',1)))),'createdAt','2026-09-06T00:00:00Z')
$$;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select format('26000000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',format('publication%s@example.com',n),'',now(),'{}','{}',now(),now() from generate_series(1,5) n;
insert into public.profiles(id,alias) select format('26000000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('Publication %s',n) from generate_series(1,5) n;
insert into public.relationships(member_low,member_high,kind) values ('26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000002','bro');
insert into public.training_libraries(owner_id,routines,mesocycles) values ('26000000-0000-0000-0000-000000000001',jsonb_build_array(pg_temp.pub_routine('source-routine','Upper',7)),jsonb_build_array(pg_temp.pub_mesocycle('source-mesocycle','source-routine')));

set local role anon;
select throws_like($$select public.list_plan_feed()$$,'permission denied for function list_plan_feed','anonymous callers cannot read publication projections');
set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
select set_config('test.private',public.create_plan_publication('routine','source-routine','private',true)::text,true);
select set_config('test.circle',public.create_plan_publication('mesocycle','source-mesocycle','circle',true)::text,true);
select set_config('test.community',public.create_plan_publication('routine','source-routine','community',false)::text,true);
select is(public.get_plan_publication(current_setting('test.private')::uuid)->>'sourceVersionId','7','author publishes only an owned immutable source version');
select throws_like($$select public.create_plan_publication('routine','missing','community',true)$$,'plan unavailable','publication requires author ownership');
select is(public.get_plan_publication(current_setting('test.private')::uuid)->>'visibility','private','private publication remains author-readable');
set local role postgres; select throws_like($$update public.plan_publications set snapshot='{}' where id=current_setting('test.private')::uuid$$,'plan publication snapshots are immutable','stored source snapshots cannot be edited'); set local role authenticated;
select throws_like($$select * from public.plan_publications$$,'permission denied for table plan_publications','browser roles cannot read sensitive publication tables');

select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000002',true);
select throws_like($$select public.get_plan_publication(current_setting('test.private')::uuid)$$,'publication unavailable','private means author-only outside targeted private sharing');
select is(public.get_plan_publication(current_setting('test.circle')::uuid)->>'visibility','circle','accepted unblocked circle can read circle publication');
select is(public.get_plan_publication(current_setting('test.community')::uuid)->>'visibility','community','authenticated unblocked viewer can read community publication');
select throws_like($$select public.copy_plan_publication(current_setting('test.community')::uuid)$$,'publication is not copyable','visibility does not imply copy permission');
select set_config('test.copy',public.copy_plan_publication(current_setting('test.circle')::uuid)::text,true);
select is(public.copy_plan_publication(current_setting('test.circle')::uuid),current_setting('test.copy')::jsonb,'copy is idempotent per actor and publication');
select is(jsonb_array_length(public.load_routines_v2()->'items'),1,'idempotent copy imports routines exactly once');
select isnt(public.load_routines_v2()->'items'->0->>'id','source-routine','copied routines use fresh owner-local IDs');
select is(public.load_mesocycles_v2()->'items'->0->'weeks'->0->'entries'->0->'ref'->>'routineId',public.load_routines_v2()->'items'->0->>'id','mesocycle routine references are remapped');
select is(public.load_mesocycles_v2()->'items'->0->>'status','draft','imported mesocycle lifecycle resets to draft');
select ok(not (public.load_mesocycles_v2()->'items'->0 ?| array['startDate','pausedAt','pausedOn','scheduleShiftDays','lifecycleHistory']),'imported lifecycle and start fields are removed');
select is(public.load_mesocycles_v2()->'items'->0->'publicationOrigin'->>'sourceVersionId','3','copy preserves source version provenance');
select is(public.load_routines_v2()->'items'->0->'publicationOrigin'->>'sourceAuthorId','26000000-0000-0000-0000-000000000001','copy preserves creator provenance');
select is(public.load_routines_v2()->>'revision','1','atomic copy advances routine CAS revision once');
select is(public.load_mesocycles_v2()->>'revision','1','atomic copy advances mesocycle CAS revision once');
select lives_ok($$select public.set_plan_publication_reaction(current_setting('test.circle')::uuid,true)$$,'authorized viewer can react');
select lives_ok($$select set_config('test.comment',public.create_plan_publication_comment(current_setting('test.circle')::uuid,' Great plan ')::text,true)$$,'authorized viewer can comment');
select is(public.get_plan_publication(current_setting('test.circle')::uuid)->'comments'->0->>'body','Great plan','projection includes trimmed authorized comment');
select lives_ok($$select public.report_plan_content('publication',current_setting('test.circle')::uuid,'safety')$$,'viewer can report a visible publication');
select lives_ok($$select public.report_plan_content('publication',current_setting('test.circle')::uuid,'safety')$$,'duplicate report is idempotent');
select lives_ok($$select public.report_plan_content('comment',current_setting('test.comment')::uuid,'abuse')$$,'viewer can report a visible comment');
select throws_like($$select * from public.plan_publication_reports$$,'permission denied for table plan_publication_reports','reports are unavailable to browser roles and retained for service review');
set local role postgres; select is((select count(*) from public.plan_publication_reports),2::bigint,'reports are idempotent per actor and content'); set local role authenticated;
select lives_ok($$select public.delete_plan_publication_comment(current_setting('test.comment')::uuid)$$,'comment author can delete own comment');

set local role postgres;
delete from public.relationships where member_low='26000000-0000-0000-0000-000000000001' and member_high='26000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000002',true);
select throws_like($$select public.get_plan_publication(current_setting('test.circle')::uuid)$$,'publication unavailable','current accepted-circle membership is rechecked on read');
select throws_like($$select public.set_plan_publication_reaction(current_setting('test.circle')::uuid,true)$$,'publication unavailable','relationship loss denies engagement at action time');
set local role postgres;
insert into public.relationships(member_low,member_high,kind) values ('26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000002','bro');
insert into public.blocks(blocker_id,blocked_id) values ('26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_like($$select public.get_plan_publication(current_setting('test.community')::uuid)$$,'publication unavailable','author-to-viewer block denies community visibility');
set local role postgres; delete from public.blocks; insert into public.blocks(blocker_id,blocked_id) values ('26000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000001'); set local role authenticated;
select throws_like($$select public.get_plan_publication(current_setting('test.community')::uuid)$$,'publication unavailable','viewer-to-author block also denies community visibility');
set local role postgres; delete from public.blocks; update public.plan_publications set moderation_hidden_at=now() where id=current_setting('test.community')::uuid; set local role authenticated;
select throws_like($$select public.get_plan_publication(current_setting('test.community')::uuid)$$,'publication unavailable','moderation-hidden publications disappear from normal projections');
select hasnt_function('public','moderate_plan_publication',array['uuid','boolean'],'no browser moderator RPC exists');

set local role postgres; update public.plan_publications set deleted_at=now() where id=current_setting('test.private')::uuid; insert into public.community_activities(author_id,kind,source_key,payload,created_at) values ('26000000-0000-0000-0000-000000000001','personal_record','publication-feed-existing','{}',(select created_at-interval '1 second' from public.plan_publications where id=current_setting('test.circle')::uuid)); set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
select is(public.list_plan_feed(null,1)->'items'->0->>'type','publication','unified feed merges publication projection in server order');
select ok(public.list_plan_feed(null,1)->>'nextCursor' is not null,'unified feed emits a keyset cursor');
select is(public.list_plan_feed(public.list_plan_feed(null,1)->>'nextCursor',1)->'items'->0->>'type','activity','next page contains existing activity without client-side merge');
select throws_like($$select public.list_plan_feed('bad')$$,'invalid cursor','feed rejects malformed cursors');

select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000003',true);
select throws_like($$select public.delete_plan_publication(current_setting('test.circle')::uuid)$$,'publication unavailable','non-author cannot delete publication');
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.update_plan_publication(current_setting('test.circle')::uuid,'private',false)$$,'author can revoke visibility and copy permission');
select lives_ok($$select public.delete_plan_publication(current_setting('test.circle')::uuid)$$,'author can delete publication');
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000002',true);
select throws_like($$select public.copy_plan_publication(current_setting('test.circle')::uuid)$$,'publication unavailable','revoked or deleted publication rejects future copies');
select is(jsonb_array_length(public.load_mesocycles_v2()->'items'),1,'deletion preserves independent copied plans');

select * from finish();
rollback;
