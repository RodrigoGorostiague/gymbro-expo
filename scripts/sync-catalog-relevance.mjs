import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';

const EXERCISE_HEADERS = ['ID', 'Nombre canónico', 'Patrón de movimiento', 'Grupo muscular principal', 'Grupos musculares secundarios', 'Implemento', 'Ángulo o plano', 'Lateralidad', 'Posición corporal', 'Tipo de apoyo', 'Agarre', 'Trayectoria o modalidad', 'Cadena cinética', 'Nivel técnico', 'Observaciones'];
const ASSOCIATION_HEADERS = ['ID relación', 'ID ejercicio', 'Ejercicio', 'ID grupo muscular', 'Grupo muscular canónico', 'Rol', 'Relevancia', 'Etiqueta original', 'Origen'];
const BACKUP_DIRECTORY = '/home/rodaja/gymbro-ledger-backups';
const LOCAL_CONTAINER = 'supabase_db_gymbro';
const EXPECTED_EXERCISES = 79;
const EXPECTED_ASSOCIATIONS = 251;

function fail(message) {
  throw new Error(`Catalog relevance synchronization rejected: ${message}`);
}

function text(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).normalize('NFC').trim().replace(/\s+/gu, ' ');
  return normalized || null;
}

function required(value, context) {
  const normalized = text(value);
  if (!normalized) fail(`${context} is required`);
  return normalized;
}

function sheetRows(workbook, sheetName, headers) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) fail(`worksheet "${sheetName}" is required`);
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  if (!rows.length) fail(`worksheet "${sheetName}" is empty`);
  const actualHeaders = Object.keys(rows[0]);
  for (const header of headers) if (!actualHeaders.includes(header)) fail(`worksheet "${sheetName}" is missing header "${header}"`);
  return rows;
}

