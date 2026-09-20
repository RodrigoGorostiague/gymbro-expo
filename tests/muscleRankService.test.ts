import { beforeEach, expect, test, vi } from 'vitest';
import { deriveMuscleRanks } from '../utils/muscleRank';
import { volumeSubject, volumeNow, volumeAttempt } from './fixtures/muscleVolume';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/supabase', () => ({ supabase: { rpc }, supabaseConfigurationError: null }));
import { getProfileMuscleRanks, getWorkoutMuscleRankProgress, parseMuscleRanks, setMuscleRankPause } from '../services/muscleRank';
beforeEach(()=>rpc.mockReset());
test('hidden maps differ from unavailable and incompatible responses',async()=>{
  rpc.mockResolvedValue({data:null});expect(await getProfileMuscleRanks(volumeSubject,true)).toBeNull();expect(rpc).toHaveBeenCalledWith('get_profile_muscle_ranks',{target:volumeSubject,preview:true});
  rpc.mockResolvedValue({error:{message:'offline'}});await expect(getProfileMuscleRanks(volumeSubject)).rejects.toThrow('offline');
  expect(()=>parseMuscleRanks({policyVersion:99})).toThrow('compatible');
});
test('rejects another profile, invalid scores and incomplete axes',async()=>{
  const ranks=deriveMuscleRanks([volumeAttempt()],volumeSubject,volumeNow);
  rpc.mockResolvedValue({data:ranks});await expect(getProfileMuscleRanks('other')).rejects.toThrow('no corresponden');
  expect(()=>parseMuscleRanks({...ranks,axes:[]})).toThrow('compatible');
  expect(()=>parseMuscleRanks({...ranks,axes:ranks.axes.map((a,i)=>i? a : {...a,xp:NaN})})).toThrow('inválido');
});
test('completion validates session, account, timestamps and actual credited gem rewards',async()=>{
  const before=deriveMuscleRanks([],volumeSubject,volumeNow),after=deriveMuscleRanks([volumeAttempt()],volumeSubject,volumeNow);
  const value={attemptId:'a',before,after,rewards:[{muscleId:'chest',rankIndex:1,amount:25}]};
  rpc.mockResolvedValue({data:value});expect(await getWorkoutMuscleRankProgress('a',volumeSubject)).toEqual(value);
  await expect(getWorkoutMuscleRankProgress('b',volumeSubject)).rejects.toThrow('verificar');
  rpc.mockResolvedValue({data:{...value,rewards:[{muscleId:'chest',rankIndex:1,amount:999}]}});await expect(getWorkoutMuscleRankProgress('a',volumeSubject)).rejects.toThrow('verificar');
});
test('pause writes only an authenticated boolean preference',async()=>{rpc.mockResolvedValue({data:null});await setMuscleRankPause(true);expect(rpc).toHaveBeenCalledWith('set_muscle_rank_pause',{paused_input:true});});
