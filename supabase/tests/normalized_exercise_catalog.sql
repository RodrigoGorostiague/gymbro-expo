begin;
select plan(14);

delete from public.exercise_muscle_groups;
delete from public.muscle_group_relations;
delete from public.exercises;
delete from public.muscle_groups;

insert into public.muscle_groups (id, name, type, level, visible_in_filters, display_name, path) values
  ('GM-001', 'Cuerpo', 'Raíz anatómica', 0, false, 'Cuerpo', 'Cuerpo'),
  ('GM-100', 'Pecho', 'Grupo padre', 2, true, 'Pecho', 'Cuerpo > Tren superior > Pecho'),
  ('GM-101', 'Pectoral mayor', 'Músculo', 3, true, 'Pectoral mayor', 'Cuerpo > Tren superior > Pecho > Pectoral mayor'),
  ('GM-110', 'Hombros', 'Grupo padre', 2, true, 'Hombros', 'Cuerpo > Tren superior > Hombros'),
  ('GM-112', 'Deltoides anterior', 'Porción', 3, true, 'Deltoides anterior', 'Cuerpo > Tren superior > Hombros > Deltoides anterior'),
  ('GM-113', 'Deltoides lateral', 'Porción', 3, true, 'Deltoides lateral', 'Cuerpo > Tren superior > Hombros > Deltoides lateral'),
  ('GM-114', 'Deltoides posterior', 'Porción', 3, true, 'Deltoides posterior', 'Cuerpo > Tren superior > Hombros > Deltoides posterior'),
  ('GM-200', 'Glúteos', 'Grupo padre', 2, true, 'Glúteos', 'Cuerpo > Tren inferior > Glúteos'),
  ('GM-202', 'Glúteo medio', 'Músculo', 3, true, 'Glúteo medio', 'Cuerpo > Tren inferior > Glúteos > Glúteo medio'),
  ('GM-240', 'Abductores de cadera', 'Grupo funcional', 2, true, 'Abductores de cadera', 'Cuerpo > Tren inferior > Abductores de cadera'),
  ('GM-301', 'Recto abdominal', 'Músculo', 3, true, 'Recto abdominal', 'Cuerpo > Core > Recto abdominal');

insert into public.muscle_group_relations (id, parent_muscle_group_id, child_muscle_group_id, relation_type) values
  ('RG-0001', 'GM-001', 'GM-100', 'Jerárquica primaria'),
  ('RG-0002', 'GM-100', 'GM-101', 'Jerárquica primaria'),
  ('RG-0003', 'GM-001', 'GM-110', 'Jerárquica primaria'),
  ('RG-0004', 'GM-110', 'GM-112', 'Jerárquica primaria'),
  ('RG-0005', 'GM-110', 'GM-113', 'Jerárquica primaria'),
  ('RG-0006', 'GM-110', 'GM-114', 'Jerárquica primaria'),
  ('RG-0007', 'GM-001', 'GM-200', 'Jerárquica primaria'),
  ('RG-0008', 'GM-200', 'GM-202', 'Jerárquica primaria'),
  ('RG-0009', 'GM-240', 'GM-202', 'Funcional');

insert into public.exercises (id, canonical_name, movement_pattern, equipment) values
  ('EX-0001', 'Press de banca plano con barra', 'Empuje horizontal', 'Barra'),
  ('EX-0002', 'Elevación lateral con mancuernas', 'Abducción de hombro', 'Mancuernas'),
  ('EX-0003', 'Puente de glúteos', 'Extensión de cadera', 'Barra'),
  ('EX-0004', 'Plancha', 'Antiextensión', 'Peso corporal');

