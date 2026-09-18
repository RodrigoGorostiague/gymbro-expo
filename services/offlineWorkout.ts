import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActiveWorkoutDraft } from '../types';
import { withTimeout } from '../utils/withTimeout';
import { parseTrainingFinalization } from './trainingState';
import { supabase } from './supabase';
import type { finalizeTrainingAttempt } from './trainingState';

export type FinalizedWorkout = Awaited<ReturnType<typeof finalizeTrainingAttempt>>;
export type OfflineStatus = 'unavailable' | 'saved' | 'pending' | 'syncing' | 'conflict' | 'blocked' | 'local-error';
export type WorkoutJournal = {
  version: 1; owner: string; cancelled?: true; sequence: number; acknowledged: number;
  base: ActiveWorkoutDraft; draft: ActiveWorkoutDraft;
  transport?: 'offline' | 'online';
  claim?: ActiveWorkoutDraft;
  outstanding?: Pick<WorkoutJournal, 'base' | 'draft' | 'sequence' | 'cancelled' | 'transport'>;
};
const ownerWrites = new Map<string, Promise<void>>();
const key = (owner: string) => `gymbro:offline-workout:v1:${owner}`;
const confirmedKey = 'gymbro:offline-confirmed-owner:v1';
export const confirmOfflineOwner = (owner: string) => AsyncStorage.setItem(confirmedKey, owner);
export const forgetOfflineOwner = () => AsyncStorage.removeItem(confirmedKey);
export const isConfirmedOfflineOwner = async (owner: string) => await AsyncStorage.getItem(confirmedKey) === owner;

