import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Local-only integration harness. Clone schema, never data; drop only our unique DB.
const container = 'supabase_db_gymbro';
const database = `gymbro_records_test_${randomUUID().replaceAll('-', '')}`;
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
  const schema = docker('exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only');
  execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1'], { env: dockerEnv, input: schema, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const client = await connect();
  if (!process.argv.includes('--baseline')) await client.query(readFileSync(new URL('../supabase/migrations/20260910200000_contextual_record_gems.sql', import.meta.url), 'utf8'));
  await client.query('create extension if not exists pgtap with schema extensions; set search_path = public, extensions');
  const results = await client.query(readFileSync(new URL('../supabase/tests/contextual_record_gems.sql', import.meta.url), 'utf8'));
  const tap = [results].flat().flatMap(({rows}) => rows.flatMap(Object.values)).filter((value) => typeof value === 'string');
  assert.deepEqual(tap.filter((line) => /^not ok /m.test(line)), [], 'No failed SQL assertions');
  assert.equal(tap.filter((line) => /^ok [0-9]+/m.test(line)).length, 25);
  console.log('PASS: 25 SQL assertions; transaction rolled back.');
  // Real concurrent finalization: replayed attempt IDs and distinct tied attempts.
  const owner = randomUUID();
  await client.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'',now(),'{}','{}',now(),now())`, [owner, `${owner}@test.invalid`]);
  await client.query('insert into public.profiles(id,alias) values($1,$2)', [owner,'Concurrent records']);
  const make = (id, load, date) => ({version:1,id,owner,routineId:'r',recordedRoutineName:'Records',completedAt:date,durationSeconds:60,restTimerSeconds:30,
    exercises:[{exerciseId:'e',variant:'Barra',recordedName:'Press',sets:[{plan:{id:'s',type:1},result:{setId:'s',performed:true,performance:{mode:'external-load',unit:'kg',load,reps:8}}}]}],completion:{},reward:{},rewardApplication:{}});
  const a = await connect(), b = await connect();
  for (const connection of [a,b]) { await connection.query('set role authenticated'); await connection.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]); }
  const finalize = (connection, attempt) => connection.query('select public.finalize_training_attempt($1)',[attempt]);
  await finalize(a,make('base',20,'2026-09-01T12:00:00Z'));
  await Promise.all([a,b].map((connection)=>finalize(connection,make('same',25,'2026-09-02T12:00:00Z'))));
  assert.equal(Number((await client.query("select sum(amount) total from public.reward_ledger_entries where owner_id=$1 and kind='contextual_record'",[owner])).rows[0].total),50);
  await Promise.all([a,b].map((connection,index)=>finalize(connection,make(`tie-${index}`,30,'2026-09-03T12:00:00Z'))));
  assert.equal(Number((await client.query("select sum(amount) total from public.reward_ledger_entries where owner_id=$1 and kind='contextual_record'",[owner])).rows[0].total),100);
  console.log('PASS: concurrent same-ID retries award once; distinct tied attempts cannot duplicate rewards.');
 } finally {
  await Promise.allSettled(clients.map((client) => client.end()));
  if (created) { docker('exec',container,'dropdb','-U','postgres','--force',database); console.log('Dropped isolated test database.'); }
}