function parseWorkbook(catalogPath) {
  const workbook = XLSX.readFile(catalogPath, { cellText: true, cellDates: false });
  const exerciseRows = sheetRows(workbook, 'Ejercicios 1.1', EXERCISE_HEADERS);
  const associationRows = sheetRows(workbook, 'Ejercicio-músculo 1.1', ASSOCIATION_HEADERS);
  const exerciseIds = new Set();
  const exercises = exerciseRows.map((row, index) => {
    const context = `Ejercicios 1.1 row ${index + 2}`;
    const id = required(row.ID, `${context}.ID`);
    if (!/^EX-\d{4}$/u.test(id)) fail(`${context}.ID "${id}" is invalid`);
    if (exerciseIds.has(id)) fail(`duplicate exercise ID "${id}"`);
    exerciseIds.add(id);
    return {
      id,
      canonicalName: required(row['Nombre canónico'], `${context}.Nombre canónico`),
      movementPattern: text(row['Patrón de movimiento']),
      primaryMuscleLabel: required(row['Grupo muscular principal'], `${context}.Grupo muscular principal`),
      secondaryMuscleLabels: text(row['Grupos musculares secundarios']),
      equipment: text(row.Implemento),
      angleOrPlane: text(row['Ángulo o plano']),
      laterality: text(row.Lateralidad),
      bodyPosition: text(row['Posición corporal']),
      supportType: text(row['Tipo de apoyo']),
      grip: text(row.Agarre),
      trajectoryOrModality: text(row['Trayectoria o modalidad']),
      kineticChain: text(row['Cadena cinética']),
      technicalLevel: text(row['Nivel técnico']),
      notes: text(row.Observaciones),
    };
  });
  if (exercises.length !== EXPECTED_EXERCISES) fail(`expected ${EXPECTED_EXERCISES} exercises, found ${exercises.length}`);

  const exerciseNames = new Map(exercises.map((exercise) => [exercise.id, exercise.canonicalName]));
  const relationIds = new Set();
  const associationKeys = new Set();
  const primaryExerciseIds = new Set();
  const associations = associationRows.map((row, index) => {
    const context = `Ejercicio-músculo 1.1 row ${index + 2}`;
    const id = required(row['ID relación'], `${context}.ID relación`);
    const exerciseId = required(row['ID ejercicio'], `${context}.ID ejercicio`);
    const exerciseName = required(row.Ejercicio, `${context}.Ejercicio`);
    const muscleGroupId = required(row['ID grupo muscular'], `${context}.ID grupo muscular`);
    const muscleGroupName = required(row['Grupo muscular canónico'], `${context}.Grupo muscular canónico`);
    const role = required(row.Rol, `${context}.Rol`);
    const relevance = Number(required(row.Relevancia, `${context}.Relevancia`));
    if (!/^EM-\d{5}$/u.test(id)) fail(`${context}.ID relación "${id}" is invalid`);
    if (!exerciseIds.has(exerciseId)) fail(`${context}.ID ejercicio "${exerciseId}" is not in Ejercicios 1.1`);
    if (exerciseNames.get(exerciseId) !== exerciseName) fail(`${context}.Ejercicio does not exactly match "${exerciseId}"`);
    if (!/^GM-\d{3}$/u.test(muscleGroupId)) fail(`${context}.ID grupo muscular "${muscleGroupId}" is invalid`);
    if (!['Principal', 'Secundario'].includes(role)) fail(`${context}.Rol "${role}" is invalid`);
    if (!Number.isFinite(relevance) || relevance < 0 || relevance > 1) fail(`${context}.Relevancia must be between 0 and 1`);
    if (relationIds.has(id)) fail(`duplicate relation ID "${id}"`);
    relationIds.add(id);
    const associationKey = `${exerciseId}\u0000${muscleGroupId}\u0000${role}`;
    if (associationKeys.has(associationKey)) fail(`duplicate exercise/group/role association for "${exerciseId}"`);
    associationKeys.add(associationKey);
    if (role === 'Principal') primaryExerciseIds.add(exerciseId);
    return { id, exerciseId, muscleGroupId, muscleGroupName, role, relevance, originalLabel: required(row['Etiqueta original'], `${context}.Etiqueta original`), sourceOrigin: required(row.Origen, `${context}.Origen`) };
  });
  if (associations.length !== EXPECTED_ASSOCIATIONS) fail(`expected ${EXPECTED_ASSOCIATIONS} associations, found ${associations.length}`);
  if (primaryExerciseIds.size !== exercises.length) fail('every exercise must have a Principal association');
  return { exercises, associations };
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insertStatement(table, fields, rows, values) {
  return `insert into ${table} (${fields.join(', ')}) values\n${rows.map((row) => `(${values(row).map(sqlLiteral).join(', ')})`).join(',\n')};`;
}

function buildSql({ exercises, associations }, target) {
  const exerciseFields = ['id', 'canonical_name', 'movement_pattern', 'primary_muscle_label', 'secondary_muscle_labels', 'equipment', 'angle_or_plane', 'laterality', 'body_position', 'support_type', 'grip', 'trajectory_or_modality', 'kinetic_chain', 'technical_level', 'notes'];
  const associationFields = ['id', 'exercise_id', 'muscle_group_id', 'muscle_group_name', 'role', 'relevance', 'original_label', 'source_origin'];
  const remoteAssertions = target === 'remote' ? `
    if (select count(*) from sync_exercises input join public.exercises existing using (id)) <> (select count(*) from sync_exercises) then raise exception 'remote is missing one or more target exercises'; end if;
    if exists (
      select 1 from sync_exercises input join public.exercises existing using (id)
      where existing.canonical_name is distinct from input.canonical_name
        or existing.movement_pattern is distinct from input.movement_pattern
        or existing.primary_muscle_label is distinct from input.primary_muscle_label
        or existing.secondary_muscle_labels is distinct from input.secondary_muscle_labels
        or existing.equipment is distinct from input.equipment
        or existing.angle_or_plane is distinct from input.angle_or_plane
        or existing.laterality is distinct from input.laterality
        or existing.body_position is distinct from input.body_position
        or existing.support_type is distinct from input.support_type
        or existing.grip is distinct from input.grip
        or existing.trajectory_or_modality is distinct from input.trajectory_or_modality
        or existing.kinetic_chain is distinct from input.kinetic_chain
        or existing.technical_level is distinct from input.technical_level
        or existing.notes is distinct from input.notes
    ) then raise exception 'remote target exercise attributes do not match workbook'; end if;` : '';
  const statements = [
    'lock table public.exercises, public.exercise_muscle_groups, public.muscle_groups in share row exclusive mode;',
    'create temporary table sync_exercises (id text primary key, canonical_name text not null, movement_pattern text, primary_muscle_label text, secondary_muscle_labels text, equipment text, angle_or_plane text, laterality text, body_position text, support_type text, grip text, trajectory_or_modality text, kinetic_chain text, technical_level text, notes text) on commit drop;',
    insertStatement('sync_exercises', exerciseFields, exercises, (row) => [row.id, row.canonicalName, row.movementPattern, row.primaryMuscleLabel, row.secondaryMuscleLabels, row.equipment, row.angleOrPlane, row.laterality, row.bodyPosition, row.supportType, row.grip, row.trajectoryOrModality, row.kineticChain, row.technicalLevel, row.notes]),
    'create temporary table sync_associations (id text primary key, exercise_id text not null, muscle_group_id text not null, muscle_group_name text not null, role text not null, relevance numeric not null, original_label text not null, source_origin text not null, unique (exercise_id, muscle_group_id, role)) on commit drop;',
    insertStatement('sync_associations', associationFields, associations, (row) => [row.id, row.exerciseId, row.muscleGroupId, row.muscleGroupName, row.role, row.relevance, row.originalLabel, row.sourceOrigin]),
    `do $$ declare report jsonb; begin
      if exists (select 1 from sync_associations input left join public.muscle_groups groups on groups.id = input.muscle_group_id and groups.name = input.muscle_group_name where groups.id is null) then raise exception 'workbook muscle group ID/name does not exactly match catalog taxonomy'; end if;
      if exists (select 1 from sync_associations input join public.exercise_muscle_groups existing using (id) where existing.exercise_id not in (select id from sync_exercises)) then raise exception 'workbook association ID belongs to a non-target exercise'; end if;${remoteAssertions}
      if (select count(distinct exercise_id) from sync_associations where role = 'Principal') <> (select count(*) from sync_exercises) then raise exception 'one or more target exercises lack a primary association'; end if;
    end $$;`,
    target === 'local'
      ? 'insert into public.exercises (id, canonical_name, movement_pattern, primary_muscle_label, secondary_muscle_labels, equipment, angle_or_plane, laterality, body_position, support_type, grip, trajectory_or_modality, kinetic_chain, technical_level, notes) select id, canonical_name, movement_pattern, primary_muscle_label, secondary_muscle_labels, equipment, angle_or_plane, laterality, body_position, support_type, grip, trajectory_or_modality, kinetic_chain, technical_level, notes from sync_exercises on conflict (id) do nothing;'
      : '',
    'delete from public.exercise_muscle_groups where exercise_id in (select id from sync_exercises);',
    'insert into public.exercise_muscle_groups (id, exercise_id, muscle_group_id, role, relevance, original_label, source_origin) select id, exercise_id, muscle_group_id, role, relevance, original_label, source_origin from sync_associations;',
    `do $$ declare report jsonb; begin
      if (select count(*) from public.exercise_muscle_groups where exercise_id in (select id from sync_exercises)) <> ${associations.length} then raise exception 'target association count mismatch'; end if;
      if exists ((select id, exercise_id, muscle_group_id, role, relevance, original_label, source_origin from sync_associations) except (select id, exercise_id, muscle_group_id, role, relevance, original_label, source_origin from public.exercise_muscle_groups where exercise_id in (select id from sync_exercises))) then raise exception 'target associations do not exactly match workbook'; end if;
      select public.catalog_integrity_report() into report;
      if (report ->> 'exercises_without_primary')::int <> 0 or (report ->> 'exercises_without_muscles')::int <> 0 then raise exception 'catalog integrity check failed'; end if;
    end $$;`,
  ].filter(Boolean);
  return `do $sync$ begin\n${statements.map((statement) => `execute $statement$${statement}$statement$;`).join('\n')}\nend $sync$;`;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.stdio ?? 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function backupLocal(backupPath) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(backupPath, { flags: 'wx' });
    const child = spawn('docker', ['exec', LOCAL_CONTAINER, 'pg_dump', '-U', 'postgres', '--schema=public', '--data-only']);
    child.stderr.pipe(process.stderr);
    child.stdout.pipe(output);
    child.on('error', reject);
    output.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`local backup exited with ${code}`)));
  });
}

