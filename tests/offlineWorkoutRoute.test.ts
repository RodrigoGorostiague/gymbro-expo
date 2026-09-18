import React from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { changeText, findButton, findText, press, render, resetRuntimeHarness, setMockData, setMockParams, mockRouter } from './helpers/runtimeHarness';
import { ActiveWorkoutTabButton } from '../app/(tabs)/_layout';
import { act } from 'react-test-renderer';
import ExecuteRoutineScreen from '../app/routine/execute/[id]';
import TrainEntryScreen from '../app/(tabs)/train';
vi.mock('../context/ShopContext',()=>({useShop:()=>({retryPendingRewards:vi.fn()})}));
const routine={id:'r',name:'Saved workout',createdAt:'',muscleGroups:[],exercises:[{id:'e',name:'Press',variant:'Bar',muscleGroups:[],loadMode:'external-load',loadUnit:'kg',sets:[{id:'s',tipo:1,weight:20,reps:8}]}]};
const draft=()=>({version:1,owner:'rodaja',attemptId:'a',routineId:'r',startedAtMs:Date.now(),restTimerSeconds:30,completedSets:{},setValues:{'e-s':{weight:'20',reps:'8'}},routineSnapshot:routine});
beforeEach(()=>{vi.clearAllMocks();resetRuntimeHarness();setMockParams({id:'r'});});
test('reopens snapshot with missing plan and persists typing without blur',async()=>{
  const updateActiveWorkout=vi.fn(async()=>{}), clearActiveWorkoutIfMatches=vi.fn();
  setMockData({offlineWorkoutEnabled:true,offlineWorkoutStatus:'pending',dataState:'error',getRoutine:()=>undefined,routines:[],mesocycles:[],attempts:[],activeWorkoutDraft:draft(),updateActiveWorkout,clearActiveWorkoutIfMatches,refreshActiveWorkoutTiming:vi.fn(async()=>{}),cancelActiveWorkout:vi.fn()});
  const tree=await render(React.createElement(ExecuteRoutineScreen));
  expect(findText(tree.root,'Guardado en este dispositivo · Pendiente de sincronización')).toBeDefined();
  const inputs=tree.root.findAll((node)=>node.props.value==='20'&&typeof node.props.onChangeText==='function');
  expect(inputs.length).toBeGreaterThan(0);
  await changeText(inputs[0],'25.');
  expect(updateActiveWorkout).toHaveBeenCalledWith(expect.objectContaining({setValues:{'e-s':{weight:'25.',reps:'8'}}}));
  expect(clearActiveWorkoutIfMatches).not.toHaveBeenCalled();
});
test('requires explicit resume after five hours without deleting data',async()=>{
  setMockData({offlineWorkoutEnabled:true,offlineWorkoutStatus:'pending',getRoutine:()=>undefined,routines:[],mesocycles:[],attempts:[],activeWorkoutDraft:{...draft(),startedAtMs:1},updateActiveWorkout:vi.fn(async()=>{}),clearActiveWorkoutIfMatches:vi.fn(),refreshActiveWorkoutTiming:vi.fn(async()=>{}),cancelActiveWorkout:vi.fn()});
  const tree=await render(React.createElement(ExecuteRoutineScreen));
  await press(findButton(tree.root,'Continuar entrenamiento guardado'));
  expect(findText(tree.root,'Guardado en este dispositivo · Pendiente de sincronización')).toBeDefined();
});
test('train route exposes local reentry while remote data is in error',async()=>{
  setMockData({offlineWorkoutEnabled:true,dataState:'error',activeWorkoutDraft:draft(),routines:[],mesocycles:[],attempts:[]});
  const tree=await render(React.createElement(TrainEntryScreen));
  await press(findButton(tree.root,'Continuar entrenamiento guardado'));
  expect(mockRouter.push).toHaveBeenCalledWith({pathname:'/routine/execute/[id]',params:{id:'r'}});
});

test.each([false,true])('tab handles pending cancellation, immediately or restored (%s)',async(restored)=>{
  setMockData({offlineWorkoutEnabled:true,activeWorkoutDraft:restored?null:draft(),routines:[],mesocycles:[]});
  const tree=render(React.createElement(ActiveWorkoutTabButton));
  if(!restored){setMockData({offlineWorkoutEnabled:true,activeWorkoutDraft:null,routines:[],mesocycles:[]});act(()=>tree.update(React.createElement(ActiveWorkoutTabButton)));}
  press(tree.root.findAll(node=>typeof node.props.onPress==='function')[0]);
  expect(mockRouter.navigate).toHaveBeenCalledWith('/train');
});
