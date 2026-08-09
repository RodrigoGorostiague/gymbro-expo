import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const REQUIRED_HEADERS = ['ID', 'Nombre canónico', 'Patrón de movimiento', 'Grupo muscular principal', 'Grupos musculares secundarios', 'Implemento', 'Ángulo o plano', 'Lateralidad', 'Posición corporal', 'Tipo de apoyo', 'Agarre', 'Trayectoria o modalidad', 'Cadena cinética', 'Nivel técnico', 'Observaciones'];
const SOURCE_ORIGIN = 'catalogo_ejercicios_gym_v1_1.xlsx';
const BACKUP_DIRECTORY = '/home/rodaja/gymbro-ledger-backups';

const groupAliases = new Map([
  ['braquial y braquiorradial', ['Braquial', 'Braquiorradial']],
  ['cuadriceps y gluteo mayor', ['Cuádriceps', 'Glúteo mayor']],
  ['dorsal ancho y espalda media', ['Dorsal ancho', 'Espalda media']],
  ['erectores espinales e isquiosurales', ['Erectores espinales', 'Isquiosurales']],
  ['gluteo mayor y cuadriceps', ['Glúteo mayor', 'Cuádriceps']],
  ['infraespinoso y redondo menor', ['Infraespinoso', 'Redondo menor']],
  ['multifidos', ['Erectores espinales']],
  ['triceps braquial, cabeza larga', ['Tríceps cabeza larga']],
  ['triceps braquial, cabeza lateral', ['Tríceps lateral y medial']],
  ['triceps braquial, cabeza medial', ['Tríceps lateral y medial']],
]);

