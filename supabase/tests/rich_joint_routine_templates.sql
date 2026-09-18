begin;
select no_plan();
create function pg_temp.rich_template(set_patch jsonb default '{}') returns jsonb language sql as $$
select jsonb_build_object('name','Upper','muscleGroups',jsonb_build_array('back'),'exercises',jsonb_build_array(jsonb_build_object('name','Row','muscleGroups',jsonb_build_array('back'),'loadMode','external-load','loadUnit','kg','variant','barbell','sets',jsonb_build_array('{"tipo":1,"weight":20,"reps":8}'::jsonb||set_patch))))
$$;
select ok(private.is_valid_recap_template_routine(pg_temp.rich_template()),'legacy template accepted');
select ok(private.is_valid_recap_template_routine(pg_temp.rich_template('{"effortTarget":{"kind":"rir","value":2},"backoffGroup":0}')),'actual rich mobile and web template accepted');
select ok(private.is_valid_recap_template_routine(pg_temp.rich_template('{"effortTarget":{"kind":"rir","value":0},"backoffGroup":99}')),'RIR and group bounds accepted');
select ok(private.is_valid_recap_template_routine(pg_temp.rich_template('{"effortTarget":{"kind":"rir","value":5}}')),'maximum RIR accepted');
select ok(private.is_valid_recap_template_routine(pg_temp.rich_template('{"effortTarget":{"kind":"rpe","value":6}}')),'minimum RPE accepted');
select ok(private.is_valid_recap_template_routine(pg_temp.rich_template('{"effortTarget":{"kind":"rpe","value":10}}')),'maximum RPE accepted');
select ok(not private.is_valid_recap_template_routine(pg_temp.rich_template(patch)),label)
from (values
('{"effortTarget":null}'::jsonb,'null effort rejected'),
('{"effortTarget":[]}'::jsonb,'array effort rejected'),
('{"effortTarget":{"kind":"rir"}}'::jsonb,'missing effort value rejected'),
('{"effortTarget":{"value":2}}'::jsonb,'missing effort kind rejected'),
('{"effortTarget":{"kind":null,"value":2}}'::jsonb,'null effort kind rejected'),
('{"effortTarget":{"kind":"invalid","value":2}}'::jsonb,'unknown effort kind rejected'),
('{"effortTarget":{"kind":"rir","value":"2"}}'::jsonb,'string effort value rejected'),
('{"effortTarget":{"kind":"rir","value":2.5}}'::jsonb,'fractional effort rejected'),
('{"effortTarget":{"kind":"rir","value":6}}'::jsonb,'RIR above maximum rejected'),
('{"effortTarget":{"kind":"rir","value":-1}}'::jsonb,'negative RIR rejected'),
('{"effortTarget":{"kind":"rpe","value":5}}'::jsonb,'RPE below minimum rejected'),
('{"effortTarget":{"kind":"rpe","value":11}}'::jsonb,'RPE above maximum rejected'),
('{"effortTarget":{"kind":"rir","value":2,"extra":true}}'::jsonb,'extra effort fields rejected'),
('{"backoffGroup":null}'::jsonb,'null group rejected'),
('{"backoffGroup":"0"}'::jsonb,'string group rejected'),
('{"backoffGroup":0.5}'::jsonb,'fractional group rejected'),
('{"backoffGroup":-1}'::jsonb,'negative group rejected'),
('{"backoffGroup":100}'::jsonb,'oversized group rejected'),
('{"extra":true}'::jsonb,'unknown set fields remain rejected')
) invalid(patch,label);
select * from finish();
rollback;
