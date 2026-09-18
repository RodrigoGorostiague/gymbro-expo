begin;
select plan(10);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('61000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','preview1@test.invalid','',now(),'{}','{}',now(),now()),
('61000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','preview2@test.invalid','',now(),'{}','{}',now(),now());
insert into public.profiles(id,alias) values ('61000000-0000-0000-0000-000000000001','Preview Owner'),('61000000-0000-0000-0000-000000000002','Other Owner');
insert into public.experience_attempts values
('61000000-0000-0000-0000-000000000001','session',now(),current_date,1,1,1,'{"recapPublicationKey":"preview-key"}'),
('61000000-0000-0000-0000-000000000001','pending',now(),current_date,1,1,1,'{"recapPublicationKey":"pending-key"}'),
('61000000-0000-0000-0000-000000000001','joint',now(),current_date,1,1,1,'{"jointWorkoutId":"61000000-0000-0000-0000-000000000100"}');
-- These fixtures represent historical attempts created before review was introduced.
-- New-attempt review behavior is covered in workout_publication_review.sql.
delete from private.workout_completion_reviews where owner_id = '61000000-0000-0000-0000-000000000001';
insert into public.workout_recaps(author_id,routine_name,completed_at,duration_seconds,exercise_count,publication_key)
values ('61000000-0000-0000-0000-000000000001','Upper',now(),60,1,'preview-key');
insert into public.community_activities(author_id,kind,source_key,payload) values
('61000000-0000-0000-0000-000000000001','personal_record','personal-record:session','{"exercise_name":"Press","best_score":240,"score_unit":"kg-reps"}'),
('61000000-0000-0000-0000-000000000001','personal_record','personal-record:another-session','{"exercise_name":"Wrong session"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
select is(public.get_workout_completion_preview('session')->>'status','published','published state is backed by exact publication key');
select is(public.get_workout_completion_preview('session')->'recap'->>'routine_name','Upper','reuses the real recap projection');
select is(jsonb_array_length(public.get_workout_completion_preview('session')->'activities'),1,'only this attempt record appears');
select is(public.get_workout_completion_preview('session')->'activities'->0->>'author_alias','Preview Owner','uses current profile presentation');
select is(public.get_workout_completion_preview('pending')->>'status','pending','unpublished auto-share remains pending');
select is(public.get_workout_completion_preview('joint')->>'status','joint','joint completion is not falsely presented as individual');
select is(public.get_workout_completion_preview('missing')->>'confirmed','false','offline or missing attempts are unconfirmed');
set local role postgres;
update public.profiles set auto_share_completed_workouts=false where id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.get_workout_completion_preview('pending')->>'status','private','disabled sharing stays private');
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000002',true);
select is(public.get_workout_completion_preview('session')->>'confirmed','false','other accounts cannot read completion data');
set local role postgres;
update public.workout_recaps set deleted_at=now() where publication_key='preview-key';
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
select is(public.get_workout_completion_preview('session')->>'status','removed','deleted publications are not pending or resurrected');
select * from finish();
rollback;
