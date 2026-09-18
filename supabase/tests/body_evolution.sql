begin;
select plan(13);
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('61000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','body-a@example.com','',now(),'{}','{}',now(),now()),
('61000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','body-b@example.com','',now(),'{}','{}',now(),now());
insert into public.profiles(id,alias) values ('61000000-0000-0000-0000-000000000001','Body A'),('61000000-0000-0000-0000-000000000002','Body B');
insert into public.body_metrics(owner_id,metric_type,value,unit,measured_at,source) values
('61000000-0000-0000-0000-000000000001','body_weight',71,'kg',now()-interval '2 days','manual'),
('61000000-0000-0000-0000-000000000001','body_weight',72,'kg',now()-interval '2 days','manual');
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.save_body_day((now() at time zone 'UTC')::date,'UTC','[{"metricType":"body_weight","value":70},{"metricType":"waist","value":80}]')$$,'daily batch saves');
select lives_ok($$select public.save_body_day((now() at time zone 'UTC')::date,'UTC','[{"metricType":"body_weight","value":69}]')$$,'daily weight updates');
select is((select count(*) from public.list_body_evolution() where record_day is not null),2::bigint,'one metric per day');
select is((select value from public.list_body_evolution() where record_day is not null and metric_type='body_weight'),69::numeric,'updated value');
select is((select count(*) from public.list_body_evolution() where record_day is null),2::bigint,'legacy duplicates retained');
select throws_ok($$select public.save_body_day((now() at time zone 'UTC')::date-1,'UTC','[{"metricType":"body_weight","value":60}]')$$,'P0001','Only today can be updated','rejects backdating');
select throws_ok($$select public.save_body_day((now() at time zone 'UTC')::date+1,'UTC','[{"metricType":"body_weight","value":60}]')$$,'P0001','Only today can be updated','rejects future date');
select throws_ok($$select public.save_body_day((now() at time zone 'UTC')::date,'UTC','[{"metricType":"body_weight","value":60},{"metricType":"waist","value":-1}]')$$,'P0001','Invalid measurement','invalid batch rolls back');
select is((select value from public.list_body_evolution() where record_day is not null and metric_type='body_weight'),69::numeric,'failed batch does not partially update');
select set_config('test.body_metric_id',(select id::text from public.list_body_evolution() limit 1),true);
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.list_body_evolution()),0::bigint,'other account cannot read measurements');
select lives_ok($$select public.delete_body_measurements(array[current_setting('test.body_metric_id')::uuid])$$,'foreign deletion is harmless');
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.list_body_evolution()),4::bigint,'foreign deletion cannot remove owner data');
select public.delete_body_measurements(array(select id from public.list_body_evolution()));
select is((select count(*) from public.list_body_evolution()),0::bigint,'owner can delete historical and daily entries');
reset role;
select * from finish();
rollback;
