import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import pg from 'pg';
import XLSX from 'xlsx';

const { Client } = pg;
const requiredHeaders = {
  exercises: ['ID', 'Nombre canónico', 'Patrón de movimiento', 'Grupo muscular principal', 'Grupos musculares secundarios', 'Implemento', 'Ángulo o plano', 'Lateralidad', 'Posición corporal', 'Tipo de apoyo', 'Agarre', 'Trayectoria o modalidad', 'Cadena cinética', 'Nivel técnico', 'Observaciones'],
  groups: ['ID grupo', 'Nombre canónico', 'ID padre primario', 'Nivel', 'Tipo', 'Visible en filtros', 'Ruta jerárquica'],
  relations: ['ID relación', 'ID padre', 'Grupo padre', 'ID hijo', 'Grupo hijo', 'Tipo de relación', 'Observaciones'],
  associations: ['ID relación', 'ID ejercicio', 'Ejercicio', 'ID grupo muscular', 'Grupo muscular canónico', 'Rol', 'Relevancia', 'Etiqueta original', 'Origen'],
};

function fail(message) {
  throw new Error(`Catalog reset rejected: ${message}`);
}

function text(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).normalize('NFC').trim().replace(/\s+/gu, ' ');
  return normalized || null;
}

function nullableText(value) {
  return text(value);
}

function required(value, context) {
  const normalized = text(value);
  if (!normalized) fail(`${context} is required`);
  return normalized;
}

function number(value, context) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail(`${context} must be numeric`);
  return parsed;
}

function sheetRows(workbook, name, headers) {
  const sheet = workbook.Sheets[name];
  if (!sheet) fail(`missing worksheet "${name}"`);
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  if (rows.length === 0) fail(`worksheet "${name}" is empty`);
  const actualHeaders = Object.keys(rows[0]);
  for (const header of headers) {
    if (!actualHeaders.includes(header)) fail(`worksheet "${name}" is missing header "${header}"`);
  }
  return rows;
}

function assertUnique(rows, key, label) {
  const seen = new Set();
  for (const row of rows) {
    const value = required(row[key], `${label}.${key}`);
    if (seen.has(value)) fail(`duplicate ${label} ID "${value}"`);
    seen.add(value);
  }
}

function assertAcyclic(relations) {
  const children = new Map();
  for (const relation of relations) {
    if (relation.parentId === relation.childId) fail(`self-referencing hierarchy relation "${relation.id}"`);
    const list = children.get(relation.parentId) ?? [];
    list.push(relation.childId);
    children.set(relation.parentId, list);
  }
  const state = new Map();
  const visit = (id) => {
    state.set(id, 'visiting');
    for (const child of children.get(id) ?? []) {
      if (state.get(child) === 'visiting') fail(`hierarchy cycle involving "${child}"`);
      if (!state.has(child)) visit(child);
    }
    state.set(id, 'visited');
  };
  for (const id of children.keys()) if (!state.has(id)) visit(id);
}

