import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Local-only integration harness. Clone schema, never data; drop only our unique DB.
const container = 'supabase_db_gymbro';
const database = `gymbro_review_test_${randomUUID().replaceAll('-', '')}`;
const dockerEnv = { ...process.env, DOCKER_HOST: 'unix:///var/run/docker.sock' };
delete dockerEnv.DOCKER_CONTEXT;
const docker = (...args) => execFileSync('docker', args, { env: dockerEnv, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const environment = JSON.parse(docker('inspect', '--format', '{{json .Config.Env}}', container));
const password = environment.find((entry) => entry.startsWith('POSTGRES_PASSWORD='))?.slice('POSTGRES_PASSWORD='.length);
assert.ok(password, 'Local container password required');
let created = false;
const clients = [];
async function connect() {
  const client = new pg.Client({ host: '127.0.0.1', port: 54322, user: 'postgres', password, database, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  await client.connect(); clients.push(client); return client;
}
try {
  docker('exec', container, 'createdb', '-U', 'postgres', database); created = true;
  console.log(`Isolated local database: ${database}`);
  const schema = docker('exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--exclude-schema=cron').replace(/^.*(?:CREATE EXTENSION|COMMENT ON EXTENSION).*pg_cron.*$/gm, '').replace(/^(?:GRANT|REVOKE).*\bcron(?:[.;]|\s).*$/gm, '');
  execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1'], { env: dockerEnv, input: schema, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const client = await connect();
  const installed = await client.query("select to_regclass('private.workout_completion_reviews') is not null as installed");
  if (!installed.rows[0].installed) await client.query(readFileSync(new URL('../supabase/migrations/20260917140000_workout_publication_review.sql', import.meta.url), 'utf8'));
  await client.query('create extension if not exists pgtap with schema extensions; set search_path = public, extensions');
  const results = await client.query(readFileSync(new URL('../supabase/tests/workout_publication_review.sql', import.meta.url), 'utf8'));
  const tap = [results].flat().flatMap(({rows}) => rows.flatMap(Object.values)).filter((value) => typeof value === 'string');
  assert.deepEqual(tap.filter((line) => /^not ok /m.test(line)), [], 'No failed SQL assertions');
  assert.equal(tap.filter((line) => /^ok [0-9]+/m.test(line)).length, 30);
  console.log('PASS: 30 SQL assertions; transaction rolled back.');
 } finally {
  await Promise.allSettled(clients.map((client) => client.end()));
  if (created) { docker('exec',container,'dropdb','-U','postgres','--force',database); console.log('Dropped isolated test database.'); }
}
