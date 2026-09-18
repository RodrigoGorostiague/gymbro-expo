import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ActiveWorkoutDraft } from '../types';
const storage = vi.hoisted(() => ({ values: new Map<string,string>(), getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
vi.mock('../services/supabase', () => ({ supabase: { rpc } }));
import { OfflineWorkoutJournal, OfflineWorkoutError, isTransportFailure, loadWorkoutJournal, offlineWorkoutAvailable, syncWorkoutJournal } from '../services/offlineWorkout';
const draft = (): ActiveWorkoutDraft => ({version:1,owner:'owner',attemptId:'attempt',routineId:'r',startedAtMs:1,restTimerSeconds:30,completedSets:{},setValues:{'e-s':{weight:'20',reps:'8'}},routineSnapshot:{id:'r',name:'Routine',createdAt:'',muscleGroups:[],exercises:[]}});
const later = <T>() => { let resolve!: (value:T) => void; const promise = new Promise<T>((done)=>{resolve=done;});return {promise,resolve}; };
beforeEach(()=>{
  vi.clearAllMocks(); storage.values.clear();
  storage.getItem.mockImplementation(async(key)=>storage.values.get(key)??null);
  storage.setItem.mockImplementation(async(key,value)=>{storage.values.set(key,value);});
  storage.removeItem.mockImplementation(async(key)=>{storage.values.delete(key);});
});
describe('durable solo workout journal',()=>{
  test('restores exact inputs, timers and snapshot after restart without library data',async()=>{
    const first=new OfflineWorkoutJournal('owner',()=>true,()=>{});await first.seed(draft());
    await first.update({...draft(),restEndsAtMs:9876,setValues:{'e-s':{weight:'25.',reps:''}},completedSets:{'e-s':true}});
    const reopened=new OfflineWorkoutJournal('owner',()=>true,()=>{});await reopened.restore();
    expect(reopened.current?.draft).toEqual(first.current?.draft); expect(reopened.status).toBe('pending');
    expect(await loadWorkoutJournal('different-owner')).toBeNull();
  });
  test('acknowledges only sent sequence and retains edits entered during network request',async()=>{
    const wait=later<any>();const send=vi.fn(()=>wait.promise);
    const store=new OfflineWorkoutJournal('owner',()=>true,()=>{},send);await store.seed(draft());await store.update({...draft(),restTimerSeconds:40});
    const sync=store.sync();await Promise.resolve();await Promise.resolve();
    await store.update({...draft(),restTimerSeconds:50});
    wait.resolve({draft:{...draft(),restTimerSeconds:40}});await sync;
    expect(store.current).toMatchObject({sequence:2,acknowledged:1,base:{restTimerSeconds:40},draft:{restTimerSeconds:50}});
    expect(store.status).toBe('pending');
  });
  test('storage failure never acknowledges durability and retains the last durable record',async()=>{
    const store=new OfflineWorkoutJournal('owner',()=>true,()=>{});await store.seed(draft());
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    await expect(store.update({...draft(),restTimerSeconds:80})).rejects.toThrow('disk full');
    expect(store.status).toBe('local-error');expect((await loadWorkoutJournal('owner'))?.draft.restTimerSeconds).toBe(30);
    await store.update({...draft(),restTimerSeconds:80});expect(store.status).toBe('pending');
  });
  test('conflict retains local data and auth errors are blocked rather than offline success',async()=>{
    const send=vi.fn().mockRejectedValueOnce(new OfflineWorkoutError('conflict','conflict')).mockRejectedValueOnce({code:'42501',message:'forbidden'}).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const store=new OfflineWorkoutJournal('owner',()=>true,()=>{},send);await store.seed(draft());await store.update({...draft(),restTimerSeconds:60});
    for (const expected of ['conflict','blocked','pending']) {await expect(store.sync()).rejects.toBeDefined();expect(store.status).toBe(expected);expect(await loadWorkoutJournal('owner')).not.toBeNull();}
  });
  test('changing owner prevents queued dispatch and late acknowledgment from deleting journal',async()=>{
    let active=true;const wait=later<any>(),started=later<void>();const send=vi.fn(()=>{started.resolve();return wait.promise;});
    const store=new OfflineWorkoutJournal('owner',()=>active,()=>{},send);await store.seed(draft());
    const sync=store.sync();await started.promise;active=false;
    wait.resolve({finalized:{attempt:{id:'attempt'}}});await sync;
    expect(await loadWorkoutJournal('owner')).not.toBeNull();
    await expect(store.update(draft())).rejects.toThrow('cuenta');
    await store.sync();expect(send).toHaveBeenCalledTimes(1);
  });
  test('ambiguous finalization survives restart and retries the identical immutable attempt',async()=>{
    const attempt={id:'attempt',owner:'owner',routineId:'r'} as any;
    const send=vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({finalized:{attempt,receipt:{balance:2},experienceReceipt:{earnedXp:2}}});
    const store=new OfflineWorkoutJournal('owner',()=>true,()=>{},send);await store.seed(draft());
    await store.update({...draft(),pendingFinalization:{attempt}});await expect(store.sync()).rejects.toThrow();
    const reopened=new OfflineWorkoutJournal('owner',()=>true,()=>{},send);await reopened.restore();
    await expect(reopened.update({...draft(),pendingFinalization:{attempt:{...attempt,id:'other'}}})).rejects.toThrow();
    await reopened.sync();expect(send.mock.calls[0][0].draft.pendingFinalization).toEqual(send.mock.calls[1][0].draft.pendingFinalization);
    expect(await loadWorkoutJournal('owner')).toBeNull();
  });
  test('corrupted persisted journal is retained and reported, not deleted',async()=>{
    storage.values.set('gymbro:offline-workout:v1:owner','invalid json');
    await expect(loadWorkoutJournal('owner')).rejects.toThrow('dañado');expect(storage.removeItem).not.toHaveBeenCalled();
  });
  test('missing deployed capability leaves legacy paths available without blind journal fallback',async()=>{
    rpc.mockResolvedValue({error:{code:'PGRST202'}});expect(await offlineWorkoutAvailable()).toBe(false);
    const store=new OfflineWorkoutJournal('owner',()=>true,()=>{});await store.seed(draft());
    await expect(syncWorkoutJournal(store.current!)).rejects.toMatchObject({status:'blocked'});
    expect(rpc.mock.calls.map(([name])=>name)).not.toContain('save_training_state');
  });
  test('classifies transport narrowly and retains authorization metadata',()=>{
    expect(isTransportFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isTransportFailure({code:'42501',message:'network request failed'})).toBe(false);
    expect(isTransportFailure(new Error('invalid attempt'))).toBe(false);
  });
  test('cancellation is durable across restart and removes the journal only after confirmation', async()=>{
    const send=vi.fn(async(_journal: unknown)=>({draft:null,cancelled:true as const}));
    const first=new OfflineWorkoutJournal('owner',()=>true,()=>{},send);await first.seed(draft());await first.cancel();
    const reopened=new OfflineWorkoutJournal('owner',()=>true,()=>{},send);await reopened.restore();
    expect(reopened.current?.cancelled).toBe(true);await expect(reopened.update(draft())).rejects.toThrow();
    await reopened.sync();expect(await loadWorkoutJournal('owner')).toBeNull();expect(send.mock.calls[0][0]).toMatchObject({cancelled:true});
  });

  test.each([false,true])('replays lost-ACK command before newer edit/finalization after restart (%s)',async(finalizing)=>{
    let remote=draft();let lost=true;
    const send=vi.fn(async(command:any)=>{
      if(JSON.stringify(remote)!==JSON.stringify(command.base)&&JSON.stringify(remote)!==JSON.stringify(command.draft))throw new OfflineWorkoutError('conflict','stale');
      remote=command.draft;if(lost){lost=false;throw new TypeError('Failed to fetch');}
      return command.draft.pendingFinalization ? {draft:null,finalized:{attempt:command.draft.pendingFinalization.attempt} as any} : {draft:remote};
    });
    const first=new OfflineWorkoutJournal('owner',()=>true,()=>{},send);await first.seed(draft());await first.update({...draft(),restTimerSeconds:40});
    await expect(first.sync()).rejects.toThrow('fetch');
    const latest={...draft(),restTimerSeconds:50,...(finalizing?{pendingFinalization:{attempt:{id:'attempt',owner:'owner',routineId:'r'} as any}}:{})};
    await first.update(latest);
    const reopened=new OfflineWorkoutJournal('owner',()=>true,()=>{},send);await reopened.restore();
    await reopened.sync();expect(send.mock.calls[1][0].draft.restTimerSeconds).toBe(40);
    await reopened.sync();expect(remote).toEqual(latest);
    if(finalizing)expect(reopened.current).toBeNull();else expect(reopened.status).toBe('saved');
  });
  test('older transport ACK cannot clear a later failed local write',async()=>{
    const wait=later<any>(),started=later<void>();
    const store=new OfflineWorkoutJournal('owner',()=>true,()=>{},async()=>{started.resolve();return wait.promise;});
    await store.seed(draft());await store.update({...draft(),restTimerSeconds:40});const syncing=store.sync();await started.promise;
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    await expect(store.update({...draft(),restTimerSeconds:50})).rejects.toThrow('disk full');
    wait.resolve({draft:{...draft(),restTimerSeconds:40}});await syncing;
    expect(store.status).toBe('local-error');expect(store.error).toContain('No cierres');
    await store.update({...draft(),restTimerSeconds:50});expect(store.status).toBe('pending');
  });

});

describe('canonical cross-device reconciliation', () => {
  test('clean journal adopts remote progress and remote completion without sending stale data', async () => {
    const store = new OfflineWorkoutJournal('owner', () => true, () => {});
    await store.seed(draft());
    const remote = { ...draft(), restEndsAtMs: 54321, completedSets: { 'e-s': true } };
    expect(await store.reconcileRemote(remote)).toBe(true);
    expect(store.current?.draft).toEqual(remote);
    expect(store.current?.base).toEqual(remote);
    expect(await store.reconcileRemote(null)).toBe(true);
    expect(store.current).toBeNull();
    expect(await loadWorkoutJournal('owner')).toBeNull();
  });

  test('remote response cannot replace local edits queued after the read started', async () => {
    const store = new OfflineWorkoutJournal('owner', () => true, () => {});
    await store.seed(draft());
    const observed = store.current;
    const edit = store.update({ ...draft(), restTimerSeconds: 50 });
    const reconcile = store.reconcileRemote(null, observed);
    await edit;
    expect(await reconcile).toBe(false);
    expect(store.current?.draft.restTimerSeconds).toBe(50);
  });

  test.each(['cancelled', 'pendingFinalization', 'outstanding'] as const)('preserves %s intent even when remote has no draft', async (intent) => {
    const store = new OfflineWorkoutJournal('owner', () => true, () => {}, async () => { throw new TypeError('Failed to fetch'); });
    await store.seed(draft());
    if (intent === 'cancelled') await store.cancel();
    else if (intent === 'pendingFinalization') await store.update({ ...draft(), pendingFinalization: { attempt: { id: 'attempt', owner: 'owner' } as any } });
    else await expect(store.sync()).rejects.toThrow();
    expect(await store.reconcileRemote(null)).toBe(false);
    expect(store.current).not.toBeNull();
  });

  test('inactive account cannot adopt a network response', async () => {
    let active = true;
    const store = new OfflineWorkoutJournal('owner', () => active, () => {});
    await store.seed(draft());
    active = false;
    await expect(store.reconcileRemote(null)).rejects.toThrow('cuenta');
    expect(await loadWorkoutJournal('owner')).not.toBeNull();
  });
});

test('an edit arriving during remote storage adoption keeps the original CAS base', async () => {
  const store = new OfflineWorkoutJournal('owner', () => true, () => {});
  await store.seed(draft());
  const observed = store.current;
  const gate = later<void>();
  const began = later<void>();
  let unchanged = true;
  storage.setItem.mockImplementationOnce(async (key, value) => { began.resolve(); await gate.promise; storage.values.set(key, value); });
  const adopting = store.reconcileRemote({ ...draft(), restTimerSeconds: 99 }, observed, () => unchanged);
  await began.promise;
  unchanged = false;
  const edit = store.update({ ...draft(), setValues: { 'e-s': { weight: '30', reps: '8' } } });
  gate.resolve();
  expect(await adopting).toBe(false);
  await edit;
  expect(store.current?.base).toEqual(draft());
  expect(store.current?.draft.setValues['e-s'].weight).toBe('30');
});

describe('explicit online workout transport', () => {
  test('claims only acknowledged solo state, persists mode, and routes new commands online', async () => {
    rpc.mockImplementation(async (name: string, input: any) => name === 'claim_online_workout'
      ? { data: { status: 'claimed', draft: { ...input.expected_draft, transportMode: 'online' } } }
      : { data: { status: 'saved', draft: input.next_draft } });
    const journal = new OfflineWorkoutJournal('owner', () => true, () => {});
    await journal.seed(draft());
    const claimed = await journal.claimOnline();
    expect(claimed.transportMode).toBe('online');
    await journal.update({ ...claimed, jointWorkoutId: 'canonical-group', restTimerSeconds: 90 });
    await journal.sync();
    expect(rpc).toHaveBeenLastCalledWith('sync_online_workout', expect.objectContaining({
      expected_draft: claimed,
      next_draft: expect.objectContaining({ jointWorkoutId: 'canonical-group' }),
    }));
    const restored = await loadWorkoutJournal('owner');
    expect(restored?.transport).toBe('online');
    expect(restored?.draft.jointWorkoutId).toBe('canonical-group');
  });
  test('old ambiguous offline command is never reinterpreted as online', async () => {
    const send = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementation(async (command) => ({ draft: command.draft }));
    const journal = new OfflineWorkoutJournal('owner', () => true, () => {}, send);
    await journal.seed(draft());
    await journal.update({ ...draft(), restTimerSeconds: 60 });
    await expect(journal.sync()).rejects.toThrow();
    await expect(journal.claimOnline()).rejects.toThrow('Sincronizá');
    expect(rpc).not.toHaveBeenCalled();
    await journal.sync();
    expect(send.mock.calls[1][0].transport).toBe('offline');
    expect(send.mock.calls[1][0].outstanding).toEqual(send.mock.calls[0][0].outstanding);
  });
  test('lost claim response survives restart and locks writes until exact claim retry succeeds', async () => {
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementation(async (_name: string, input: any) => ({
      data: { status: 'claimed', draft: { ...input.expected_draft, transportMode: 'online' } },
    }));
    const first = new OfflineWorkoutJournal('owner', () => true, () => {});
    await first.seed(draft());
    await expect(first.claimOnline()).rejects.toThrow();
    const reopened = new OfflineWorkoutJournal('owner', () => true, () => {});
    await reopened.restore();
    await expect(reopened.update({ ...draft(), restTimerSeconds: 70 })).rejects.toThrow();
    await reopened.sync();
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(reopened.current?.transport).toBe('online');
    expect(reopened.current?.claim).toBeUndefined();
  });
  test('online network loss blocks further edits and preserves exact outstanding command', async () => {
    const claimed = { ...draft(), transportMode: 'online' as const, jointWorkoutId: 'group' };
    const send = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementation(async (command) => ({ draft: command.draft }));
    const journal = new OfflineWorkoutJournal('owner', () => true, () => {}, send);
    await journal.seed(claimed);
    await journal.update({ ...claimed, restTimerSeconds: 60 });
    await expect(journal.sync()).rejects.toThrow();
    expect(journal.status).toBe('blocked');
    await expect(journal.update({ ...claimed, restTimerSeconds: 80 })).rejects.toThrow('conexión');
    expect((await loadWorkoutJournal('owner'))?.draft.restTimerSeconds).toBe(60);
    await journal.sync();
    expect(send.mock.calls[1][0].outstanding).toEqual(send.mock.calls[0][0].outstanding);
  });
  test('clean adoption carries remote online mode while dirty local edits retain offline route', async () => {
    const remote = { ...draft(), transportMode: 'online' as const, jointWorkoutId: 'group' };
    const journal = new OfflineWorkoutJournal('owner', () => true, () => {});
    await journal.seed(draft());
    expect(await journal.reconcileRemote(remote)).toBe(true);
    expect(journal.current?.transport).toBe('online');
    const dirty = new OfflineWorkoutJournal('other', () => true, () => {});
    await dirty.seed({ ...draft(), owner: 'other' });
    await dirty.update({ ...draft(), owner: 'other', restTimerSeconds: 60 });
    expect(await dirty.reconcileRemote({ ...remote, owner: 'other' })).toBe(false);
    expect(dirty.current?.transport).toBe('offline');
    expect(dirty.current?.draft.restTimerSeconds).toBe(60);
  });
  test('account change during claim never publishes the late claim into active memory', async () => {
    let active = true;
    const started = later<void>(), response = later<any>();
    rpc.mockImplementation(() => { started.resolve(); return response.promise; });
    const journal = new OfflineWorkoutJournal('owner', () => active, () => {});
    await journal.seed(draft());
    const claim = journal.claimOnline();
    await started.promise;
    active = false;
    response.resolve({ data: { status: 'claimed', draft: { ...draft(), transportMode: 'online' } } });
    await expect(claim).rejects.toThrow('cuenta');
    expect((await loadWorkoutJournal('owner'))?.claim).toEqual(draft());
    expect(journal.current?.transport).toBe('offline');
  });
});