async function synchronize(target, data, timestamp) {
  const backupPath = path.join(BACKUP_DIRECTORY, `gymbro-public-before-catalog-relevance-${target}-${timestamp}.sql`);
  if (target === 'local') await backupLocal(backupPath);
  else await run('npx', ['supabase', 'db', 'dump', '--linked', '--schema', 'public', '--data-only', '--file', backupPath]);
  const directory = await mkdtemp(path.join(tmpdir(), 'gymbro-catalog-relevance-'));
  const sqlPath = path.join(directory, `${target}.sql`);
  try {
    await writeFile(sqlPath, buildSql(data, target));
    await run('npx', ['supabase', 'db', 'query', target === 'local' ? '--local' : '--linked', '--file', sqlPath]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  return backupPath;
}

async function main() {
  const [catalogPath, ...flags] = process.argv.slice(2);
  if (!catalogPath) fail('usage: npm run catalog:sync-relevance -- <catalog.xlsx> [--target local|remote|both] [--dry-run]');
  if (!existsSync(catalogPath)) fail(`catalog workbook does not exist: ${catalogPath}`);
  const dryRun = flags.includes('--dry-run');
  const targetIndex = flags.indexOf('--target');
  const target = targetIndex === -1 ? 'both' : flags[targetIndex + 1];
  const knownFlags = new Set(['--dry-run', '--target', target]);
  if (!['local', 'remote', 'both'].includes(target) || flags.some((flag) => !knownFlags.has(flag))) fail('invalid options');
  const data = parseWorkbook(catalogPath);
  if (dryRun) {
    console.log(JSON.stringify({ event: 'catalog_relevance_validated', source: path.resolve(catalogPath), exercises: data.exercises.length, associations: data.associations.length }, null, 2));
    return;
  }
  if (!existsSync(BACKUP_DIRECTORY)) fail(`backup directory does not exist: ${BACKUP_DIRECTORY}`);
  const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
  const targets = target === 'both' ? ['local', 'remote'] : [target];
  const backups = {};
  for (const selectedTarget of targets) backups[selectedTarget] = await synchronize(selectedTarget, data, timestamp);
  console.log(JSON.stringify({ event: 'catalog_relevance_synchronized', source: path.resolve(catalogPath), backups, exercises: data.exercises.length, associations: data.associations.length }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ event: 'catalog_relevance_synchronization_failed', error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
