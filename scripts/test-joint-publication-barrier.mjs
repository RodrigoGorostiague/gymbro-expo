import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Clone local schema only. Never change the source database or production.
const container = 'supabase_db_gymbro';
const database = `gymbro_barrier_test_${randomUUID().replaceAll('-', '')}`;
const env = { ...process.env, DOCKER_HOST: 'unix:///var/run/docker.sock' }; delete env.DOCKER_CONTEXT;
const docker = (...args) => execFileSync('docker', args, { env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const password = JSON.parse(docker('inspect', '--format', '{{json .Config.Env}}', container)).find(x => x.startsWith('POSTGRES_PASSWORD=')).slice(18);
const clients = []; let created = false;
async function connect() { const c = new pg.Client({ host: '127.0.0.1', port: 54322, user: 'postgres', password, database, statement_timeout: 15000 }); await c.connect(); clients.push(c); return c; }
const routine = {name:'Upper',muscleGroups:['back'],exercises:[{name:'Row',muscleGroups:['back'],loadMode:'external-load',loadUnit:'kg',variant:'barbell',sets:[{tipo:1,weight:80,reps:8,effortTarget:{kind:'rir',value:2},backoffGroup:0}]}]};
const result = {routineName:'Upper',durationSeconds:90000,sharePayload:{version:1,routine},exercises:[{name:'Row',muscleGroupIds:['back'],sets:[{weight:80,reps:8,completed:true}]}]};
try {
  docker('exec', container, 'createdb', '-U', 'postgres', database); created = true;
  const schema = docker('exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only');
  execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1'], {env, input:schema, encoding:'utf8', maxBuffer:32*1024*1024});
  const db = await connect();
  for (const file of ['20260911020000_rich_joint_routine_templates.sql','20260911120000_joint_publication_barrier.sql']) await db.query(readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
  await db.query('create extension if not exists pgtap with schema extensions; set search_path = public, extensions');
  for (const file of ['joint_workouts.sql', 'joint_workout_recovery.sql', 'rich_joint_routine_templates.sql']) {
    const response = await db.query(readFileSync(new URL(`../supabase/tests/${file}`,import.meta.url),'utf8'));
    const lines = [response].flat().flatMap(({rows}) => rows.flatMap(Object.values)).filter(x => typeof x === 'string');
    assert.deepEqual(lines.filter(x => /^not ok /m.test(x)),[],`SQL regression ${file}`);
    console.log(`PASS: ${file} (${lines.filter(x => /^ok /m.test(x)).length} assertions)`);
  }
  const owners = Array.from({length:4}, () => randomUUID());
  for (const id of owners) { await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'',now(),'{}','{}',now(),now())`,[id,`${id}@test.invalid`]); await db.query('insert into public.profiles(id,alias) values($1,$2)',[id,`Test ${id.slice(0,8)}`]); }
  const actor = async id => { const c = await connect(); await c.query('set role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); return c; };
  const [a,b] = await Promise.all(owners.slice(0,2).map(actor));
  const group = async (statuses=['active','active']) => {const id=randomUUID(); await db.query('insert into public.joint_workouts(id,initiator_id,suggested_routine) values($1,$2,$3)',[id,owners[0],routine]);for(const [i,status] of statuses.entries()) await db.query("insert into public.joint_workout_participants(joint_workout_id,participant_id,status,joined_at) values($1,$2,$3::public.joint_workout_participant_status,case when $3::text='invited' then null else now() end)",[id,owners[i],status]);return id;};
  const finish = (c,id) => c.query("select public.finish_joint_workout($1,'private',$2)",[id,result]);
  const posts = async id => +(await db.query('select count(*) from public.joint_workout_posts where joint_workout_id=$1',[id])).rows[0].count;
  const id = await group(['active','active','invited']);
  await finish(a,id); assert.equal(await posts(id),0);
  assert.equal((await a.query('select public.get_joint_workout_publication_status($1) as s',[id])).rows[0].s.state,'waiting');
  await finish(b,id); assert.equal(await posts(id),1);
  assert.equal((await a.query('select public.get_joint_workout_detail($1) as s',[id])).rows[0].s.participants.length,2);
  await Promise.all([finish(a,id),finish(b,id)]); assert.equal(await posts(id),1);
  await db.query('delete from public.joint_workout_posts where joint_workout_id=$1',[id]); await finish(a,id); assert.equal(await posts(id),1);
  console.log('PASS: first waits; last publishes once; declined invitation omitted; lost response retry repairs missing post.');
  const versioned = await group();
  const versionedFinish = (c,owner,workout) => c.query("select public.finish_joint_workout_attempt_with_status($1,'captured-attempt',$2,'private',$3) as s",[owner,workout,result]);
  const waiting = (await versionedFinish(a,owners[0],versioned)).rows[0].s;
  assert.equal(waiting.state,'waiting'); assert.equal(waiting.waiting_count,1); assert.equal(waiting.workout_id,versioned); assert.ok(Number.isFinite(Date.parse(waiting.expires_at)));
  const published = (await versionedFinish(b,owners[1],versioned)).rows[0].s;
  assert.equal(published.state,'published'); assert.equal(published.waiting_count,0); assert.equal(await posts(versioned),1);
  assert.equal((await versionedFinish(a,owners[0],versioned)).rows[0].s.state,'published');
  await assert.rejects(versionedFinish(a,owners[1],versioned),/owner mismatch/);
  console.log('PASS: versioned finish endpoint returns waiting/published metadata, retries safely and rejects owner mismatch.');
  const expiryRace=await group(); await finish(a,expiryRace);
  await db.query("update public.joint_workouts set created_at=now()-interval '24 hours' where id=$1",[expiryRace]);
  await Promise.all([versionedFinish(b,owners[1],expiryRace),db.query('select public.reconcile_joint_workout_publications()')]);
  assert.equal(await posts(expiryRace),1);
  const raced=(await db.query('select status,completed_workout from public.joint_workout_participants where joint_workout_id=$1 and participant_id=$2',[expiryRace,owners[1]])).rows[0];
  assert.equal(raced.status,'completed'); assert.deepEqual(raced.completed_workout,result);
  console.log('PASS: concurrent member finish and expiry reconciler retain the result and one publication.');
  const cancel=await group(); await finish(a,cancel); await b.query('select public.leave_joint_workout($1)',[cancel]); assert.equal(await posts(cancel),1);
  const allCancel=await group(); await a.query('select public.leave_joint_workout($1)',[allCancel]);await b.query('select public.leave_joint_workout($1)',[allCancel]); assert.equal(await posts(allCancel),1);
  const detail=(await a.query('select public.get_joint_workout_detail($1) as s',[allCancel])).rows[0].s;assert.equal(detail.participants.length,2);assert.ok(detail.participants.every(p=>p.terminal_reason==='cancelled'));
  const expired=await group();await finish(a,expired);await db.query("update public.joint_workouts set created_at=now()-interval '25 hours' where id=$1",[expired]);await db.query('select public.reconcile_joint_workout_publications()');assert.equal(await posts(expired),1);
  assert.equal((await db.query('select terminal_reason from public.joint_workout_participants where joint_workout_id=$1 and participant_id=$2',[expired,owners[1]])).rows[0].terminal_reason,'expired');
  await finish(b,expired);assert.equal(await posts(expired),1);assert.equal((await db.query('select status from public.joint_workout_participants where joint_workout_id=$1 and participant_id=$2',[expired,owners[1]])).rows[0].status,'completed');
  console.log('PASS: cancel, all-cancel, server expiry without clients and late durable payload preserve one post and membership.');
  const concurrent=await group();await Promise.all([finish(a,concurrent),finish(b,concurrent)]);assert.equal(await posts(concurrent),1);
  const hidden=await group();await db.query('insert into public.joint_workout_posts(joint_workout_id) values($1)',[hidden]);assert.ok(!(await a.query('select public.list_joint_workout_posts() as p')).rows[0].p.some(p=>p.id===hidden));
  await assert.rejects(a.query('select public.reconcile_joint_workout_publications()'),/permission denied/);
  const outsider=await actor(owners[3]);await assert.rejects(outsider.query('select public.get_joint_workout_publication_status($1)',[id]),/unavailable/);
  console.log('PASS: concurrent finalizers, hidden legacy partial posts, scheduler privilege and status authorization.');
  const source = await group(); await finish(a,source);
  const destination = await group(['invited','invited','active']);
  await db.query("insert into public.workout_start_activities(author_id,routine_name,joint_workout_id,expires_at) values($1,'Upper',$2,now()+interval '1 hour')",[owners[1],source]);
  await assert.rejects(b.query('select public.respond_joint_workout_invite($1,true)',[destination]),/membership frozen/);
  assert.equal((await db.query('select status from public.joint_workout_participants where joint_workout_id=$1 and participant_id=$2',[source,owners[1]])).rows[0].status,'active');
  assert.equal((await db.query('select status from public.joint_workout_participants where joint_workout_id=$1 and participant_id=$2',[destination,owners[1]])).rows[0].status,'invited');
  const boundary=await group(); await db.query("update public.joint_workouts set created_at=now()-interval '23 hours 59 minutes' where id=$1",[boundary]);
  await db.query('select public.reconcile_joint_workout_publications()');assert.equal(await posts(boundary),0);
  await db.query("update public.joint_workouts set created_at=now()-interval '24 hours' where id=$1",[boundary]);
  await db.query('select public.reconcile_joint_workout_publications()');assert.equal(await posts(boundary),1);
  await db.query('select public.reconcile_joint_workout_publications()');assert.equal(await posts(boundary),1);
  console.log('PASS: completed source merge rejected atomically; exact 24-hour boundary; repeated scheduler reconciliation is idempotent.');

} finally {
  await Promise.all(clients.map(c=>c.end()));
  if(created)docker('exec',container,'dropdb','-U','postgres','--force',database);
}
