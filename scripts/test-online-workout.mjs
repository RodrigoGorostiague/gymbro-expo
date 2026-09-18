import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Local-only integration harness. Clone schema, never data; drop only our unique DB.
const container = 'supabase_db_gymbro';
const database = `gymbro_online_test_${randomUUID().replaceAll('-', '')}`;
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
  if (!(await client.query("select to_regprocedure('public.claim_online_workout(jsonb)') as fn")).rows[0].fn) {
    await client.query(readFileSync(new URL('../supabase/migrations/20260911010000_online_workout_handoff.sql', import.meta.url), 'utf8'));
  }
  await client.query('create extension if not exists pgtap with schema extensions; set search_path = public, extensions');
  const results = await client.query(readFileSync(new URL('../supabase/tests/online_workout_handoff.sql', import.meta.url), 'utf8'));
  const tap = [results].flat().flatMap(({rows}) => rows.flatMap(Object.values)).filter((value) => typeof value === 'string');
  assert.deepEqual(tap.filter((line) => /^not ok /m.test(line)), [], 'No failed SQL assertions');
  assert.equal(tap.filter((line) => /^ok [0-9]+/m.test(line)).length, 40);
  console.log('PASS: 40 SQL assertions; transaction rolled back.');
  // Two concurrent CAS requests with the same base: exactly one wins.
  const owner = randomUUID();
  await client.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'',now(),'{}','{}',now(),now());`,[owner, `${owner}@test.invalid`]);
  await client.query('insert into public.profiles(id,alias) values($1,$2)',[owner,'Concurrent offline']);
  const initial = {version:1,owner,attemptId:'concurrent',routineId:'r',startedAtMs:1,restTimerSeconds:30,completedSets:{},setValues:{},routineSnapshot:{id:'r',name:'Concurrent',exercises:[]}};
  const base = {...initial,transportMode:'online'};
  await client.query(`insert into public.training_states(owner_id,active_workout_draft) values($1,$2)`,[owner,initial]);
  const a = await connect(), b = await connect();
  for (const c of [a,b]) { await c.query('set role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]); }
  await a.query('select public.claim_online_workout($1)',[initial]);
  const result = await Promise.all([a,b].map((c,i) => c.query('select public.sync_online_workout($1,$2) as result',[base,{...base,restTimerSeconds:40+i}])));
  assert.deepEqual(result.map((r) => r.rows[0].result.status).sort(), ['conflict','saved']);
  console.log('PASS: concurrent same-base CAS has one winner and one retained conflict.');
  const stored = (await a.query('select public.load_training_state() as state')).rows[0].state.activeWorkoutDraft;
  await a.query('select public.sync_online_workout($1,null)',[stored]);
  const next = {...initial,attemptId:'successor'};
  await a.query('select public.start_training_workout($1)',[next]);
  await b.query('select public.sync_online_workout($1,null)',[stored]);
  assert.equal((await b.query('select public.load_training_state() as state')).rows[0].state.activeWorkoutDraft.attemptId,'successor');
  console.log('PASS: cancellation retry from second connection preserves successor session.');
  for (const file of ['offline_workout.sql','training_workout_handoff.sql','contextual_record_gems.sql','joint_workout_recovery.sql']) {
    await client.query('reset role; set search_path=public,extensions');
    const results = await client.query(readFileSync(new URL(`../supabase/tests/${file}`, import.meta.url),'utf8'));
    const lines = [results].flat().flatMap(({rows})=>rows.flatMap(Object.values)).filter(value=>typeof value==='string');
    assert.deepEqual(lines.filter(line=>/^not ok /m.test(line)), [], `Regression suite ${file}`);
    console.log(`PASS: ${file} (${lines.filter(line=>/^ok [0-9]+/m.test(line)).length} assertions)`);
  }
} finally {
  await Promise.all(clients.map((client) => client.end()));
  if (created) { docker('exec',container,'dropdb','-U','postgres','--force',database); console.log('Dropped isolated test database.'); }
}
