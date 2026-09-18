import { afterAll,beforeAll,describe,expect,test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deriveMuscleVolume,MUSCLE_VOLUME_AXES } from '../utils/muscleVolume';
import { volumeAttempt,volumeCases,volumeNow,volumeSubject } from './fixtures/muscleVolume';

// Opt-in isolated database: copies schema only, never modifies the app's database.
describe.skipIf(process.env.VOLUME_SQL_TEST!=='1')('PostgreSQL volume parity and access control',()=>{
  const container='supabase_db_gymbro';const database=`gymbro_volume_test_${randomUUID().replaceAll('-','')}`;
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
    for(const id of [actor,volumeSubject,stranger]){await db.query("insert into auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'{}','{}',now(),now())",[id,`${id}@example.test`]);await db.query('insert into public.profiles(id,alias) values($1,$2) on conflict(id) do nothing',[id,`Volume ${id}`]);}
    await db.query("insert into public.relationships(member_low,member_high,kind) values($1,$2,'bro')",[actor,volumeSubject]);
  },30000);
  afterAll(async()=>{if(db)await db.end();if(created)docker('exec',container,'dropdb','-U','postgres','--force',database);});
  test('SQL taxonomy equals the client taxonomy',async()=>expect((await db.query('select private.muscle_volume_taxonomy() as value')).rows[0].value).toEqual(MUSCLE_VOLUME_AXES));
  for(const fixture of volumeCases()) test(fixture.name,async()=>{
    for(const days of [7,28,90] as const){
      const local=deriveMuscleVolume(fixture.attempts,volumeSubject,days,volumeNow);
      for(const period of [local.current,local.previous]){
        const sql=(await db.query('select private.muscle_volume_period($1::jsonb,$2::uuid,$3::timestamptz,$4::timestamptz) as value',[JSON.stringify(fixture.attempts),volumeSubject,period.start,period.end])).rows[0].value;
        expect(sql).toEqual(period);
      }
    }
  });
  test('owner, preview, connection, goals, hidden state, stranger and anonymous access',async()=>{
    const a={...volumeAttempt('saved',5),completedAt:new Date(Date.now()-3600000).toISOString()};
    await db.query('insert into public.training_states(owner_id,attempts) values($1,$2) on conflict(owner_id) do update set attempts=excluded.attempts',[volumeSubject,JSON.stringify([a])]);
    await db.query('begin');
    try{
      await db.query('set local role authenticated');
      const who=async(id:string)=>db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
      const get=async(preview=false)=>(await db.query('select public.get_profile_muscle_volume($1,28,$2) as value',[volumeSubject,preview])).rows[0].value;
      await who(volumeSubject);await db.query('select public.save_muscle_volume_goals($1,false)',[JSON.stringify({chest:12})]);
      const own=await get();expect(own.goals).toEqual({chest:12});expect((await get(true)).goals).toEqual({});
      await who(actor);const social=await get();expect(social.current).toEqual(own.current);expect(social.goals).toEqual({});
      const insights=(await db.query('select public.get_social_profile_insights($1) as value',[volumeSubject])).rows[0].value;expect(insights.muscle_volume.current).toEqual(own.current);expect(insights.muscle_distribution[0].value).toBe(1.25);
      const batch=(await db.query('select public.list_social_profile_insights($1) as value',[[volumeSubject,stranger]])).rows[0].value;expect(Object.keys(batch)).toEqual([volumeSubject]);
      await who(volumeSubject);await db.query('select public.save_muscle_volume_goals($1,true)',[JSON.stringify({chest:12})]);await who(actor);expect((await get()).goals).toEqual({chest:12});
      await db.query('reset role');await db.query('update public.profiles set share_social_muscle_distribution=false where id=$1',[volumeSubject]);await db.query('set local role authenticated');
      expect(await get()).toBeNull();await who(volumeSubject);expect(await get(true)).toBeNull();expect((await get()).current.eligibleSets).toBe(5);
      await who(stranger);await db.query('savepoint deny');await expect(get()).rejects.toThrow('social profile unavailable');await db.query('rollback to savepoint deny');
      await db.query('set local role anon');await db.query('savepoint anonymous');await expect(get()).rejects.toThrow('permission denied');await db.query('rollback to savepoint anonymous');
    }finally{await db.query('rollback');}
  });
  test('blocked connections and private helper access are denied; invalid goals cannot persist',async()=>{
    await db.query('begin');
    try {
      await db.query('insert into public.blocks(blocker_id,blocked_id) values($1,$2)',[actor,volumeSubject]);
      await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
      await db.query('savepoint blocked');await expect(db.query('select public.get_profile_muscle_volume($1)',[volumeSubject])).rejects.toThrow('social profile unavailable');await db.query('rollback to savepoint blocked');
      await db.query('savepoint helper');await expect(db.query('select private.muscle_volume_taxonomy()')).rejects.toThrow('permission denied');await db.query('rollback to savepoint helper');
      for (const goal of [{chest:-1},{chest:101},{chest:'12'},{unknown:5}]) {
        await db.query('savepoint goal');await expect(db.query('select public.save_muscle_volume_goals($1,true)',[JSON.stringify(goal)])).rejects.toThrow('invalid goal');await db.query('rollback to savepoint goal');
      }
    } finally {await db.query('rollback');}
  });
  test('existing social insight SQL regression suite passes with v2 units',async()=>{
    await db.query('create extension if not exists pgtap with schema extensions; set search_path=public,extensions');
    const sql=readFileSync('supabase/tests/social_profile_insights.sql','utf8').replaceAll('60000000-','70000000-');
    const results=await db.query(sql);
    const lines=[results].flat().flatMap((r:any)=>r.rows.flatMap(Object.values)).filter((v:unknown)=>typeof v==='string');
    expect(lines.filter((v:string)=>/^not ok /m.test(v))).toEqual([]);
    expect(lines.filter((v:string)=>/^ok \d+/m.test(v))).toHaveLength(7);
  });
});