function parseWorkbooks(catalogPath, taxonomyPath) {
  const catalog = XLSX.readFile(catalogPath, { cellText: true, cellDates: false });
  const taxonomy = XLSX.readFile(taxonomyPath, { cellText: true, cellDates: false });
  const exercises = sheetRows(catalog, 'Ejercicios', requiredHeaders.exercises).map((row) => ({
    id: required(row.ID, 'Ejercicios.ID'),
    canonicalName: required(row['Nombre canónico'], 'Ejercicios.Nombre canónico'),
    movementPattern: nullableText(row['Patrón de movimiento']),
    primaryMuscleLabel: nullableText(row['Grupo muscular principal']),
    secondaryMuscleLabels: nullableText(row['Grupos musculares secundarios']),
    equipment: nullableText(row.Implemento),
    angleOrPlane: nullableText(row['Ángulo o plano']),
    laterality: nullableText(row.Lateralidad),
    bodyPosition: nullableText(row['Posición corporal']),
    supportType: nullableText(row['Tipo de apoyo']),
    grip: nullableText(row.Agarre),
    trajectoryOrModality: nullableText(row['Trayectoria o modalidad']),
    kineticChain: nullableText(row['Cadena cinética']),
    technicalLevel: nullableText(row['Nivel técnico']),
    notes: nullableText(row.Observaciones),
  }));
  const groups = sheetRows(taxonomy, 'Grupos musculares', requiredHeaders.groups).map((row) => ({
    id: required(row['ID grupo'], 'Grupos musculares.ID grupo'),
    name: required(row['Nombre canónico'], 'Grupos musculares.Nombre canónico'),
    primaryParentId: nullableText(row['ID padre primario']),
    level: number(row.Nivel, 'Grupos musculares.Nivel'),
    type: required(row.Tipo, 'Grupos musculares.Tipo'),
    visibleInFilters: required(row['Visible en filtros'], 'Grupos musculares.Visible en filtros') === 'Sí',
    path: required(row['Ruta jerárquica'], 'Grupos musculares.Ruta jerárquica'),
  }));
  const relations = sheetRows(taxonomy, 'Relaciones jerárquicas', requiredHeaders.relations).map((row) => ({
    id: required(row['ID relación'], 'Relaciones jerárquicas.ID relación'),
    parentId: required(row['ID padre'], 'Relaciones jerárquicas.ID padre'),
    parentName: required(row['Grupo padre'], 'Relaciones jerárquicas.Grupo padre'),
    childId: required(row['ID hijo'], 'Relaciones jerárquicas.ID hijo'),
    childName: required(row['Grupo hijo'], 'Relaciones jerárquicas.Grupo hijo'),
    type: required(row['Tipo de relación'], 'Relaciones jerárquicas.Tipo de relación'),
    notes: nullableText(row.Observaciones),
  }));
  const associations = sheetRows(taxonomy, 'Ejercicio-músculo', requiredHeaders.associations).map((row) => ({
    id: required(row['ID relación'], 'Ejercicio-músculo.ID relación'),
    exerciseId: required(row['ID ejercicio'], 'Ejercicio-músculo.ID ejercicio'),
    exerciseName: required(row.Ejercicio, 'Ejercicio-músculo.Ejercicio'),
    muscleGroupId: required(row['ID grupo muscular'], 'Ejercicio-músculo.ID grupo muscular'),
    muscleGroupName: required(row['Grupo muscular canónico'], 'Ejercicio-músculo.Grupo muscular canónico'),
    role: required(row.Rol, 'Ejercicio-músculo.Rol'),
    relevance: number(row.Relevancia, 'Ejercicio-músculo.Relevancia'),
    originalLabel: required(row['Etiqueta original'], 'Ejercicio-músculo.Etiqueta original'),
    sourceOrigin: required(row.Origen, 'Ejercicio-músculo.Origen'),
  }));

  assertUnique(exercises, 'id', 'exercise');
  assertUnique(groups, 'id', 'muscle group');
  assertUnique(relations, 'id', 'muscle group relation');
  assertUnique(associations, 'id', 'exercise-muscle relation');
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const relationKeys = new Set();
  const associationKeys = new Set();
  for (const group of groups) {
    if (!Number.isInteger(group.level) || group.level < 0) fail(`invalid level for muscle group "${group.id}"`);
    if (group.primaryParentId && !groupById.has(group.primaryParentId)) fail(`unknown primary parent "${group.primaryParentId}" for "${group.id}"`);
  }
  for (const relation of relations) {
    const parent = groupById.get(relation.parentId);
    const child = groupById.get(relation.childId);
    if (!parent || !child) fail(`unknown hierarchy reference in "${relation.id}"`);
    if (parent.name !== relation.parentName || child.name !== relation.childName) fail(`hierarchy names do not match IDs in "${relation.id}"`);
    const key = `${relation.parentId}\u0000${relation.childId}\u0000${relation.type}`;
    if (relationKeys.has(key)) fail(`duplicate hierarchy relation "${relation.id}"`);
    relationKeys.add(key);
  }
  assertAcyclic(relations);
  for (const association of associations) {
    const exercise = exerciseById.get(association.exerciseId);
    const group = groupById.get(association.muscleGroupId);
    if (!exercise || !group) fail(`unknown exercise or muscle group in association "${association.id}"`);
    if (exercise.canonicalName !== association.exerciseName || group.name !== association.muscleGroupName) fail(`association names do not match IDs in "${association.id}"`);
    if (!['Principal', 'Secundario'].includes(association.role)) fail(`unknown role "${association.role}" in "${association.id}"`);
    if (association.relevance < 0 || association.relevance > 1) fail(`relevance outside [0, 1] in "${association.id}"`);
    const key = `${association.exerciseId}\u0000${association.muscleGroupId}\u0000${association.role}`;
    if (associationKeys.has(key)) fail(`duplicate exercise-muscle association "${association.id}"`);
    associationKeys.add(key);
  }
  for (const exercise of exercises) {
    const linked = associations.filter((association) => association.exerciseId === exercise.id);
    if (linked.length === 0) fail(`exercise "${exercise.id}" has no muscle association`);
    if (!linked.some((association) => association.role === 'Principal')) fail(`exercise "${exercise.id}" has no principal muscle`);
  }
  return { exercises, groups, relations, associations };
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function assertSafeEnvironment() {
  if (process.env.ALLOW_DESTRUCTIVE_CATALOG_RESET !== 'true') fail('ALLOW_DESTRUCTIVE_CATALOG_RESET=true is required');
  if (!['development', 'test'].includes(process.env.CATALOG_RESET_ENV ?? '')) fail('CATALOG_RESET_ENV must be development or test');
  if (!process.env.DATABASE_URL && !process.env.CATALOG_RESET_DOCKER_CONTAINER && process.env.CATALOG_RESET_REMOTE_LINKED !== 'true') fail('DATABASE_URL, CATALOG_RESET_DOCKER_CONTAINER, or CATALOG_RESET_REMOTE_LINKED=true is required');
  if (!process.env.DATABASE_URL) return;
  const url = new URL(process.env.DATABASE_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) fail('DATABASE_URL must target a local database');
}

async function insertRows(client, query, rows, values) {
  for (const row of rows) await client.query(query, values(row));
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insertStatement(table, fields, rows, values) {
  return `insert into ${table} (${fields.join(', ')}) values\n${rows.map((row) => `(${values(row).map(sqlLiteral).join(', ')})`).join(',\n')};`;
}

async function resetThroughDocker(input) {
  const statements = [
    'begin;',
    `select jsonb_build_object('exercise_muscle_groups', (select count(*) from public.exercise_muscle_groups), 'muscle_group_relations', (select count(*) from public.muscle_group_relations), 'exercises', (select count(*) from public.exercises), 'muscle_groups', (select count(*) from public.muscle_groups));`,
    'delete from public.exercise_muscle_groups;',
    'delete from public.muscle_group_relations;',
    'delete from public.exercises;',
    'delete from public.muscle_groups;',
    insertStatement('public.muscle_groups', ['id', 'name', 'type', 'level', 'visible_in_filters', 'display_name', 'path'], input.groups, (row) => [row.id, row.name, row.type, row.level, row.visibleInFilters, row.name, row.path]),
    insertStatement('public.muscle_group_relations', ['id', 'parent_muscle_group_id', 'child_muscle_group_id', 'relation_type', 'notes'], input.relations, (row) => [row.id, row.parentId, row.childId, row.type, row.notes]),
    insertStatement('public.exercises', ['id', 'canonical_name', 'movement_pattern', 'primary_muscle_label', 'secondary_muscle_labels', 'equipment', 'angle_or_plane', 'laterality', 'body_position', 'support_type', 'grip', 'trajectory_or_modality', 'kinetic_chain', 'technical_level', 'notes'], input.exercises, (row) => [row.id, row.canonicalName, row.movementPattern, row.primaryMuscleLabel, row.secondaryMuscleLabels, row.equipment, row.angleOrPlane, row.laterality, row.bodyPosition, row.supportType, row.grip, row.trajectoryOrModality, row.kineticChain, row.technicalLevel, row.notes]),
    insertStatement('public.exercise_muscle_groups', ['id', 'exercise_id', 'muscle_group_id', 'role', 'relevance', 'original_label', 'source_origin'], input.associations, (row) => [row.id, row.exerciseId, row.muscleGroupId, row.role, row.relevance, row.originalLabel, row.sourceOrigin]),
    'select public.catalog_integrity_report();',
    'commit;',
  ];
  const child = spawn('docker', ['exec', '-i', process.env.CATALOG_RESET_DOCKER_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-qAtv', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(statements.join('\n'));
  const output = await new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `docker psql exited with ${code}`)));
  });
  const rows = output.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  if (rows.length !== 2) fail('local Docker import did not return its deletion and integrity reports');
  return { deleted: rows[0], report: rows[1] };
}