export function isTransportFailure(error: unknown): boolean {
  const cause = error as { code?: string; message?: string; name?: string };
  return !cause?.code && (cause?.name === 'AsyncTimeoutError' || /failed to fetch|fetch failed|network request failed|networkerror|network is offline/i.test(cause?.message ?? ''));
}
export class OfflineWorkoutError extends Error {
  constructor(public readonly status: OfflineStatus, message: string) { super(message); }
}
export function validOfflineDraft(value: unknown, owner: string): value is ActiveWorkoutDraft {
  const draft = value as ActiveWorkoutDraft | null;
  return !!draft && draft.transportMode !== 'online' && draft.version === 1 && draft.owner === owner && typeof draft.attemptId === 'string'
    && !!draft.attemptId && typeof draft.routineId === 'string' && !draft.jointWorkoutId && !draft.jointCancellationPending
    && Number.isFinite(draft.startedAtMs) && Number.isFinite(draft.restTimerSeconds)
    && !!draft.completedSets && typeof draft.completedSets === 'object' && !!draft.setValues && typeof draft.setValues === 'object'
    && !!draft.routineSnapshot && draft.routineSnapshot.id === draft.routineId
    && typeof draft.routineSnapshot.name === 'string' && Array.isArray(draft.routineSnapshot.exercises)
    && draft.routineSnapshot.exercises.every((exercise) => !!exercise && typeof exercise.id === 'string' && Array.isArray(exercise.sets))
    && (!draft.pendingFinalization || (draft.pendingFinalization.attempt?.id === draft.attemptId
      && draft.pendingFinalization.attempt.owner === owner && !draft.pendingFinalization.attempt.jointWorkoutId));
}
/** Online drafts share the durable journal, but cannot use its offline RPC. */
export function validWorkoutDraft(value: unknown, owner: string): value is ActiveWorkoutDraft {
  const draft = value as ActiveWorkoutDraft | null;
  if (draft?.transportMode !== 'online') return validOfflineDraft(value, owner);
  if (draft.jointCancellationPending || (draft.jointWorkoutId !== undefined && (typeof draft.jointWorkoutId !== 'string' || !draft.jointWorkoutId))) return false;
  return validOfflineDraft({ ...draft, transportMode: undefined, jointWorkoutId: undefined, jointCancellationPending: undefined,
    pendingFinalization: draft.pendingFinalization ? { ...draft.pendingFinalization,
      attempt: { ...draft.pendingFinalization.attempt, jointWorkoutId: undefined } } : undefined }, owner);
}
export async function claimOnlineWorkout(expected: ActiveWorkoutDraft): Promise<ActiveWorkoutDraft> {
  if (!supabase) throw new OfflineWorkoutError('blocked', 'Se requiere conexión para entrenar en grupo.');
  const { data, error } = await withTimeout(supabase.rpc('claim_online_workout', { expected_draft: expected }), 12_000, 'Online workout claim');
  if (error) throw error;
  if (data?.status === 'conflict') throw new OfflineWorkoutError('conflict', 'El entrenamiento cambió en otro dispositivo. Sincronizá antes de invitar.');
  if (data?.status !== 'claimed' || !validWorkoutDraft(data.draft, expected.owner)
    || data.draft.transportMode !== 'online' || data.draft.attemptId !== expected.attemptId) {
    throw new OfflineWorkoutError('blocked', 'La confirmación del modo compartido no es válida.');
  }
  return data.draft;
}
export async function loadWorkoutJournal(owner: string): Promise<WorkoutJournal | null> {
  const raw = await AsyncStorage.getItem(key(owner));
  if (!raw) return null;
  let value: WorkoutJournal;
  try { value = JSON.parse(raw); } catch { throw new OfflineWorkoutError('local-error', 'El guardado local está dañado. No se eliminó.'); }
  if (!value || typeof value !== 'object' || (value.cancelled !== undefined && value.cancelled !== true) || value.sequence < 0 || value.acknowledged < 0 || value.version !== 1 || value.owner !== owner || !Number.isSafeInteger(value.sequence)
    || !Number.isSafeInteger(value.acknowledged) || value.acknowledged > value.sequence
    || !validWorkoutDraft(value.base, owner) || !validWorkoutDraft(value.draft, owner)
    || (value.transport !== undefined && value.transport !== 'offline' && value.transport !== 'online')
    || (value.transport === 'online') !== (value.draft.transportMode === 'online')
    || (value.claim && (!validWorkoutDraft(value.claim, owner) || value.claim.attemptId !== value.draft.attemptId))
    || (value.outstanding && (!validWorkoutDraft(value.outstanding.base, owner) || !validWorkoutDraft(value.outstanding.draft, owner)
      || (value.outstanding.transport === 'online') !== (value.outstanding.draft.transportMode === 'online')
      || value.outstanding.draft.attemptId !== value.draft.attemptId || value.outstanding.base.attemptId !== value.draft.attemptId
      || !Number.isSafeInteger(value.outstanding.sequence) || value.outstanding.sequence > value.sequence
      || value.outstanding.sequence < value.acknowledged || (value.outstanding.cancelled !== undefined && value.outstanding.cancelled !== true)))
    || value.base.attemptId !== value.draft.attemptId) throw new OfflineWorkoutError('local-error', 'El guardado local no es válido. No se eliminó.');
  return value;
}
export async function offlineWorkoutAvailable(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await withTimeout(supabase.rpc('offline_workout_capability'), 8_000, 'Offline capability');
  if (error?.code === 'PGRST202' || error?.code === '42883') return false;
  if (error) throw error;
  return data === 1;
}
export type SyncResult = { draft: ActiveWorkoutDraft | null; finalized?: FinalizedWorkout; cancelled?: true };
export async function syncWorkoutJournal(journal: WorkoutJournal): Promise<SyncResult> {
  if (!supabase) throw new OfflineWorkoutError('blocked', 'Se requiere autenticación.');
  const { data, error } = await supabase.rpc(journal.transport === 'online' ? 'sync_online_workout' : 'sync_offline_workout', {
    expected_draft: journal.base, next_draft: journal.cancelled ? null : journal.draft,
    attempt_input: journal.draft.pendingFinalization?.attempt ?? null,
  });
  if (error?.code === 'PGRST202' || error?.code === '42883') throw new OfflineWorkoutError('blocked', 'El servidor aún no admite sincronización offline. El guardado local se conserva.');
  if (error) throw error;
  if (data?.status === 'conflict') throw new OfflineWorkoutError('conflict', 'El entrenamiento cambió en otro dispositivo. El guardado local se conserva; no se sobrescribió el servidor.');
  if (data?.status !== 'saved') throw new OfflineWorkoutError('blocked', 'La confirmación del servidor no es válida. El guardado local se conserva.');
  if (data.cancelled === true && journal.cancelled) return { draft: null, cancelled: true };
  if (data.finalized) {
    const result = parseTrainingFinalization(data.finalized);
    if (result.attempt.owner !== journal.owner || result.attempt.routineId !== journal.draft.routineId
      || (result.attempt.id !== journal.draft.attemptId && (!journal.draft.lineage
        || result.attempt.lineage?.mesocycleId !== journal.draft.lineage.mesocycleId
        || result.attempt.lineage?.weekNumber !== journal.draft.lineage.weekNumber
        || result.attempt.lineage?.plannedSessionId !== journal.draft.lineage.plannedSessionId))) {
      throw new OfflineWorkoutError('blocked', 'La confirmación no corresponde a este entrenamiento.');
    }
    return { draft: null, finalized: result };
  }
  if (!validWorkoutDraft(data.draft, journal.owner) || data.draft.attemptId !== journal.draft.attemptId) throw new OfflineWorkoutError('blocked', 'La confirmación del borrador no es válida.');
  return { draft: data.draft };
}

