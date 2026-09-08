import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

// Local-only integration harness. Clone schema, never data; drop only our unique DB.
const container = 'supabase_db_gymbro';
const database = `gymbro_copy_test_${randomUUID().replaceAll('-', '')}`;
const dockerEnv = { ...process.env, DOCKER_HOST: 'unix:///var/run/docker.sock' };
delete dockerEnv.DOCKER_CONTEXT;
const docker = (...args) => execFileSync('docker', args, { env: dockerEnv, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--migration'), 'Usage: node scripts/test-plan-publication-concurrency.mjs [--migration file.sql]');
const environment = JSON.parse(docker('inspect', '--format', '{{json .Config.Env}}', container));
const password = environment.find((entry) => entry.startsWith('POSTGRES_PASSWORD='))?.slice('POSTGRES_PASSWORD='.length);
assert.ok(password, 'Local container must expose its configured PostgreSQL password');
const connection = { host: '127.0.0.1', port: 54322, user: 'postgres', password, database, connectionTimeoutMillis: 5_000, statement_timeout: 15_000 };
const owner = randomUUID();
const recipient = randomUUID();
const gate = 820260908;
const clients = [];
let created = false;
let coordinator;
let pending = [];

async function connect(application_name) {
  const client = new pg.Client({ ...connection, application_name });
  await client.connect();
  clients.push(client);
  return client;
}

try {
  docker('exec', container, 'createdb', '-U', 'postgres', database);
  created = true;
  console.log(`Isolated local test database: ${database}`);
  const schema = docker('exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only');
  execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1'], {
    env: dockerEnv, input: schema, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  coordinator = await connect('copy-test-coordinator');
  if (args.length) await coordinator.query(readFileSync(args[1], 'utf8'));
  // Match the pgTAP runner bootstrap, exclusively inside this disposable DB.
  await coordinator.query('create extension if not exists pgtap with schema extensions; set search_path = public, extensions');
  for (const suite of ['training_library_v2', 'plan_publications', 'web_equipped_presentation']) {
    const result = await coordinator.query(readFileSync(new URL(`../supabase/tests/${suite}.sql`, import.meta.url), 'utf8'));
    const tap = [result].flat().flatMap(({ rows }) => rows.flatMap(Object.values)).filter((value) => typeof value === 'string');
    const failures = tap.filter((line) => /^not ok /m.test(line));
    const plan = tap.find((line) => /^1\.\.\d+$/.test(line));
    const assertions = tap.filter((line) => /^ok \d+/m.test(line));
    assert.deepEqual(failures, [], `${suite} pgTAP failures`);
    assert.ok(plan, `${suite} must declare a test plan`);
    assert.equal(assertions.length, Number(plan.slice(3)), `${suite} must complete every planned assertion`);
    console.log(`PASS: ${suite} (${assertions.length} pgTAP assertions, rolled back).`);
  }
  await coordinator.query(`
    insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      id::text || '@copy-test.invalid', '', now(), '{}', '{}', now(), now()
    from unnest($1::uuid[]) id;
    `, [[owner, recipient]]);
  await coordinator.query('insert into public.profiles(id, alias) values ($1, $3), ($2, $4)', [owner, recipient, 'Copy Author', 'Copy Recipient']);
  const routine = (id) => ({ id, name: id, muscleGroups: ['chest'], createdAt: '2026-09-08T00:00:00Z', exercises: [{ id: `${id}-exercise`, name: 'Press', muscleGroups: ['chest'], sets: [{ id: `${id}-set`, tipo: 1, weight: 80, reps: 8 }] }] });
  await coordinator.query('insert into public.training_libraries(owner_id, routines, mesocycles) values ($1, $2, $3)', [owner, JSON.stringify([routine('copy-a'), routine('copy-b')]), '[]']);
  await coordinator.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
  const publications = [];
  for (const id of ['copy-a', 'copy-b']) {
    const result = await coordinator.query("select public.create_plan_publication('routine', $1, 'community', true) as id", [id]);
    publications.push(result.rows[0].id);
  }
  assert.equal((await coordinator.query('select count(*)::int as n from public.training_libraries where owner_id=$1', [recipient])).rows[0].n, 0, 'Recipient must start without a library row');

  // Both real RPC transactions must reach INSERT before either can proceed.
  // On the old implementation both have already read an absent library here.
  // On the fixed implementation this is the initialize-before-read insertion.
  await coordinator.query(`
    create function public.copy_test_gate() returns trigger language plpgsql as $$
    begin
      if new.owner_id = '${recipient}'::uuid then perform pg_advisory_xact_lock(${gate}); end if;
      return new;
    end; $$;
    create trigger copy_test_gate before insert on public.training_libraries
      for each row execute function public.copy_test_gate();
  `);
  await coordinator.query('select pg_advisory_lock($1)', [gate]);
  const workers = await Promise.all([connect('copy-test-worker-a'), connect('copy-test-worker-b')]);
  pending = workers.map(async (worker, index) => {
    await worker.query('begin');
    try {
      await worker.query('set local role authenticated');
      await worker.query("select set_config('request.jwt.claim.sub', $1, true)", [recipient]);
      const result = await worker.query('select public.copy_plan_publication($1) as receipt', [publications[index]]);
      await worker.query('commit');
      return result.rows[0].receipt;
    } catch (error) {
      await worker.query('rollback');
      throw error;
    }
  });
  // Attach rejection handlers immediately while the coordinator observes the barrier.
  const completed = Promise.allSettled(pending);
  const deadline = Date.now() + 10_000;
  while (true) {
    const { rows } = await coordinator.query("select count(*)::int as n from pg_stat_activity where datname=$1 and application_name like 'copy-test-worker-%' and wait_event='advisory'", [database]);
    if (rows[0].n === 2) break;
    assert.ok(Date.now() < deadline, 'Both RPCs must overlap at the insertion barrier');
    await delay(20);
  }
  await coordinator.query('select pg_advisory_unlock($1)', [gate]);
  const results = await completed;
  for (const result of results) assert.equal(result.status, 'fulfilled', result.reason?.message);
  const receipts = results.map((result) => result.value);
  const { rows: [library] } = await coordinator.query('select routines, routines_revision from public.training_libraries where owner_id=$1', [recipient]);
  assert.equal(library.routines.length, 2, 'Concurrent first copies must preserve BOTH imported routines');
  assert.equal(Number(library.routines_revision), 2, 'Each copy advances the recipient revision once');
  assert.deepEqual(library.routines.map(({ name }) => name).sort(), ['copy-a', 'copy-b']);
  for (const [index, receipt] of receipts.entries()) {
    assert.equal(receipt.routineIds.length, 1);
    assert.equal(receipt.mesocycleId, null);
    const copied = library.routines.find(({ id }) => id === receipt.routineIds[0]);
    assert.ok(copied, 'Every returned receipt must reference a retained import');
    assert.equal(copied.publicationOrigin.publicationId, publications[index]);
    await coordinator.query("select set_config('request.jwt.claim.sub', $1, false)", [recipient]);
    const retried = await coordinator.query('select public.copy_plan_publication($1) as receipt', [publications[index]]);
    assert.deepEqual(retried.rows[0].receipt, receipt, 'Retries preserve the original receipt');
  }
  const { rows: [afterRetry] } = await coordinator.query('select routines, routines_revision from public.training_libraries where owner_id=$1', [recipient]);
  assert.deepEqual(afterRetry, library, 'Retries must neither duplicate imports nor advance revisions');
  console.log('PASS: overlapping first copies preserve both imports, both receipts, provenance, revisions, and idempotent retries.');
} finally {
  if (coordinator) await coordinator.query('select pg_advisory_unlock_all()').catch(() => undefined);
  await Promise.allSettled(pending);
  await Promise.allSettled(clients.map((client) => client.end()));
  if (created) {
    docker('exec', container, 'dropdb', '-U', 'postgres', database);
    console.log(`Removed isolated test database: ${database}`);
  }
}