insert into public.exercise_muscle_groups (id, exercise_id, muscle_group_id, role, relevance, original_label, source_origin) values
  ('EM-00001', 'EX-0001', 'GM-101', 'Principal', 1.000, 'Pectoral mayor', 'Directa'),
  ('EM-00002', 'EX-0001', 'GM-112', 'Secundario', 0.450, 'deltoides anterior', 'Directa'),
  ('EM-00003', 'EX-0002', 'GM-113', 'Principal', 1.000, 'Deltoides lateral', 'Directa'),
  ('EM-00004', 'EX-0002', 'GM-114', 'Secundario', 0.450, 'Deltoides posterior', 'Directa'),
  ('EM-00005', 'EX-0003', 'GM-202', 'Principal', 1.000, 'Glúteo medio', 'Directa'),
  ('EM-00006', 'EX-0003', 'GM-200', 'Secundario', 0.450, 'Glúteos', 'Directa'),
  ('EM-00007', 'EX-0004', 'GM-301', 'Secundario', 0.450, 'Recto abdominal', 'Directa');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

select is((select count(*)::int from public.list_catalog_exercises()), 4, 'the authenticated catalog projection returns normalized exercises');

select is(
  (select array_agg(exercise_id order by relevance desc) from public.list_catalog_exercises_by_muscle_group('GM-100', 'primary_only')),
  array['EX-0001']::text[],
  'Pecho includes exercises matched through descendants as primary'
);
select is(
  (select array_agg(exercise_id order by canonical_name) from public.list_catalog_exercises_by_muscle_group('GM-110', 'all_roles')),
  array['EX-0002', 'EX-0001']::text[],
  'Hombros includes anterior, lateral, and posterior deltoid matches'
);
select is(
  (select array_agg(exercise_id) from public.list_catalog_exercises_by_muscle_group('GM-200', 'all_roles')),
  array['EX-0003']::text[],
  'Glúteos includes its shared gluteus medius descendant exactly once'
);
select is(
  (select array_agg(exercise_id) from public.list_catalog_exercises_by_muscle_group('GM-240', 'all_roles')),
  array['EX-0003']::text[],
  'Abductores de cadera traverses functional shared-parent relations'
);
select is(
  (select count(*)::int from public.list_catalog_exercises_by_muscle_group('GM-200', 'all_roles')),
  1,
  'multiple matching descendants never duplicate an exercise'
);
select is_empty(
  $$select * from public.list_catalog_exercises_by_muscle_group('GM-001', 'primary_only') where exercise_id = 'EX-0004'$$,
  'primary_only excludes exercises with solely secondary participation'
);
select is(
  (select array_agg(exercise_id) from public.list_catalog_exercises_by_muscle_group('GM-001', 'all_roles')),
  array['EX-0002', 'EX-0001', 'EX-0003']::text[],
  'results are sorted by relevance descending'
);
select throws_like(
  $$select public.list_catalog_exercises_by_muscle_group('GM-001', 'invalid')$$,
  'invalid participation mode',
  'the catalog RPC rejects invalid participation modes'
);
reset role;
select throws_like(
  $$insert into public.muscle_group_relations (id, parent_muscle_group_id, child_muscle_group_id, relation_type) values ('RG-0099', 'GM-101', 'GM-100', 'Jerárquica primaria')$$,
  'muscle group relation would create a cycle',
  'a reverse hierarchy edge cannot create a cycle'
);
select throws_ok(
  $$insert into public.exercise_muscle_groups (id, exercise_id, muscle_group_id, role, relevance, original_label, source_origin) values ('EM-00999', 'EX-0001', 'GM-101', 'Principal', 1.001, 'x', 'Directa')$$,
  '23514',
  'new row for relation "exercise_muscle_groups" violates check constraint "exercise_muscle_groups_relevance_check"',
  'relevance remains bounded to one'
);
select is((public.catalog_integrity_report() ->> 'exercises')::int, 4, 'integrity report counts exercises');
select is((public.catalog_integrity_report() ->> 'exercises_without_primary')::int, 1, 'integrity report identifies exercises without a primary muscle');

set local role anon;
select throws_ok($$select * from public.list_catalog_muscle_groups()$$, '42501', 'permission denied for function list_catalog_muscle_groups', 'anonymous callers cannot read catalog RPCs');

select * from finish();
rollback;