/** One serialized local record. Remote acknowledgments advance only the sent sequence. */
export class OfflineWorkoutJournal {
  current: WorkoutJournal | null = null;
  status: OfflineStatus = 'saved';
  error: string | null = null;
  private writes = Promise.resolve();
  private localSaveFailed = false;
  private flight: Promise<FinalizedWorkout | undefined> | null = null;
  constructor(readonly owner: string, private readonly active: () => boolean,
    private readonly changed: () => void, private readonly send = syncWorkoutJournal) {}
  private notify(status: OfflineStatus, error: string | null = null) {
    if (this.localSaveFailed && status !== 'local-error') { status = 'local-error'; error = this.error; }
    this.status = status; this.error = error; if (this.active()) this.changed();
  }
  private write<T>(operation: () => Promise<T>): Promise<T> {
    const next = (ownerWrites.get(this.owner) ?? Promise.resolve()).then(async () => {
      if (!this.active()) throw new OfflineWorkoutError('blocked', 'La cuenta cambió.');
      try { return await operation(); } catch (error) {
        if (error instanceof OfflineWorkoutError) { this.notify(error.status, error.message); throw error; }
        this.localSaveFailed = true;
        this.notify('local-error', 'No se pudo guardar en este dispositivo. No cierres la app; reintenta.'); throw error;
      }
    });
    this.writes = next.then(() => undefined, () => undefined);
    const tail = this.writes;
    ownerWrites.set(this.owner, tail);
    void tail.then(() => { if (ownerWrites.get(this.owner) === tail) ownerWrites.delete(this.owner); });
    return next;
  }
  connectionFailed(error: unknown) {
    if (this.current?.transport === 'online') this.notify('blocked', error instanceof Error ? error.message : 'El entrenamiento compartido requiere conexión.');
  }
  async restore() {
    return this.write(async () => {
      const restored = await loadWorkoutJournal(this.owner);
      if (!this.active()) return null;
      this.current = restored;
      if (this.current) this.notify(this.current.claim || this.current.outstanding || this.current.draft.pendingFinalization || this.current.sequence > this.current.acknowledged ? 'pending' : 'saved');
      return this.current;
    });
  }
  get hasPendingWork(): boolean {
    const current = this.current;
    return this.localSaveFailed || !!this.flight || !!current && (!!current.cancelled
      || !!current.outstanding || !!current.claim || !!current.draft.pendingFinalization
      || current.sequence !== current.acknowledged);
  }
  /** Adopt only the clean journal observed before the remote read began. */
  async reconcileRemote(draft: ActiveWorkoutDraft | null, observed = this.current, canAdopt = () => true): Promise<boolean> {
    return this.write(async () => {
      if (this.current !== observed || this.hasPendingWork || !canAdopt()) return false;
      if (draft && !validWorkoutDraft(draft, this.owner)) return false;
      const next: WorkoutJournal | null = draft
        ? { version: 1, owner: this.owner, base: draft, draft, sequence: 0, acknowledged: 0, transport: draft.transportMode === 'online' ? 'online' : 'offline' }
        : null;
      if (next) await AsyncStorage.setItem(key(this.owner), JSON.stringify(next));
      else await AsyncStorage.removeItem(key(this.owner));
      if (!this.active()) return false;
      if (!canAdopt()) {
        // A keystroke arrived during storage I/O. Keep its original CAS base;
        // never silently rebase that unseen edit onto the newer server draft.
        if (observed) await AsyncStorage.setItem(key(this.owner), JSON.stringify(observed));
        else await AsyncStorage.removeItem(key(this.owner));
        return false;
      }
      this.current = next;
      this.notify(draft?.pendingFinalization ? 'pending' : 'saved');
      return true;
    });
  }
  async seed(draft: ActiveWorkoutDraft) {
    return this.write(async () => {
      if (this.current) return;
      if (!validWorkoutDraft(draft, this.owner)) throw new Error('El borrador no admite guardado offline.');
      const journal: WorkoutJournal = { version: 1, owner: this.owner, base: draft, draft, sequence: 0, acknowledged: 0, transport: draft.transportMode === 'online' ? 'online' : 'offline' };
      await AsyncStorage.setItem(key(this.owner), JSON.stringify(journal));
      if (!this.active()) throw new OfflineWorkoutError('blocked', 'La cuenta cambió.');
      this.current = journal; this.localSaveFailed = false; this.notify(draft.pendingFinalization ? 'pending' : 'saved');
    });
  }
  /** Claim intent is durable before dispatch; no old offline command changes route. */
  async claimOnline(): Promise<ActiveWorkoutDraft> {
    if (this.flight) throw new OfflineWorkoutError('blocked', 'Esperá a que termine la sincronización.');
    return this.write(async () => {
      const current = this.current;
      if (!current || current.cancelled || current.outstanding || current.sequence !== current.acknowledged
        || current.draft.pendingFinalization) throw new OfflineWorkoutError('blocked', 'Sincronizá los cambios antes de entrenar en grupo.');
      const pending = { ...current, claim: current.claim ?? current.draft };
      await AsyncStorage.setItem(key(this.owner), JSON.stringify(pending));
      if (!this.active()) throw new OfflineWorkoutError('blocked', 'La cuenta cambió.');
      this.current = pending;
      this.notify('syncing');
      let draft: ActiveWorkoutDraft;
      try { draft = await claimOnlineWorkout(pending.claim); }
      catch (error) {
        this.notify(error instanceof OfflineWorkoutError ? error.status : 'blocked', 'No se pudo confirmar el modo compartido. Los datos locales se conservan.');
        throw new OfflineWorkoutError(this.status, this.error!);
      }
      if (!this.active()) throw new OfflineWorkoutError('blocked', 'La cuenta cambió.');
      const next: WorkoutJournal = { ...current, base: draft, draft, claim: undefined, transport: 'online' };
      await AsyncStorage.setItem(key(this.owner), JSON.stringify(next));
      if (!this.active()) throw new OfflineWorkoutError('blocked', 'La cuenta cambió.');
      this.current = next; this.localSaveFailed = false; this.notify('saved');
      return draft;
    });
  }
  async update(draft: ActiveWorkoutDraft) {
    return this.write(async () => {
      const current = this.current;
      if (!current || current.cancelled || current.claim || !validWorkoutDraft(draft, this.owner) || draft.attemptId !== current.draft.attemptId || draft.transportMode !== current.draft.transportMode) throw new Error('El borrador local no coincide.');
      if (current.draft.pendingFinalization && JSON.stringify(draft.pendingFinalization) !== JSON.stringify(current.draft.pendingFinalization)) throw new Error('El resultado pendiente no se puede modificar.');
      if (current.transport === 'online' && (this.status === 'blocked' || this.status === 'conflict')) throw new OfflineWorkoutError(this.status, 'Se requiere conexión y sincronización antes de continuar.');
      const next = { ...current, draft, sequence: current.sequence + 1 };
      await AsyncStorage.setItem(key(this.owner), JSON.stringify(next));
      if (!this.active()) throw new OfflineWorkoutError('blocked', 'La cuenta cambió.');
      this.current = next;
      this.localSaveFailed = false;
      this.notify(this.status === 'conflict' || this.status === 'blocked' ? this.status : 'pending', this.status === 'local-error' ? null : this.error);
    });
  }
  async cancel() {
    return this.write(async () => {
      if (!this.current || this.current.draft.pendingFinalization) throw new Error('El resultado pendiente debe sincronizarse antes de cancelar.');
      const next: WorkoutJournal = { ...this.current, cancelled: true, sequence: this.current.sequence + 1 };
      await AsyncStorage.setItem(key(this.owner), JSON.stringify(next));
      if (!this.active()) return;
      this.current = next; this.localSaveFailed = false; this.notify('pending');
    });
  }
  sync(): Promise<FinalizedWorkout | undefined> {
    if (this.flight) return this.flight;
    if (this.current?.claim) return this.claimOnline().then(() => undefined);
    const operation = (async () => {
      await this.writes;
      if (!this.current || !this.active()) return;
      try {
        // Persist the exact transport command before dispatch; newer edits remain successors.
        await this.write(async () => {
          if (!this.current || this.current.outstanding) return;
          const { base, draft, sequence, cancelled, transport } = this.current;
          const next = { ...this.current, outstanding: { base, draft, sequence, cancelled, transport } };
          await AsyncStorage.setItem(key(this.owner), JSON.stringify(next));
          if (!this.active()) throw new OfflineWorkoutError('blocked', 'La cuenta cambió.');
          this.current = next;
        });
        if (!this.active() || !this.current?.outstanding) return;
        const sent = { ...this.current, ...this.current.outstanding, cancelled: this.current.outstanding.cancelled, transport: this.current.outstanding.transport };
        this.notify('syncing');
        const result = await withTimeout(this.send(sent), 12_000, 'Offline workout sync');
        if (!this.active()) return;
        await this.write(async () => {
          if (result.finalized || result.cancelled) {
            await AsyncStorage.removeItem(key(this.owner));
            if (!this.active()) throw new OfflineWorkoutError('blocked', 'La cuenta cambió.');
            this.current = null;
          } else if (this.current && result.draft) {
            const next = { ...this.current, base: result.draft, acknowledged: sent.sequence, outstanding: undefined };
            await AsyncStorage.setItem(key(this.owner), JSON.stringify(next));
            if (!this.active()) throw new OfflineWorkoutError('blocked', 'La cuenta cambió.');
            this.current = next;
          }
        });
        this.notify(this.current && (this.current.draft.pendingFinalization || this.current.sequence > this.current.acknowledged) ? 'pending' : 'saved');
        return result.finalized;
      } catch (error) {
        if (this.status !== 'local-error') this.notify(error instanceof OfflineWorkoutError ? error.status : isTransportFailure(error) && this.current?.transport !== 'online' ? 'pending' : 'blocked',
          error instanceof Error ? error.message : 'No se pudo sincronizar. El guardado local se conserva.');
        throw error;
      }
    })();
    this.flight = operation.finally(() => { this.flight = null; });
    return this.flight;
  }
}
