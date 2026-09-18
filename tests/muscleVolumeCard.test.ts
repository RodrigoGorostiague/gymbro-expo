import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {afterEach,beforeEach,describe,expect,test,vi} from 'vitest';
import {deriveMuscleVolume} from '../utils/muscleVolume';
import {volumeAttempt,volumeNow,volumeSubject} from './fixtures/muscleVolume';
const api=vi.hoisted(()=>({get:vi.fn(),save:vi.fn()}));
vi.mock('../services/muscleVolume',()=>({getProfileMuscleVolume:api.get,saveMuscleVolumeGoals:api.save}));
vi.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:{primary:'#2563eb',accent:'#06b6d4',text:'#111',textMuted:'#666',glass:'#eee',glassBorder:'#ccc',onPrimary:'#fff'}})}));
import {MuscleVolumeCard} from '../components/MuscleVolumeCard';
import {MuscleBodyMap} from '../components/MuscleBodyMap';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
describe('shared muscle volume experience',()=>{
  let tree:Renderer.ReactTestRenderer;
  const text=()=>tree.root.findAll(n=>String(n.type)==='Text').map(n=>n.children.join('')).join('\n');
  const click=async(label:string)=>{const node=tree.root.findAll(n=>String(n.type)==='Pressable').find(n=>n.props.accessibilityLabel===label||n.findAll(x=>String(x.type)==='Text').some(x=>x.children.join('')===label));expect(node, label).toBeDefined();await act(async()=>node!.props.onPress());};
  const render=async(own=true)=>{await act(async()=>{tree=Renderer.create(React.createElement(MuscleVolumeCard,{subjectId:volumeSubject,own,attempts:[volumeAttempt('a',5)]}));});};
  beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async(subject,days)=>deriveMuscleVolume([volumeAttempt('a',5)],subject,days,volumeNow));api.save.mockResolvedValue(undefined);});
  afterEach(()=>{if(tree)act(()=>tree.unmount());});
  test('switches periods and shows direct/indirect weekly volume',async()=>{await render();expect(text()).toContain('5 series de trabajo');expect(text()).toContain('5 directas · 0 indirectas');await click('7 días');expect(api.get).toHaveBeenLastCalledWith(volumeSubject,7,false);expect(tree.root.findByType(MuscleBodyMap).props.projection.entries[0].value).toBe(5);});
  test('owner and connection receive identical geometry and units',async()=>{await render();const own=tree.root.findByType(MuscleBodyMap).props.projection;act(()=>tree.unmount());await render(false);expect(tree.root.findByType(MuscleBodyMap).props.projection).toEqual(own);expect(tree.root.findByType(MuscleBodyMap).props.projection.unit).toBe('Series equivalentes / semana');});
  test('comparison toggles preserve volume and zero regions',async()=>{await render();const shape=tree.root.findByType(MuscleBodyMap).props.projection;expect(shape.entries.find((e:any)=>e.id==='deltoids').value).toBe(0);await click('Sin comparación');expect(tree.root.findByType(MuscleBodyMap).props.projection).toEqual(shape);});
  test('details expose recorded effort separately',async()=>{await render();await click('Detalle de Pecho');expect(text()).toContain('Esfuerzo: 5/5 series · RIR 2 (5)');});
  test('public preview respects hidden state and never falls back to local data',async()=>{await render();api.get.mockResolvedValue(null);await click('Ver como otros');expect(api.get).toHaveBeenLastCalledWith(volumeSubject,28,true);expect(text()).toContain('no está compartida');expect(tree.root.findAllByType(MuscleBodyMap)).toHaveLength(0);});
  test('failed preview erases old data',async()=>{await render();api.get.mockRejectedValue(new Error('Sin conexión'));await click('Ver como otros');expect(text()).toContain('Sin conexión');expect(tree.root.findAllByType(MuscleBodyMap)).toHaveLength(0);});
  test('only owner gets explicit provisional offline projection',async()=>{api.get.mockRejectedValue(new Error('Offline'));await render();expect(text()).toContain('Vista local provisional');act(()=>tree.unmount());await render(false);expect(tree.root.findAllByType(MuscleBodyMap)).toHaveLength(0);});
  test('validates, saves decimal goals and preserves draft after server failure',async()=>{
    await render();await click('Editar objetivos semanales');const input=()=>tree.root.findAll(n=>String(n.type)==='TextInput').find(n=>n.props.accessibilityLabel==='Objetivo semanal Pecho')!;
    act(()=>input().props.onChangeText('101'));await click('Guardar objetivos');expect(api.save).not.toHaveBeenCalled();expect(text()).toContain('entre 0 y 100');
    act(()=>input().props.onChangeText('12,5'));api.save.mockRejectedValueOnce(new Error('Falló el guardado'));await click('Guardar objetivos');expect(input().props.value).toBe('12,5');expect(text()).toContain('Falló el guardado');
    await click('Guardar objetivos');expect(api.save).toHaveBeenLastCalledWith({chest:12.5},false);expect(tree.root.findAll(n=>String(n.type)==='TextInput')).toHaveLength(0);
  });
  test('local toggle never writes private history',async()=>{await render();await click('Incluir registros locales');expect(text()).toContain('Vista local provisional');expect(api.save).not.toHaveBeenCalled();});
  test('unavailable local history never becomes a false empty history',async()=>{
    api.get.mockRejectedValue(new Error('Offline'));
    await act(async()=>{tree=Renderer.create(React.createElement(MuscleVolumeCard,{subjectId:volumeSubject,own:true,localAvailable:false}));});
    expect(text()).not.toContain('Vista local provisional');expect(tree.root.findAllByType(MuscleBodyMap)).toHaveLength(0);
  });
});