function remoteResetSql(input) {
  return [
    'begin;',
    'delete from public.exercise_muscle_groups;',
    'delete from public.muscle_group_relations;',
    'delete from public.exercises;',
    'delete from public.muscle_groups;',
    insertStatement('public.muscle_groups', ['id', 'name', 'type', 'level', 'visible_in_filters', 'display_name', 'path'], input.groups, (row) => [row.id, row.name, row.type, row.level, row.visibleInFilters, row.name, row.path]),
    insertStatement('public.muscle_group_relations', ['id', 'parent_muscle_group_id', 'child_muscle_group_id', 'relation_type', 'notes'], input.relations, (row) => [row.id, row.parentId, row.childId, row.type, row.notes]),
    insertStatement('public.exercises', ['id', 'canonical_name', 'movement_pattern', 'primary_muscle_label', 'secondary_muscle_labels', 'equipment', 'angle_or_plane', 'laterality', 'body_position', 'support_type', 'grip', 'trajectory_or_modality', 'kinetic_chain', 'technical_level', 'notes'], input.exercises, (row) => [row.id, row.canonicalName, row.movementPattern, row.primaryMuscleLabel, row.secondaryMuscleLabels, row.equipment, row.angleOrPlane, row.laterality, row.bodyPosition, row.supportType, row.grip, row.trajectoryOrModality, row.kineticChain, row.technicalLevel, row.notes]),
    insertStatement('public.exercise_muscle_groups', ['id', 'exercise_id', 'muscle_group_id', 'role', 'relevance', 'original_label', 'source_origin'], input.associations, (row) => [row.id, row.exerciseId, row.muscleGroupId, row.role, row.relevance, row.originalLabel, row.sourceOrigin]),
    `do $$ declare report jsonb; begin select public.catalog_integrity_report() into report;
      if (report ->> 'exercises')::int <> ${input.exercises.length} or (report ->> 'muscle_groups')::int <> ${input.groups.length} or (report ->> 'muscle_group_relations')::int <> ${input.relations.length} or (report ->> 'exercise_muscle_groups')::int <> ${input.associations.length} or (report ->> 'exercises_without_primary')::int <> 0 or (report ->> 'exercises_without_muscles')::int <> 0 then raise exception 'post-import catalog integrity check failed'; end if;
    end $$;`,
    'commit;',
  ].join('\n');
}

