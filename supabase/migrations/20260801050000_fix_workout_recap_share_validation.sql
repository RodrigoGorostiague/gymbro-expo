-- Qualify JSON record columns so they cannot conflict with the established parameter name.
create or replace function private.is_valid_recap_template_routine(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare exercise jsonb; set_value jsonb; muscle jsonb;
begin
  if jsonb_typeof(value) <> 'object' or not value ?& array['name', 'muscleGroups', 'exercises']
    or exists (select 1 from jsonb_object_keys(value) key where key <> all(array['name', 'muscleGroups', 'exercises']))
    or jsonb_typeof(value -> 'name') <> 'string' or char_length(btrim(value ->> 'name')) not between 1 and 120
    or jsonb_typeof(value -> 'muscleGroups') <> 'array' or jsonb_array_length(value -> 'muscleGroups') not between 1 and 32
    or jsonb_typeof(value -> 'exercises') <> 'array' or jsonb_array_length(value -> 'exercises') not between 1 and 100 then return false; end if;
  for muscle in select item.element from jsonb_array_elements(value -> 'muscleGroups') as item(element) loop if jsonb_typeof(muscle) <> 'string' or char_length(btrim(muscle #>> '{}')) not between 1 and 120 then return false; end if; end loop;
  for exercise in select item.element from jsonb_array_elements(value -> 'exercises') as item(element) loop
    if jsonb_typeof(exercise) <> 'object' or not exercise ?& array['name', 'muscleGroups', 'loadMode', 'loadUnit', 'variant', 'sets']
      or exists (select 1 from jsonb_object_keys(exercise) key where key <> all(array['name', 'muscleGroups', 'loadMode', 'loadUnit', 'variant', 'sets']))
      or jsonb_typeof(exercise -> 'name') <> 'string' or char_length(btrim(exercise ->> 'name')) not between 1 and 120
      or jsonb_typeof(exercise -> 'muscleGroups') <> 'array' or jsonb_array_length(exercise -> 'muscleGroups') not between 1 and 32
      or exercise ->> 'loadMode' not in ('external-load', 'bodyweight', 'assisted') or exercise ->> 'loadUnit' not in ('kg', 'lb')
      or jsonb_typeof(exercise -> 'variant') <> 'string' or char_length(btrim(exercise ->> 'variant')) not between 1 and 120
      or jsonb_typeof(exercise -> 'sets') <> 'array' or jsonb_array_length(exercise -> 'sets') not between 1 and 100 then return false; end if;
    for muscle in select item.element from jsonb_array_elements(exercise -> 'muscleGroups') as item(element) loop if jsonb_typeof(muscle) <> 'string' or char_length(btrim(muscle #>> '{}')) not between 1 and 120 then return false; end if; end loop;
    for set_value in select item.element from jsonb_array_elements(exercise -> 'sets') as item(element) loop
      if jsonb_typeof(set_value) <> 'object' or not set_value ?& array['tipo', 'weight', 'reps']
        or exists (select 1 from jsonb_object_keys(set_value) key where key <> all(array['tipo', 'weight', 'reps']))
        or (jsonb_typeof(set_value -> 'tipo') <> 'number' and set_value ->> 'tipo' not in ('C', 'F'))
        or (jsonb_typeof(set_value -> 'tipo') = 'number' and ((set_value ->> 'tipo')::numeric <> trunc((set_value ->> 'tipo')::numeric) or (set_value ->> 'tipo')::numeric not between 0 and 10))
        or jsonb_typeof(set_value -> 'weight') <> 'number' or (set_value ->> 'weight')::numeric not between 0 and 10000
        or jsonb_typeof(set_value -> 'reps') <> 'number' or (set_value ->> 'reps')::numeric <> trunc((set_value ->> 'reps')::numeric) or (set_value ->> 'reps')::numeric not between 0 and 1000 then return false; end if;
    end loop;
  end loop;
  return true;
end;
$$;
