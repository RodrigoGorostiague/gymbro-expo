import type { WorkoutAttempt } from '../../types';
export const volumeSubject = '60000000-0000-0000-0000-000000000002';
export const volumeNow = Date.parse('2026-09-18T12:00:00.000Z');
export function volumeAttempt(id = 'a', count = 1): WorkoutAttempt {
  return {
    version:1, recordedRoutineName:'Press', routineId:null, durationSeconds:60, restTimerSeconds:0, completion:{validSets:count,plannedSets:count,adherence:1,displayPercent:100,status:'fully-completed'}, reward:{setGems:0,completionGems:0,fullCompletionBonus:0,totalGems:0,qualifiesForCompletion:false}, rewardApplication:{id:`${volumeSubject}:${id}:v1`,state:'applied'},
    id, owner: volumeSubject, completedAt: '2026-09-17T12:00:00.000Z',
    exercises: [{ exerciseId:'press', recordedName:'Press', catalog:{ muscleParticipations:[{muscleGroupId:'GM-101',role:'Principal',relevance:1},{muscleGroupId:'GM-145',role:'Secundario',relevance:.3}]},
      sets:Array.from({length:count},(_,i) => ({plan:{id:`s${i}`,type:1},result:{setId:`s${i}`,performed:true,performance:{mode:'external-load',unit:'kg',reps:10,load:40},actualEffort:{kind:'rir',value:2}}})) }],
  } as unknown as WorkoutAttempt;
}
export function volumeCases(): {name:string; attempts:WorkoutAttempt[]}[] {
  const edit = (change:(a:any)=>void,id='a') => { const a=structuredClone(volumeAttempt(id,5)); change(a); return a; };
  return [
    {name:'five direct sets and indirect work',attempts:[volumeAttempt('a',5)]},
    {name:'duplicates',attempts:[volumeAttempt(),volumeAttempt()]},
    {name:'warmups skipped invalid and timed',attempts:[edit(a=> { a.exercises[0].sets[0].plan.type='C'; a.exercises[0].sets[1].result.performed=false; a.exercises[0].sets[2].result.setId='wrong'; a.exercises[0].sets[3].result.performance.reps=0; a.exercises[0].sets[4].result.performance={mode:'bodyweight',unit:'kg',bodyweight:70,reps:0,durationSeconds:30}; })]},
    {name:'drop groups and unsupported fractional type',attempts:[edit(a=> { a.exercises[0].sets[0].plan.dropGroupId='drop'; a.exercises[0].sets[1].plan.dropGroupId='drop'; a.exercises[0].sets[2].plan.type=1.1; a.exercises[0].sets[3].plan.type='F'; })]},
    {name:'overlapping associations and unknowns',attempts:[edit(a=>{ a.exercises[0].catalog.muscleParticipations.push({muscleGroupId:'GM-102',role:'Secundario'},{muscleGroupId:'GM-100',role:'Principal'},{muscleGroupId:'unknown',role:'Principal'}); })]},
    {name:'empty catalog fallback',attempts:[edit(a=>{a.exercises[0].catalog.muscleParticipations=[];a.exercises[0].attribution={primary:'pecho',secondary:['tríceps']};})]},
    {name:'invalid roles and zero relevance',attempts:[edit(a=>{a.exercises[0].catalog.muscleParticipations=[{muscleGroupId:'GM-100',role:'Principal',relevance:0},{muscleGroupId:'GM-145',role:'Unknown'}];})]},
    {name:'dates owner and boundaries',attempts:[edit(a=>a.completedAt='invalid','bad'),edit(a=>a.completedAt='2026-09-19T12:00:00Z','future'),edit(a=>a.owner='other','other'),edit(a=>a.completedAt='2026-08-21T12:00:00Z','start'),edit(a=>a.completedAt='2026-07-24T12:00:00Z','previousStart'),edit(a=>a.completedAt='2026-08-21T11:59:59.999Z','previousEnd')]},
    {name:'effort actual only',attempts:[edit(a=>{delete a.exercises[0].sets[0].result.actualEffort;a.exercises[0].sets[0].plan.effortTarget={kind:'rir',value:1};a.exercises[0].sets[1].result.actualEffort={kind:'rpe',value:8};a.exercises[0].sets[2].result.actualEffort={kind:'rir',value:99};})]},
  ];
}
