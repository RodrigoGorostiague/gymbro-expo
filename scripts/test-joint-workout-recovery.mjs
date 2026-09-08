import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

// Local-only integration harness. Clone schema, never data; drop only our unique DB.
const container = 'supabase_db_gymbro';
const database = `gymbro_joint_test_${randomUUID().replaceAll('-', '')}`;
const dockerEnv = { ...process.env, DOCKER_HOST: 'unix:///var/run/docker.sock' };
delete dockerEnv.DOCKER_CONTEXT;
const docker = (...args) => execFileSync('docker', args, { env: dockerEnv, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--migration'), 'Usage: node scripts/test-joint-workout-recovery.mjs [--migration file.sql]');
const environment = JSON.parse(docker('inspect', '--format', '{{json .Config.Env}}', container));
const password = environment.find((entry) => entry.startsWith('POSTGRES_PASSWORD='))?.slice('POSTGRES_PASSWORD='.length);
assert.ok(password, 'Local container must expose its configured PostgreSQL password');
const connection = { host: '127.0.0.1', port: 54322, user: 'postgres', password, database, connectionTimeoutMillis: 5_000, statement_timeout: 15_000 };
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
  if (args.length) {
    const routine = {name:'Upper',muscleGroups:['back'],exercises:[{name:'Row',muscleGroups:['back'],loadMode:'external-load',loadUnit:'kg',variant:'barbell',sets:[{tipo:1,weight:80,reps:8}]}]};
    const legacyOwners=[randomUUID(),randomUUID()];
    for (const [index, owner] of legacyOwners.entries()) {
      const group=randomUUID();
      await coordinator.query('insert into auth.users(id) values($1)',[owner]);
      await coordinator.query('insert into public.profiles(id,alias) values($1,$2)',[owner,`Legacy ${index}`]);
      await coordinator.query('insert into public.joint_workouts(id,initiator_id,suggested_routine) values($1,$2,$3)',[group,owner,routine]);
      await coordinator.query("insert into public.joint_workout_participants(joint_workout_id,participant_id,status,joined_at) values($1,$2,'active',now())",[group,owner]);
      await coordinator.query('insert into public.training_states(owner_id,active_workout_draft) values($1,$2)',[owner,{version:1,owner,attemptId:`legacy-${index}`,routineId:'routine',jointWorkoutId:group,startedAtMs:Date.now(),restTimerSeconds:90,completedSets:{},setValues:{}}]);
      await coordinator.query("insert into public.workout_start_activities(author_id,routine_name,joint_workout_id,expires_at) values($1,'Upper',$2,now()+interval '1 hour')",[owner,group]);
      if(index===1) await coordinator.query("insert into public.workout_start_activities(author_id,routine_name,joint_workout_id,expires_at,closed_at) values($1,'Upper',$2,now()+interval '1 hour',now())",[owner,group]);
    }
    await coordinator.query(readFileSync(args[1], 'utf8'));
    const bound=await coordinator.query('select author_id,attempt_id from public.workout_start_activities where author_id=any($1::uuid[])',[legacyOwners]);
    assert.equal(bound.rows.find(row=>row.author_id===legacyOwners[0]).attempt_id,'legacy-0');
    assert.ok(bound.rows.filter(row=>row.author_id===legacyOwners[1]).every(row=>row.attempt_id===null));
    console.log('PASS: legacy exact owner/draft/group backfill binds uniquely and leaves ambiguous history untouched.');
  }
  // Match the pgTAP runner bootstrap, exclusively inside this disposable DB.
  await coordinator.query('create extension if not exists pgtap with schema extensions; set search_path = public, extensions');
  for (const suite of ['joint_workout_recovery', 'joint_workouts']) {
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

  if (args.length) {
    const users = Array.from({ length: 6 }, () => randomUUID());
    const routine = {name:'Upper',muscleGroups:['back'],exercises:[{name:'Row',muscleGroups:['back'],loadMode:'external-load',loadUnit:'kg',variant:'barbell',sets:[{tipo:1,weight:80,reps:8}]}]};
    for (const [index, user] of users.entries()) {
      await coordinator.query("insert into auth.users(id) values($1);", [user]);
      await coordinator.query("insert into public.profiles(id,alias) values($1,$2)", [user, `Concurrent ${index}`]);
      await coordinator.query("insert into public.workout_start_activities(author_id,routine_name,expires_at) values($1,'Upper',now()+interval '1 hour')", [user]);
    }
    for (let i=0;i<users.length;i++) for(let j=i+1;j<users.length;j++) {
      await coordinator.query("insert into public.relationships(member_low,member_high,kind) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),'bro')",[users[i],users[j]]);
    }
    const a=await connect('joint-capacity-a'), b=await connect('joint-capacity-b');
    async function actor(client, user) {
      await client.query('set role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    }
    await actor(a,users[0]); await actor(b,users[0]);
    const {rows:[{id:group}]}=await a.query('select public.invite_active_workout_member($1,$2) id',[users[1],routine]);
    await a.query('select public.invite_active_workout_member($1,$2)',[users[2],routine]);
    await a.query('begin');
    await a.query('select public.invite_active_workout_member($1,$2)',[users[3],routine]);
    const racing=b.query('select public.invite_active_workout_member($1,$2)',[users[4],routine]).then(()=>null,error=>error.message);
    pending.push(racing);
    let blocked=false;
    for(let i=0;i<100;i++) {
      const {rows}=await coordinator.query("select wait_event from pg_stat_activity where application_name='joint-capacity-b'");
      if(rows.some(row=>row.wait_event==='advisory')) {blocked=true;break;}
      await delay(10);
    }
    assert.ok(blocked,'second invitation must wait at the lifecycle lock, not read stale capacity');
    await a.query('commit');
    assert.equal(await racing,'joint workout participant limit reached');
    const {rows:[{count}]}=await coordinator.query("select count(*)::int count from public.joint_workout_participants where joint_workout_id=$1 and status<>'declined'",[group]);
    assert.equal(count,4);
    console.log('PASS: concurrent invitations serialize and never admit a fifth participant.');

    // Two independent 2-person groups merge while another invite races the merge.
    await coordinator.query('delete from public.joint_workouts where id=$1',[group]);
    await actor(a,users[0]); await actor(b,users[2]);
    const {rows:[{id:destination}]}=await a.query('select public.invite_active_workout_member($1,$2) id',[users[1],routine]);
    await actor(b,users[1]); await b.query('select public.respond_joint_workout_invite($1,true)',[destination]);
    await actor(b,users[2]);
    const {rows:[{id:source}]}=await b.query('select public.invite_active_workout_member($1,$2) id',[users[3],routine]);
    await actor(b,users[3]); await b.query('select public.respond_joint_workout_invite($1,true)',[source]);
    await a.query('select public.invite_active_workout_member($1,$2)',[users[2],routine]);
    // A passive member has finalized local training but publication is still queued.
    await coordinator.query("update public.workout_start_activities set attempt_id='passive-old',closed_at=now() where author_id=$1",[users[3]]);
    await actor(a,users[2]); await actor(b,users[0]);
    await a.query('begin');
    await a.query('select public.respond_joint_workout_invite($1,true)',[destination]);
    const mergeRace=b.query('select public.invite_active_workout_member($1,$2)',[users[4],routine]).then(()=>null,error=>error.message);
    pending.push(mergeRace);
    let mergeBlocked=false;
    for(let i=0;i<100;i++) {
      const {rows}=await coordinator.query("select wait_event from pg_stat_activity where application_name='joint-capacity-b'");
      if(rows.some(row=>row.wait_event==='advisory')) {mergeBlocked=true;break;}
      await delay(10);
    }
    assert.ok(mergeBlocked,'invitation must wait for the concurrent group merge');
    await a.query('commit');
    assert.equal(await mergeRace,'joint workout participant limit reached');
    await actor(b,users[3]);
    assert.equal((await b.query("select public.resolve_joint_workout_attempt('passive-old') id")).rows[0].id,destination);
    await actor(b,users[4]);
    assert.equal((await b.query("select public.resolve_joint_workout_attempt('passive-old') id")).rows[0].id,null);
    console.log('PASS: concurrent merge/invite preserves four members and owner-bound closed-attempt mapping.');
    const protectedGroup=randomUUID(), newerGroup=randomUUID();
    for(const [group,initiator] of [[protectedGroup,users[0]],[newerGroup,users[1]]]) await coordinator.query('insert into public.joint_workouts(id,initiator_id,suggested_routine) values($1,$2,$3)',[group,initiator,routine]);
    const priorResult={routineName:'Protected result',durationSeconds:60,exercises:[]};
    await coordinator.query("insert into public.joint_workout_participants(joint_workout_id,participant_id,status,joined_at,completed_workout) values($1,$3,'active',now(),null),($1,$4,'completed',now(),$6),($2,$4,'active',now(),null),($2,$5,'active',now(),null)",[protectedGroup,newerGroup,users[0],users[1],users[2],priorResult]);
    await coordinator.query("update public.workout_start_activities set joint_workout_id=case when author_id=$1 then $3::uuid else $4::uuid end,attempt_id=case when author_id=$2 then 'new-b' else attempt_id end where author_id=any($5::uuid[]) and closed_at is null",[users[0],users[1],protectedGroup,newerGroup,users.slice(0,3)]);
    await coordinator.query("insert into public.workout_start_activities(author_id,routine_name,joint_workout_id,expires_at,closed_at,attempt_id) values($1,'Old',$2,now()+interval '1 hour',now(),'old-b')",[users[1],protectedGroup]);
    await actor(a,users[0]); await a.query('select public.invite_active_workout_member($1,$2)',[users[2],routine]);
    const snapshot=async()=>({participants:(await coordinator.query('select * from public.joint_workout_participants where joint_workout_id=any($1::uuid[]) order by joint_workout_id,participant_id',[[protectedGroup,newerGroup]])).rows,presence:(await coordinator.query('select * from public.workout_start_activities where author_id=$1 order by id',[users[1]])).rows});
    const before=await snapshot(); await actor(b,users[2]);
    await assert.rejects(b.query('select public.respond_joint_workout_invite($1,true)',[protectedGroup]),/joint workout completed participant conflict/);
    assert.deepEqual(await snapshot(),before,'rejected merge preserves both attempts and the completed publication');
    console.log('PASS: completed destination overlap rejects atomically without reactivating or retargeting old results.');

  }

} finally {
  await Promise.allSettled(clients.map((client) => client.query('rollback')));
  if (coordinator) await coordinator.query('select pg_advisory_unlock_all()').catch(() => undefined);
  await Promise.allSettled(pending);
  await Promise.allSettled(clients.map((client) => client.end()));
  if (created) {
    docker('exec', container, 'dropdb', '-U', 'postgres', database);
    console.log(`Removed isolated test database: ${database}`);
  }
}