function fail(message) {
  throw new Error(`Catalog append rejected: ${message}`);
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

function normalizedLabel(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('en-US');
}

function sqlCaseFold(value) {
  return value.normalize('NFC').toLocaleLowerCase('en-US');
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insertStatement(table, fields, rows, values) {
  return `insert into ${table} (${fields.join(', ')}) values\n${rows.map((row) => `(${values(row).map(sqlLiteral).join(', ')})`).join(',\n')};`;
}

function parseExercises(catalogPath) {
  const workbook = XLSX.readFile(catalogPath, { cellText: true, cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => normalizedLabel(name).startsWith('ejercicios'));
  if (!sheetName) fail('an exercises worksheet is required');
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: false });
  if (!rows.length) fail(`worksheet "${sheetName}" is empty`);
  const headers = Object.keys(rows[0]);
  for (const header of REQUIRED_HEADERS) if (!headers.includes(header)) fail(`worksheet "${sheetName}" is missing header "${header}"`);

  const seenIds = new Set();
  return rows.map((row, rowIndex) => {
    const id = required(row.ID, `row ${rowIndex + 2}.ID`);
    if (seenIds.has(id)) fail(`duplicate exercise ID "${id}"`);
    seenIds.add(id);
    return {
      id,
      canonicalName: required(row['Nombre canónico'], `row ${rowIndex + 2}.Nombre canónico`),
      movementPattern: text(row['Patrón de movimiento']),
      primaryMuscleLabel: required(row['Grupo muscular principal'], `row ${rowIndex + 2}.Grupo muscular principal`),
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
}

function resolveGroupLabels(label) {
  const alias = groupAliases.get(normalizedLabel(label));
  return alias ?? [label];
}

function buildAssociations(exercises) {
  const associations = exercises.flatMap((exercise) => {
    const groups = new Map();
    const add = (label, role, relevance) => {
      for (const groupName of resolveGroupLabels(label)) {
        const key = normalizedLabel(groupName);
        const existing = groups.get(key);
        if (!existing || role === 'Principal') groups.set(key, { groupName, role, relevance, originalLabel: label });
      }
    };
    add(exercise.primaryMuscleLabel, 'Principal', 1);
    for (const label of (exercise.secondaryMuscleLabels ?? '').split(';').map(text).filter(Boolean)) add(label, 'Secundario', 0.5);
    return [...groups.values()].map((group) => ({
      exerciseId: exercise.id,
      ...group,
    }));
  });
  return associations.map((association, index) => ({ ...association, sequence: index + 1 }));
}

function buildSql(exercises, associations) {
  const groupNames = [...new Map(associations.map((association) => [sqlCaseFold(association.groupName), association.groupName])).values()];
  return [
    'begin;',
    'lock table public.exercises, public.exercise_muscle_groups in share row exclusive mode;',
    'create temporary table append_exercises (id text primary key, canonical_name text not null, movement_pattern text, primary_muscle_label text, secondary_muscle_labels text, equipment text, angle_or_plane text, laterality text, body_position text, support_type text, grip text, trajectory_or_modality text, kinetic_chain text, technical_level text, notes text) on commit drop;',
    insertStatement('append_exercises', ['id', 'canonical_name', 'movement_pattern', 'primary_muscle_label', 'secondary_muscle_labels', 'equipment', 'angle_or_plane', 'laterality', 'body_position', 'support_type', 'grip', 'trajectory_or_modality', 'kinetic_chain', 'technical_level', 'notes'], exercises, (row) => [row.id, row.canonicalName, row.movementPattern, row.primaryMuscleLabel, row.secondaryMuscleLabels, row.equipment, row.angleOrPlane, row.laterality, row.bodyPosition, row.supportType, row.grip, row.trajectoryOrModality, row.kineticChain, row.technicalLevel, row.notes]),
    'create temporary table append_associations (sequence integer primary key, exercise_id text not null, muscle_group_name text not null, role text not null, relevance numeric not null, original_label text not null) on commit drop;',
    insertStatement('append_associations', ['sequence', 'exercise_id', 'muscle_group_name', 'role', 'relevance', 'original_label'], associations, (row) => [row.sequence, row.exerciseId, row.groupName, row.role, row.relevance, row.originalLabel]),
    `do $$ begin
      if exists (select 1 from append_exercises input join public.exercises existing using (id)) then raise exception 'one or more exercise IDs already exist'; end if;
      if exists (select 1 from append_associations input left join public.muscle_groups groups on lower(groups.name) = lower(input.muscle_group_name) where groups.id is null) then raise exception 'one or more muscle group labels do not exist'; end if;
      if (select count(*) from public.muscle_groups where lower(name) in (${groupNames.map((name) => sqlLiteral(sqlCaseFold(name))).join(', ')})) <> ${groupNames.length} then raise exception 'one or more muscle group labels are ambiguous'; end if;
      if (select coalesce(max(substring(id from 4)::integer), 0) from public.exercise_muscle_groups) + ${associations.length} > 99999 then raise exception 'association ID range is exhausted'; end if;
    end $$;`,
    'insert into public.exercises (id, canonical_name, movement_pattern, primary_muscle_label, secondary_muscle_labels, equipment, angle_or_plane, laterality, body_position, support_type, grip, trajectory_or_modality, kinetic_chain, technical_level, notes) select id, canonical_name, movement_pattern, primary_muscle_label, secondary_muscle_labels, equipment, angle_or_plane, laterality, body_position, support_type, grip, trajectory_or_modality, kinetic_chain, technical_level, notes from append_exercises;',
    `insert into public.exercise_muscle_groups (id, exercise_id, muscle_group_id, role, relevance, original_label, source_origin)
      select format('EM-%s', lpad(((select coalesce(max(substring(id from 4)::integer), 0) from public.exercise_muscle_groups) + input.sequence)::text, 5, '0')), input.exercise_id, groups.id, input.role, input.relevance, input.original_label, ${sqlLiteral(SOURCE_ORIGIN)}
      from append_associations input
      join public.muscle_groups groups on lower(groups.name) = lower(input.muscle_group_name);`,
    `do $$ declare report jsonb; begin
      if (select count(*) from public.exercises where id in (select id from append_exercises)) <> ${exercises.length} then raise exception 'exercise insert count mismatch'; end if;
      if (select count(*) from public.exercise_muscle_groups where exercise_id in (select id from append_exercises)) <> ${associations.length} then raise exception 'association insert count mismatch'; end if;
      select public.catalog_integrity_report() into report;
      if (report ->> 'exercises_without_primary')::int <> 0 or (report ->> 'exercises_without_muscles')::int <> 0 then raise exception 'post-import catalog integrity check failed'; end if;
    end $$;`,
    'select public.catalog_integrity_report() as report;',
    'commit;',
  ].join('\n');
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function main() {
  const [catalogPath, ...flags] = process.argv.slice(2);
  if (!catalogPath) fail('usage: npm run catalog:append -- <catalog.xlsx> [--dry-run]');
  if (!existsSync(catalogPath)) fail(`catalog workbook does not exist: ${catalogPath}`);
  const exercises = parseExercises(catalogPath);
  const associations = buildAssociations(exercises);
  const sql = buildSql(exercises, associations);
  if (flags.includes('--dry-run')) {
    console.log(JSON.stringify({ event: 'catalog_append_validated', exercises: exercises.length, associations: associations.length, source: path.resolve(catalogPath) }, null, 2));
    return;
  }
  if (flags.length) fail(`unknown option: ${flags.join(' ')}`);
  if (!existsSync(BACKUP_DIRECTORY)) fail(`backup directory does not exist: ${BACKUP_DIRECTORY}`);
  const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
  const backupPath = path.join(BACKUP_DIRECTORY, `gymbro-public-before-catalog-append-${timestamp}.sql`);
  await run('npx', ['supabase', 'db', 'dump', '--linked', '--schema', 'public', '--data-only', '--file', backupPath]);
  await run('npx', ['supabase', 'db', 'query', '--linked', sql]);
  console.log(JSON.stringify({ event: 'catalog_append_completed', source: path.resolve(catalogPath), backup: backupPath, imported: { exercises: exercises.length, associations: associations.length } }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ event: 'catalog_append_failed', error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
