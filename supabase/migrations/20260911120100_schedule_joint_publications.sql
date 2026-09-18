-- Required deployment prerequisite: pg_cron must be enabled for this database.
-- Fail rather than silently deploying an app-dependent expiry mechanism.
create extension if not exists pg_cron;
select cron.schedule('gymbro-joint-publications', '* * * * *',
  'select public.reconcile_joint_workout_publications()');
