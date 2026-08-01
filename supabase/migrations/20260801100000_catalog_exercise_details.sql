-- PostgreSQL cannot replace a table-returning function when its OUT columns change.
drop function public.list_catalog_exercises();

create function public.list_catalog_exercises()
returns table (
  exercise_id text,
  canonical_name text,
  movement_pattern text,
  equipment text,
  muscle_group_ids text[],
  primary_muscle_group_ids text[],
  muscle_participations jsonb
)
language sql stable security definer set search_path = '' as $$
  select exercise.id, exercise.canonical_name, exercise.movement_pattern, exercise.equipment,
    array_agg(association.muscle_group_id order by association.relevance desc, association.muscle_group_id),
    array_agg(association.muscle_group_id order by association.relevance desc, association.muscle_group_id)
      filter (where association.role = 'Principal'),
    jsonb_agg(jsonb_build_object(
      'muscle_group_id', association.muscle_group_id,
      'role', association.role,
      'relevance', association.relevance,
      'original_label', association.original_label
    ) order by association.relevance desc, association.muscle_group_id)
  from public.exercises as exercise
  join public.exercise_muscle_groups as association on association.exercise_id = exercise.id
  group by exercise.id, exercise.canonical_name, exercise.movement_pattern, exercise.equipment
  order by exercise.canonical_name, exercise.id
$$;

revoke all on function public.list_catalog_exercises() from public, anon;
grant execute on function public.list_catalog_exercises() to authenticated;
