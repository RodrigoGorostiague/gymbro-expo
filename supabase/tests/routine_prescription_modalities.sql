begin;
select plan(1);
select lives_ok($test$
-- Run inside a transaction after 20260918120000_routine_prescription_modalities.sql.
do $$
declare template jsonb; attempt jsonb; valid integer;
begin
  template := '{"name":"Core","muscleGroups":["GM-101"],"exercises":[{"name":"Plank","muscleGroups":["GM-101"],"loadMode":"bodyweight","loadUnit":"kg","variant":"Suelo","sets":[{"tipo":1,"weight":0,"reps":0,"durationSeconds":45,"loadBasis":"bodyweight"}]}]}';
  if not private.is_valid_recap_template_routine(template) then raise exception 'duration template rejected'; end if;
  if private.is_valid_recap_template_routine(jsonb_set(template,'{exercises,0,sets,0,durationSeconds}','-1')) then raise exception 'negative duration accepted'; end if;
  template := jsonb_set(template,'{exercises,0,sets}', '[{"tipo":1,"weight":20,"reps":10,"dropGroup":0},{"tipo":1,"weight":15,"reps":8,"dropGroup":0}]');
  if not private.is_valid_recap_template_routine(template) then raise exception 'drop template rejected'; end if;
  if private.is_valid_recap_template_routine(jsonb_set(template,'{exercises,0,sets,0,backoffGroup}','0')) then raise exception 'ambiguous technique accepted'; end if;
  attempt := '{"exercises":[{"exerciseId":"plank","variant":"floor","sets":[{"plan":{"id":"one","type":1},"result":{"setId":"one","performed":true,"performance":{"mode":"bodyweight","bodyweight":0,"bodyweightUnspecified":true,"unit":"kg","reps":0,"durationSeconds":45}}}]}]}';
  select public.reward_valid_sets(attempt) into valid;
  if valid <> 1 then raise exception 'valid timed bodyweight set lost: %', valid; end if;
  if public.reward_valid_sets(jsonb_set(attempt,'{exercises,0,sets,0,result,performance,durationSeconds}','0')) <> 0 then raise exception 'zero duration rewarded'; end if;
  attempt := jsonb_set(attempt, '{exercises,0,sets,0,result,performance}', '{"mode":"external-load","load":20,"unit":"kg","reps":10,"bodyweightIncluded":true}');
  if exists(select 1 from private.contextual_record_scores(attempt)) then raise exception 'added weight mixed with external records'; end if;
  if not private.is_valid_recap_share_payload(jsonb_build_object('version',1,'routine',template,'performedSets','[{"exerciseIndex":0,"sets":[{"weight":0,"reps":0,"durationSeconds":45,"completed":true}]}]'::jsonb)) then raise exception 'timed recap rejected'; end if;
end;
$$;

$test$, 'prescription validators preserve timed, drop and bodyweight semantics');
select * from finish();
rollback;
