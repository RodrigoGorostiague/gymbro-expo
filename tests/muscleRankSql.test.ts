import { afterAll,beforeAll,describe,expect,test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deriveMuscleRanks, rankFromDays } from '../utils/muscleRank';
import { volumeAttempt,volumeCases,volumeNow,volumeSubject } from './fixtures/muscleVolume';

describe.skipIf(process.env.RANK_SQL_TEST!=='1')('muscle rank SQL parity, rewards and privacy',()=>{
  const container='supabase_db_gymbro';const database=`gymbro_rank_test_${randomUUID().replaceAll('-','')}`;
  const docker=(...args:string[])=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:32*1024*1024});
  let db:any;let created=false;
  const actor='60000000-0000-0000-0000-000000000001';const stranger='60000000-0000-0000-0000-000000000003';
  beforeAll(async()=>{
    docker('exec',container,'createdb','-U','postgres',database);created=true;
    const schema=docker('exec',container,'pg_dump','-U','postgres','-d','postgres','--schema-only','--exclude-schema=cron').replace(/^.*(?:CREATE EXTENSION|COMMENT ON EXTENSION).*pg_cron.*$/gm,'').replace(/^(?:GRANT|REVOKE).*\bcron(?:[.;]|\s).*$/gm,'');
    execFileSync('docker',['exec','-i',container,'psql','-X','-q','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1'],{input:schema,encoding:'utf8',maxBuffer:32*1024*1024});
    const env=JSON.parse(docker('inspect','--format','{{json .Config.Env}}',container));
    const password=env.find((x:string)=>x.startsWith('POSTGRES_PASSWORD='))?.slice(18);
    const pg=createRequire(import.meta.url)('pg');db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password,database});await db.connect();
    await db.query(readFileSync('supabase/migrations/20260918160000_muscle_volume_profiles.sql','utf8'));
    await db.query(readFileSync('supabase/migrations/20260919120000_muscle_rank_profiles.sql','utf8'));
    for(const id of [actor,volumeSubject,stranger]){await db.query("insert into auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'{}','{}',now(),now())",[id,`${id}@example.test`]);await db.query('insert into public.profiles(id,alias) values($1,$2) on conflict(id) do nothing',[id,`Volume ${id}`]);}
    await db.query("insert into public.relationships(member_low,member_high,kind) values($1,$2,'bro')",[actor,volumeSubject]);
  },30000);
  afterAll(async()=>{if(db)await db.end();if(created)docker('exec',container,'dropdb','-U','postgres','--force',database);});
  for(const fixture of volumeCases()) test(`parity: ${fixture.name}`, async()=>{
    const value=(await db.query('select private.muscle_rank_from_days(private.muscle_rank_days($1,$2,$3),$2,$3) value',[JSON.stringify(fixture.attempts),volumeSubject,new Date(volumeNow).toISOString()])).rows[0].value;
    expect(value).toEqual(deriveMuscleRanks(fixture.attempts,volumeSubject,volumeNow));
  });
  test('SQL/TS agree on caps, threshold edges, pause, decay and years of history',async()=>{
    const start=Date.parse('2024-01-01T12:00:00Z');
    const days=Array.from({length:800},(_,i)=>({day:new Date(start+i*86400000).toISOString().slice(0,10),equivalents:{chest:6,triceps:3}}));
    for(const pauses of [[],[{start:'2024-02-01',end:'2024-03-15'}],[{start:'2025-01-01',end:null}]]){
      const now=start+840*86400000;
      const value=(await db.query('select private.muscle_rank_from_days($1,$2,$3,$4) value',[JSON.stringify(days),volumeSubject,new Date(now).toISOString(),JSON.stringify(pauses)])).rows[0].value;
      expect(value).toEqual(rankFromDays(days,volumeSubject,now,pauses));
    }
  });
  test('same snapshot for owner and connection, hidden preview, blocked/stranger/anonymous denial',async()=>{
    await db.query('begin');
    try{
      await db.query('insert into public.training_states(owner_id,attempts) values($1,$2) on conflict(owner_id) do update set attempts=excluded.attempts',[volumeSubject,JSON.stringify([volumeAttempt('privacy',5)])]);
      const who=async(id:string)=>{await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);};
      const get=async(preview=false)=>(await db.query('select public.get_profile_muscle_ranks($1,$2) value',[volumeSubject,preview])).rows[0].value;
      await who(volumeSubject);const own=await get();await who(actor);expect(await get()).toEqual(own);
      await db.query('reset role');await db.query('update public.profiles set share_social_muscle_distribution=false where id=$1',[volumeSubject]);
      await who(actor);expect(await get()).toBeNull();await who(volumeSubject);expect(await get(true)).toBeNull();expect(await get()).not.toBeNull();
      await who(stranger);await db.query('savepoint denied');await expect(get()).rejects.toThrow('social profile unavailable');await db.query('rollback to savepoint denied');
      await db.query('reset role');await db.query('insert into public.blocks(blocker_id,blocked_id) values($1,$2)',[actor,volumeSubject]);
      await who(actor);await db.query('savepoint blocked');await expect(get()).rejects.toThrow('social profile unavailable');await db.query('rollback to savepoint blocked');
      for(const role of ['authenticated','anon']){
        await db.query(`set local role ${role}`);
        for(const query of ['select * from private.muscle_rank_pauses','select * from private.muscle_rank_receipts',"select private.muscle_rank_from_days('[]',$1,now())",'select public.finalize_training_attempt_before_online(null)']){
          await db.query('savepoint helper');await expect(db.query(query,query.includes('$1')?[volumeSubject]:[])).rejects.toThrow('permission denied');await db.query('rollback to savepoint helper');
        }
      }
      await db.query('savepoint anon');await expect(get()).rejects.toThrow('permission denied');await db.query('rollback to savepoint anon');
    }finally{await db.query('rollback');}
  });
  test('pause toggles are account scoped and changes begin next UTC day',async()=>{
    await db.query('begin');
    try{
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[volumeSubject]);await db.query('set local role authenticated');
      await db.query('select public.set_muscle_rank_pause(true)');await db.query('select public.set_muscle_rank_pause(true)');
      const get=async()=>(await db.query('select public.get_profile_muscle_ranks($1) value',[volumeSubject])).rows[0].value;
      const next=await get();expect(next.paused).toBe(false);expect(next.pauseStartsOn).not.toBeNull();
      await db.query('select public.set_muscle_rank_pause(false)');expect((await get()).pauseStartsOn).toBeNull();
      await db.query('reset role');await db.query("insert into private.muscle_rank_pauses(owner_id,start_on) values($1,(now() at time zone 'UTC')::date-2)",[volumeSubject]);
      await db.query('set local role authenticated');await db.query('select public.set_muscle_rank_pause(false)');const resuming=await get();expect(resuming.paused).toBe(true);expect(resuming.pauseEndsOn).not.toBeNull();
      await db.query('select public.set_muscle_rank_pause(true)');expect((await get()).pauseEndsOn).toBeNull();
    }finally{await db.query('rollback');}
  });
  test('finalization awards 25 per new rank per muscle, refreshes wallet and never pays twice',async()=>{
    await db.query('begin');
    try{
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[volumeSubject]);
      const now=Date.now();const day=86400000;
      const attempt=(id:string,daysAgo:number,count=6)=>({...volumeAttempt(id,count),routineId:'r',completedAt:new Date(now-daysAgo*day-60000).toISOString()});
      const base=attempt('rank-base',1);const current=attempt('rank-new',0);
      // Two direct groups ascend together; indirect triceps need more sessions.
      for(const a of [base,current]) a.exercises = a.exercises.map(e => ({ ...e, catalog: { ...e.catalog!, muscleParticipations: [...e.catalog!.muscleParticipations, {muscleGroupId:'GM-110',originalLabel:'Hombros',role:'Principal' as const,relevance:1}] } }));
      await db.query('set local role authenticated');
      const finalize=async(a:any)=>(await db.query('select public.finalize_training_attempt($1) value',[JSON.stringify(a)])).rows[0].value;
      const receipt=await finalize(base);expect(receipt.receipt.entries.filter((e:any)=>e.kind==='muscle_rank_up')).toHaveLength(0);
      const result=await finalize(current);const awards=result.receipt.entries.filter((e:any)=>e.kind==='muscle_rank_up');
      expect(awards).toHaveLength(2);expect(awards.reduce((n:number,e:any)=>n+e.amount,0)).toBe(50);
      const progress=async()=>(await db.query('select public.get_workout_muscle_rank_progress($1) value',['rank-new'])).rows[0].value;
      const original=await progress();expect(original.before.axes[0].xp).toBe(60);expect(original.after.axes[0].xp).toBe(120);expect(original.rewards).toHaveLength(2);
      const retried=await finalize({...current,exercises:volumeAttempt('fake',50).exercises});expect(retried.receipt).toEqual(result.receipt);expect(await progress()).toEqual(original);
      await db.query('reset role');
      const count=await db.query("select count(*)::int n from public.reward_ledger_entries where owner_id=$1 and kind='muscle_rank_up'",[volumeSubject]);expect(count.rows[0].n).toBe(2);
      await db.query("update public.training_states set attempts='[]' where owner_id=$1",[volumeSubject]);
      await db.query('set local role authenticated');expect(await progress()).toEqual(original);
      await finalize({...base,id:'rank-farm-base'});const farm=await finalize({...current,id:'rank-farm-new'});expect(farm.receipt.entries.filter((e:any)=>e.kind==='muscle_rank_up')).toHaveLength(0);
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await db.query('savepoint other');await expect(progress()).rejects.toThrow('muscle rank session pending');await db.query('rollback to savepoint other');
    }finally{await db.query('rollback');}
  });
  test('a multi-rank jump pays every threshold per muscle and never repeats',async()=>{
    await db.query('begin');
    try {
      await db.query('insert into public.reward_wallets(owner_id) values($1) on conflict do nothing',[volumeSubject]);
      const before={axes:[{id:'chest',peakXp:99},{id:'shoulders',peakXp:0}]};
      const after={axes:[{id:'chest',peakXp:800},{id:'shoulders',peakXp:300}]};
      await db.query('select private.award_muscle_rank_gems($1,$2,$3,$4)',[volumeSubject,'multi-jump',before,after]);
      const read=async()=>(await db.query("select count(*)::int n,sum(amount)::int gems from public.reward_ledger_entries where owner_id=$1 and kind='muscle_rank_up'",[volumeSubject])).rows[0];
      expect(await read()).toEqual({n:5,gems:125});
      await db.query('select private.award_muscle_rank_gems($1,$2,$3,$4)',[volumeSubject,'different-session',before,after]);expect(await read()).toEqual({n:5,gems:125});
    } finally {await db.query('rollback');}
  });
  for(const transport of ['online','offline']) test(`${transport} completion includes rank gems in terminal receipt`,async()=>{
    await db.query('begin');
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[volumeSubject]);await db.query('set local role authenticated');
      const now=Date.now();
      const base={...volumeAttempt('transport-base',6),routineId:'r',completedAt:new Date(now-86400000).toISOString()};
      const current={...volumeAttempt('transport-final',6),routineId:'r',completedAt:new Date(now-60000).toISOString()};
      await db.query('select public.finalize_training_attempt($1)',[JSON.stringify(base)]);
      const draft={version:1,owner:volumeSubject,attemptId:current.id,routineId:'r',startedAtMs:1,restTimerSeconds:30,completedSets:{},setValues:{},routineSnapshot:{id:'r',name:'Ranked',exercises:[]}};
      await db.query('select public.start_training_workout($1)',[draft]);
      let expected:any=draft;
      if(transport==='online') expected=(await db.query('select public.claim_online_workout($1) value',[draft])).rows[0].value.draft;
      const next={...expected,pendingFinalization:{attempt:current}};
      const sync=async()=>(await db.query(`select public.sync_${transport}_workout($1,$2,$3) value`,[expected,next,current])).rows[0].value;
      const saved=await sync();expect(saved.status).toBe('saved');expect(saved.finalized.receipt.entries.filter((e:any)=>e.kind==='muscle_rank_up')).toHaveLength(1);
      expect((await sync()).finalized.receipt).toEqual(saved.finalized.receipt);
    } finally {await db.query('rollback');}
  });
  test('migration is reappliable and existing finalization and transport SQL checks pass',async()=>{
    await db.query(readFileSync('supabase/migrations/20260919120000_muscle_rank_profiles.sql','utf8'));
    await db.query('create extension if not exists pgtap with schema extensions; set search_path=public,extensions');
    for(const file of ['contextual_record_gems.sql','online_workout_handoff.sql','training_level_progression.sql']){
      const results=await db.query(readFileSync(`supabase/tests/${file}`,'utf8'));
      const lines=[results].flat().flatMap((r:any)=>r.rows.flatMap(Object.values)).filter((v:unknown)=>typeof v==='string');
      expect(lines.filter((v:string)=>/^not ok /m.test(v)),file).toEqual([]);
      expect(lines.some((v:string)=>/^ok \d+/m.test(v)),file).toBe(true);
    }
  });
});