async function queryLinkedRemote(sql) {
  const child = spawn('npx', ['supabase', 'db', 'query', '--linked', sql], { stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || stdout.trim() || `remote query exited with ${code}`)));
  });
}

async function main() {
  assertSafeEnvironment();
  const [catalogPath, taxonomyPath] = process.argv.slice(2);
  if (!catalogPath || !taxonomyPath) fail('usage: npm run catalog:reset -- <catalog.xlsx> <taxonomy.xlsx>');
  const input = parseWorkbooks(catalogPath, taxonomyPath);
  const startedAt = new Date().toISOString();
  const expected = { exercises: input.exercises.length, muscle_groups: input.groups.length, muscle_group_relations: input.relations.length, exercise_muscle_groups: input.associations.length };
  if (process.env.CATALOG_RESET_REMOTE_LINKED === 'true') {
    try {
      await queryLinkedRemote(remoteResetSql(input));
      const remoteReport = await queryLinkedRemote('select public.catalog_integrity_report() as report;');
      console.log(JSON.stringify({ event: 'catalog_reset_completed', target: 'linked_remote', environment: process.env.CATALOG_RESET_ENV, started_at: startedAt, completed_at: new Date().toISOString(), source: { catalog: { path: path.resolve(catalogPath), sha256: await sha256(catalogPath) }, taxonomy: { path: path.resolve(taxonomyPath), sha256: await sha256(taxonomyPath) } }, imported: expected, remote_report: remoteReport.trim() }, null, 2));
      return;
    } catch (error) {
      console.error(JSON.stringify({ event: 'catalog_reset_failed', target: 'linked_remote', environment: process.env.CATALOG_RESET_ENV, error: error instanceof Error ? error.message : String(error) }));
      throw error;
    }
  }
  if (process.env.CATALOG_RESET_DOCKER_CONTAINER) {
    try {
      const { deleted, report } = await resetThroughDocker(input);
      for (const [key, count] of Object.entries(expected)) if (report[key] !== count) fail(`post-import count mismatch for ${key}`);
      if (report.exercises_without_primary !== 0 || report.exercises_without_muscles !== 0) fail('post-import integrity check failed');
      console.log(JSON.stringify({ event: 'catalog_reset_completed', environment: process.env.CATALOG_RESET_ENV, started_at: startedAt, completed_at: new Date().toISOString(), source: { catalog: { path: path.resolve(catalogPath), sha256: await sha256(catalogPath) }, taxonomy: { path: path.resolve(taxonomyPath), sha256: await sha256(taxonomyPath) } }, deleted, imported: expected, report }, null, 2));
      return;
    } catch (error) {
      console.error(JSON.stringify({ event: 'catalog_reset_failed', environment: process.env.CATALOG_RESET_ENV, error: error instanceof Error ? error.message : String(error) }));
      throw error;
    }
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query('begin');
    const deleted = await client.query(`
      with associations as (delete from public.exercise_muscle_groups returning 1),
      relations as (delete from public.muscle_group_relations returning 1),
      exercises as (delete from public.exercises returning 1),
      groups as (delete from public.muscle_groups returning 1)
      select (select count(*) from associations)::int as exercise_muscle_groups,
        (select count(*) from relations)::int as muscle_group_relations,
        (select count(*) from exercises)::int as exercises,
        (select count(*) from groups)::int as muscle_groups
    `);
    await insertRows(client, `insert into public.muscle_groups (id, name, type, level, visible_in_filters, display_name, path) values ($1, $2, $3, $4, $5, $6, $7)`, input.groups, (row) => [row.id, row.name, row.type, row.level, row.visibleInFilters, row.name, row.path]);
    await insertRows(client, `insert into public.muscle_group_relations (id, parent_muscle_group_id, child_muscle_group_id, relation_type, notes) values ($1, $2, $3, $4, $5)`, input.relations, (row) => [row.id, row.parentId, row.childId, row.type, row.notes]);
    await insertRows(client, `insert into public.exercises (id, canonical_name, movement_pattern, primary_muscle_label, secondary_muscle_labels, equipment, angle_or_plane, laterality, body_position, support_type, grip, trajectory_or_modality, kinetic_chain, technical_level, notes) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`, input.exercises, (row) => [row.id, row.canonicalName, row.movementPattern, row.primaryMuscleLabel, row.secondaryMuscleLabels, row.equipment, row.angleOrPlane, row.laterality, row.bodyPosition, row.supportType, row.grip, row.trajectoryOrModality, row.kineticChain, row.technicalLevel, row.notes]);
    await insertRows(client, `insert into public.exercise_muscle_groups (id, exercise_id, muscle_group_id, role, relevance, original_label, source_origin) values ($1, $2, $3, $4, $5, $6, $7)`, input.associations, (row) => [row.id, row.exerciseId, row.muscleGroupId, row.role, row.relevance, row.originalLabel, row.sourceOrigin]);
    const report = await client.query('select public.catalog_integrity_report() as report');
    for (const [key, count] of Object.entries(expected)) if (report.rows[0].report[key] !== count) fail(`post-import count mismatch for ${key}`);
    if (report.rows[0].report.exercises_without_primary !== 0 || report.rows[0].report.exercises_without_muscles !== 0) fail('post-import integrity check failed');
    await client.query('commit');
    console.log(JSON.stringify({ event: 'catalog_reset_completed', environment: process.env.CATALOG_RESET_ENV, started_at: startedAt, completed_at: new Date().toISOString(), source: { catalog: { path: path.resolve(catalogPath), sha256: await sha256(catalogPath) }, taxonomy: { path: path.resolve(taxonomyPath), sha256: await sha256(taxonomyPath) } }, deleted: deleted.rows[0], imported: expected, report: report.rows[0].report }, null, 2));
  } catch (error) {
    await client.query('rollback');
    console.error(JSON.stringify({ event: 'catalog_reset_failed', environment: process.env.CATALOG_RESET_ENV, error: error instanceof Error ? error.message : String(error) }));
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ event: 'catalog_reset_failed', error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
