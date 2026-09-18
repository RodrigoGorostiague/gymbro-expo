import { describe,expect,test } from 'vitest';
import { deriveMuscleVolume,muscleVolumeScale,weeklyVolumeEntries } from '../utils/muscleVolume';
import { volumeAttempt,volumeCases,volumeNow,volumeSubject } from './fixtures/muscleVolume';
describe('muscle volume v2',()=>{
  const calculate=(index:number)=>deriveMuscleVolume(volumeCases()[index].attempts,volumeSubject,28,volumeNow);
  test('counts sets rather than exercises and shows weekly average including inactive days',()=>{
    const one=deriveMuscleVolume([volumeAttempt()],volumeSubject,28,volumeNow);
    const five=calculate(0);
    expect(five.current.axes[0].equivalent).toBe(one.current.axes[0].equivalent*5);
    expect(five.current.axes.find(a=>a.id==='triceps')).toMatchObject({direct:0,indirect:5,equivalent:2.5});
    expect(weeklyVolumeEntries(five)[0].value).toBe(1.25);
  });
  test('deduplicates workouts',()=>expect(calculate(1).current.eligibleSets).toBe(1));
  test('excludes warmup, omitted, invalid and timed sets',()=>expect(calculate(2).current).toMatchObject({eligibleSets:0,unsupportedSets:1}));
  test('counts a linked drop group once and reports unsupported techniques',()=>expect(calculate(3).current).toMatchObject({eligibleSets:3,unsupportedSets:1}));
  test('does not sum overlapping anatomical associations',()=>expect(calculate(4).current).toMatchObject({unclassifiedSets:5,axes:expect.arrayContaining([expect.objectContaining({id:'chest',equivalent:5})])}));
  test('falls back for an empty catalog',()=>expect(calculate(5).current.axes[0].direct).toBe(5));
  test('uses explicit role, not numeric relevance, and reports unknown roles',()=>expect(calculate(6).current).toMatchObject({unclassifiedSets:5,axes:expect.arrayContaining([expect.objectContaining({id:'chest',equivalent:5})])}));
  test('filters owner and invalid/future dates; windows are start-inclusive/end-exclusive',()=>{
    expect(calculate(7).current.eligibleSets).toBe(5);expect(calculate(7).previous.eligibleSets).toBe(10);
  });
  test('never imputes prescribed effort or combines RIR and RPE',()=>expect(calculate(8).current.axes[0]).toMatchObject({effortCount:3,rirCount:2,rirSum:4,rpeCount:1,rpeSum:8}));
  test('private goals cannot change chart scale',()=>{const v=calculate(0);expect(muscleVolumeScale({...v,goals:{chest:100}})).toBe(muscleVolumeScale(v));});
});
