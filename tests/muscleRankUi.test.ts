import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { deriveMuscleRanks, rankFromDays } from '../utils/muscleRank';
import { deriveMuscleVolume } from '../utils/muscleVolume';
import { volumeAttempt, volumeNow, volumeSubject } from './fixtures/muscleVolume';
const api=vi.hoisted(()=>({get:vi.fn(),pause:vi.fn(),progress:vi.fn(),volume:vi.fn(),preference:vi.fn(),savePreference:vi.fn()}));
vi.mock('../services/muscleRank',()=>({getProfileMuscleRanks:api.get,setMuscleRankPause:api.pause,getWorkoutMuscleRankProgress:api.progress}));
vi.mock('../services/muscleVolume',()=>({getProfileMuscleVolume:api.volume,saveMuscleVolumeGoals:vi.fn()}));
vi.mock('../services/muscleMapPreference',()=>({loadMuscleMapMode:api.preference,saveMuscleMapMode:api.savePreference}));
vi.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:{background:['#fff','#fff'],primary:'#2563eb',secondary:'#06b6d4',text:'#111',textMuted:'#555',glass:'#eee',glassBorder:'#ccc',onPrimary:'#fff'}})}));
import { MuscleVolumeCard } from '../components/MuscleVolumeCard';
import { MuscleBodyMap } from '../components/MuscleBodyMap';
import { WorkoutMuscleRankProgress } from '../components/WorkoutMuscleRankProgress';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let tree:Renderer.ReactTestRenderer;
const text=()=>tree.root.findAll(n=>String(n.type)==='Text').map(n=>n.children.join('')).join('\n');
const click=async(label:string)=>{const n=tree.root.findAll(n=>String(n.type)==='Pressable').find(n=>n.props.accessibilityLabel===label||n.findAll(x=>String(x.type)==='Text').some(t=>t.children.join('')===label));expect(n,label).toBeDefined();await act(async()=>n!.props.onPress());};
const render=async(own=true)=>{await act(async()=>{tree=Renderer.create(React.createElement(MuscleVolumeCard,{subjectId:volumeSubject,own}));});};
beforeEach(()=>{
  vi.clearAllMocks();api.get.mockResolvedValue(deriveMuscleRanks([volumeAttempt('a',5)],volumeSubject,volumeNow));api.volume.mockImplementation(async(id,days)=>deriveMuscleVolume([],id,days,volumeNow));api.pause.mockResolvedValue(undefined);api.preference.mockResolvedValue('volume');api.savePreference.mockResolvedValue(undefined);
});
afterEach(()=>{if(tree)act(()=>tree.unmount());});
test('selector remembers mode, displays categorical colors and opens explanatory view',async()=>{
  await render();await click('Mapa Ranked');expect(api.savePreference).toHaveBeenCalledWith('ranked');expect(tree.root.findByType(MuscleBodyMap).props.projection.mode).toBe('ranked');expect(text()).toContain('Sin registros');
  await click('Rango de Pecho');expect(text()).toContain('50 XP');expect(text()).toContain('Última actividad registrada');
  await click('Cómo funcionan los rangos musculares');expect(text()).toContain('25 gemas');expect(text()).toContain('0,5 %');await click('Cerrar explicación de rangos');expect(tree.root.findAll(n=>String(n.type)==='Modal')).toHaveLength(0);
  await click('Mapa de volumen');expect(tree.root.findByType(MuscleBodyMap).props.projection.mode).toBe('volume-summary');
});
test('owner preview stays shared when switching map modes; hidden/error never show personal data',async()=>{
  await render();await click('Ver como otros');api.get.mockResolvedValue(null);await click('Mapa Ranked');expect(api.get).toHaveBeenLastCalledWith(volumeSubject,true);expect(text()).toContain('no está compartido');expect(tree.root.findAllByType(MuscleBodyMap)).toHaveLength(0);
  api.get.mockRejectedValue(new Error('offline'));await click('Volver a mi vista');expect(text()).toContain('offline');expect(tree.root.findAllByType(MuscleBodyMap)).toHaveLength(0);
});
test('connections see same ranks without pause editing',async()=>{
  api.preference.mockResolvedValue('ranked');await render(false);expect(api.get).toHaveBeenCalledWith(volumeSubject,false);expect(text()).not.toContain('Pausar desde');expect(tree.root.findByType(MuscleBodyMap).props.projection.mode).toBe('ranked');
});
test('failed pause keeps error and allows retry without optimistic score changes',async()=>{
  api.preference.mockResolvedValue('ranked');await render();api.pause.mockRejectedValueOnce(new Error('No se guardó'));await click('Pausar desde mañana (UTC)');expect(text()).toContain('No se guardó');await click('Pausar desde mañana (UTC)');expect(api.pause).toHaveBeenCalledTimes(2);
});
test('completion shows multiple muscle ascents and sums only confirmed 25-gem awards',async()=>{
  const days=[{day:'2026-09-17',equivalents:{chest:6,shoulders:6}}];
  const before=rankFromDays(days,volumeSubject,volumeNow),after=rankFromDays([...days,{day:'2026-09-18',equivalents:{chest:6,shoulders:6}}],volumeSubject,volumeNow);
  api.progress.mockResolvedValue({attemptId:'a',before,after,rewards:[{muscleId:'chest',rankIndex:1,amount:25},{muscleId:'shoulders',rankIndex:1,amount:25}]});
  await act(async()=>{tree=Renderer.create(React.createElement(WorkoutMuscleRankProgress,{attemptId:'a',subjectId:volumeSubject,confirmed:true}));});
  expect(text()).toContain('+50 gemas');expect(text()).toContain('Principiante → Intermedio');expect(text()).toContain('60 → 120 XP');
});
test('completion errors offer retry; recovered rank grants no fabricated gems',async()=>{
  api.progress.mockRejectedValueOnce(new Error('pending'));
  await act(async()=>{tree=Renderer.create(React.createElement(WorkoutMuscleRankProgress,{attemptId:'a',subjectId:volumeSubject,confirmed:false}));});expect(text()).toContain('pendiente');
  const before=deriveMuscleRanks([volumeAttempt('a',5)],volumeSubject,volumeNow);before.axes[0].peakXp=110;const after=structuredClone(before);after.axes[0].xp=110;after.axes[0].peakXp=110;
  api.progress.mockResolvedValue({attemptId:'a',before,after,rewards:[]});await click('Reintentar progreso muscular');expect(text()).toContain('Rango recuperado');expect(text()).not.toContain('+25 gemas');
});
