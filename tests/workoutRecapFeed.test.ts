import { describe, expect, test, vi } from 'vitest';
import { WorkoutSession } from '../types';

const client = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: { getSession: vi.fn() },
  realtime: { setAuth: vi.fn() },
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('../services/supabase', () => ({ supabase: client, supabaseConfigurationError: null }));

import { createWorkoutRecap, createWorkoutRecapComment, getWorkoutRecapDetail, getWorkoutRecapPage, recapImportPlan, recapInputFromSession, recapSharePayload, setWorkoutRecapReaction, subscribeToWorkoutRecapChanges } from '../services/workoutRecapFeed';
import { createCatalogLibrary, planRecipientImport } from '../utils/catalogLibrary';

const session: WorkoutSession = {
  id: 'local-session', routineId: 'local-routine', routineName: 'Upper', completedAt: '2026-08-01T10:00:00Z', durationSeconds: 3600, restTimerSeconds: 0,
  exercises: [{ exerciseId: 'local-exercise', name: 'Bench', muscleGroupIds: ['pecho', 'tríceps'], sets: [{ setId: 'local-set', weight: 100, reps: 5, completed: true }] }],
};

describe('workout recap feed boundary', () => {
  test('maps completed sessions to immutable exercise and set results without local identifiers', () => {
    expect(recapInputFromSession(session, '  Nice work  ')).toEqual({
      routineName: 'Upper', completedAt: '2026-08-01T10:00:00Z', durationSeconds: 3600, exerciseCount: 1, metrics: { volume: 500 }, exercises: [{ name: 'Bench', muscleGroupIds: ['pecho', 'tríceps'], sets: [{ weight: 100, reps: 5, completed: true }] }], caption: 'Nice work',
    });
    expect(JSON.stringify(recapInputFromSession(session))).not.toContain('local-session');
    expect(JSON.stringify(recapInputFromSession(session))).not.toContain('local-set');
  });

  test('uses protected RPCs and maps only their feed projection', async () => {
    client.rpc.mockResolvedValueOnce({ data: 'recap-1', error: null }).mockResolvedValueOnce({
      data: { recaps: [{ id: 'recap-1', author_alias: 'Bro', author_avatar_id: 'capybara-mark', author_theme_id: 'profile-brisas', routine_name: 'Upper', completed_at: '2026-08-01T10:00:00Z', duration_seconds: 3600, exercise_count: 1, muscle_group_ids: ['pecho'], muscle_distribution: [{ id: 'pecho', value: 1 }], metrics: { volume: 500 }, caption: null, created_at: '2026-08-01T10:01:00Z', is_author: true }], next_cursor: 'next' }, error: null,
    }).mockResolvedValueOnce({ data: { 'recap-1': { reaction_count: 2, viewer_has_reacted: true } }, error: null });
    await createWorkoutRecap(recapInputFromSession(session), 'publication-key');
    await expect(getWorkoutRecapPage()).resolves.toEqual({ recaps: [{ id: 'recap-1', authorAlias: 'Bro', authorAvatarId: 'capybara-mark', authorThemeId: 'profile-brisas', routineName: 'Upper', completedAt: '2026-08-01T10:00:00Z', durationSeconds: 3600, exerciseCount: 1, muscleGroupIds: ['pecho'], muscleDistribution: [{ id: 'pecho', value: 1 }], reactionCount: 2, commentCount: 0, viewerHasReacted: true, metrics: { volume: 500 }, caption: null, createdAt: '2026-08-01T10:01:00Z', templateAvailable: false, mesocycleAvailable: false, isAuthor: true }], nextCursor: 'next' });
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'create_workout_recap', { input: { routine_name: 'Upper', completed_at: '2026-08-01T10:00:00Z', duration_seconds: 3600, exercise_count: 1, metrics: { volume: 500 }, exercise_details: { exercises: [{ name: 'Bench', muscle_group_ids: ['pecho', 'tríceps'], sets: [{ weight: 100, reps: 5, completed: true }] }] }, publication_key: 'publication-key' } });
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'list_workout_recaps', { cursor: null, page_size: 20 });
    expect(client.rpc).toHaveBeenNthCalledWith(3, 'get_workout_recap_reaction_states', { recap_ids: ['recap-1'] });
  });

  test('publishes the recap summary when optional sharing metadata is rejected', async () => {
    client.rpc.mockClear();
    const input = {
      ...recapInputFromSession(session),
      sharePayload: { version: 1 as const, routine: { name: 'Upper', muscleGroups: ['pecho'], exercises: [{ name: 'Bench', muscleGroups: ['pecho'], loadMode: 'external-load' as const, loadUnit: 'kg' as const, variant: 'barbell', sets: [{ tipo: 'C' as const, weight: 100, reps: 5 }] }] } },
    };
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid recap share payload' } })
      .mockResolvedValueOnce({ data: 'recap-summary', error: null });

    await expect(createWorkoutRecap(input, 'publication-key')).resolves.toBe('recap-summary');
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'create_workout_recap', expect.objectContaining({ input: expect.objectContaining({ share_payload: input.sharePayload }) }));
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'create_workout_recap', {
      input: expect.not.objectContaining({ share_payload: expect.anything() }),
    });
    expect(client.rpc.mock.calls[1][1].input).toMatchObject({ routine_name: 'Upper', publication_key: 'publication-key' });
  });

  test('maps the protected detail projection and safely handles older recaps without details', async () => {
    client.rpc.mockResolvedValueOnce({
      data: { id: 'recap-1', author_profile_id: 'member-2', author_alias: 'Bro', routine_name: 'Upper', completed_at: '2026-08-01T10:00:00Z', duration_seconds: 3600, exercise_count: 1, muscle_group_ids: ['pecho'], metrics: {}, caption: null, created_at: '2026-08-01T10:01:00Z', previous_comparable: { id: 'recap-0', completed_at: '2026-07-25T10:00:00Z', duration_seconds: 3000, exercise_count: 1, metrics: { volume: 400 } }, exercises: [{ name: 'Bench', muscle_group_ids: ['pecho'], sets: [{ weight: 80, reps: 8, completed: true }] }] }, error: null,
    }).mockResolvedValueOnce({
      data: { id: 'old-recap', author_alias: 'Bro', routine_name: 'Upper', completed_at: '2026-08-01T10:00:00Z', duration_seconds: 3600, exercise_count: 1, metrics: {}, caption: null, created_at: '2026-08-01T10:01:00Z' }, error: null,
    });

    await expect(getWorkoutRecapDetail('recap-1')).resolves.toMatchObject({ authorId: 'member-2', previousComparable: { id: 'recap-0', metrics: { volume: 400 } }, exercises: [{ name: 'Bench', muscleGroupIds: ['pecho'], sets: [{ weight: 80, reps: 8, completed: true }] }] });
    await expect(getWorkoutRecapDetail('old-recap')).resolves.toMatchObject({ muscleGroupIds: [], exercises: [] });
    expect(client.rpc).toHaveBeenLastCalledWith('get_workout_recap_detail', { recap_id: 'old-recap' });
  });

  test('uses protected recap engagement RPCs and accepts only safe response projections', async () => {
    client.rpc.mockClear();
    client.rpc.mockResolvedValueOnce({ data: { reacted: true, reaction_count: 3 }, error: null })
      .mockResolvedValueOnce({ data: { id: 'comment-1', author_alias: 'Bro', author_avatar_id: 'capybara-mark', author_theme_id: null, body: 'Great work!', created_at: '2026-08-04T10:00:00Z', is_author: true }, error: null });
    await expect(setWorkoutRecapReaction('recap-1', true)).resolves.toEqual({ reacted: true, reactionCount: 3 });
    await expect(createWorkoutRecapComment('recap-1', '  Great work!  ')).resolves.toMatchObject({ id: 'comment-1', body: 'Great work!', isAuthor: true });
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'set_workout_recap_reaction', { recap_id: 'recap-1', reacted: true });
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'create_workout_recap_comment', { recap_id: 'recap-1', body_input: 'Great work!' });
  });

  test('rejects blank or oversized comments before a remote mutation', async () => {
    await expect(createWorkoutRecapComment('recap-1', '   ')).rejects.toThrow('between 1 and 500');
    await expect(createWorkoutRecapComment('recap-1', 'x'.repeat(501))).rejects.toThrow('between 1 and 500');
  });

  test('builds an idempotent local import plan without exposing author-local identifiers', () => {
    const payload = { version: 1 as const, routine: { name: 'Upper', muscleGroups: ['pecho'], exercises: [{ name: 'Bench', muscleGroups: ['pecho'], loadMode: 'external-load' as const, loadUnit: 'kg' as const, variant: 'barbell', sets: [{ tipo: 'C' as const, weight: 80, reps: 8 }] }] } };
    const plan = recapImportPlan('recap-1', 'recipient-1', payload);
    expect(plan.routines[0].id).toBe('recap:recap-1:routine:0');
    expect(plan.definitions[0].source).toEqual({ kind: 'custom', owner: 'recipient-1', originId: 'recap:recap-1:definition:0:0' });
    expect(JSON.stringify(plan)).not.toContain('local-session');
  });

  test('accepts a mesocycle payload without optional labels or performed-set payload and imports its complete graph', async () => {
    const routine = { name: 'Upper', muscleGroups: ['pecho'], exercises: [{ name: 'Bench', muscleGroups: ['pecho'], loadMode: 'external-load' as const, loadUnit: 'kg' as const, variant: 'barbell', sets: [{ tipo: 'C' as const, weight: 80, reps: 8 }] }] };
    const payload = { version: 1 as const, routine, mesocycle: { name: 'Strength block', goal: 'Build strength', durationWeeks: 2, routines: [routine], weeks: [[{ routineIndex: 0 }], [null, { routineIndex: 0 }]] } };
    client.rpc.mockResolvedValueOnce({ data: { id: 'recap-1', author_alias: 'Bro', routine_name: 'Upper', completed_at: '2026-08-01T10:00:00Z', duration_seconds: 1, exercise_count: 1, muscle_group_ids: ['pecho'], metrics: {}, caption: null, created_at: '2026-08-01T10:01:00Z', share_payload: payload }, error: null });

    const recap = await getWorkoutRecapDetail('recap-1');
    expect(recap?.sharePayload).toEqual(payload);
    const plan = recapImportPlan('recap-1', 'recipient-1', recap!.sharePayload!, true);
    expect(plan.routines).toHaveLength(1);
    expect(plan.mesocycles).toMatchObject([{ name: 'Strength block', status: 'draft', durationWeeks: 2 }]);
    expect(plan.mesocycles[0]).not.toHaveProperty('startDate');
    expect(plan.mesocycles[0].weeks[1].entries).toHaveLength(2);
  });

  test('normalizes legacy muscle labels before atomically importing a mesocycle', () => {
    const routine = { id: 'routine-1', name: 'Upper', muscleGroups: ['Pecho', 'Espalda'], createdAt: '', exercises: [{ id: 'exercise-1', name: 'Bench', muscleGroups: ['Pecho'], loadMode: 'external-load' as const, loadUnit: 'kg' as const, variant: 'barbell', sets: [{ id: 'set-1', tipo: 'C' as const, weight: 80, reps: 8 }] }] };
    const mesocycle = { id: 'mesocycle-1', name: 'Block', goal: '', status: 'active' as const, durationWeeks: 1, createdAt: '', weeks: [{ id: 'week-1', weekNumber: 1, entries: [{ id: 'entry-1', order: 1, ref: { routineId: routine.id, routineName: routine.name, source: 'local' as const } }] }] };
    const payload = recapSharePayload({ ...session, routineId: routine.id, lineage: { mesocycleId: mesocycle.id, weekNumber: 1, plannedSessionId: 'entry-1' } }, routine, mesocycle, [routine], { shareRoutineTemplate: true, shareMesocycleTemplate: true, sharePerformedSetDetails: false });

    expect(payload?.mesocycle?.routines[0].muscleGroups).toEqual(['pecho', 'espalda']);
    expect(payload?.mesocycle?.routines[0].exercises[0].muscleGroups).toEqual(['pecho']);
    const result = planRecipientImport(createCatalogLibrary('recipient-1'), recapImportPlan('recap-1', 'recipient-1', payload!, true));
    expect(result.library.routines).toHaveLength(1);
    expect(result.library.mesocycles).toHaveLength(1);
  });

  test('captures a mesocycle snapshot from its planned routine when the live library no longer has it', () => {
    const routine = { id: 'routine-1', name: 'Upper', muscleGroups: ['pecho'], createdAt: '', exercises: [{ id: 'exercise-1', name: 'Bench', muscleGroups: ['pecho'], loadMode: 'external-load' as const, loadUnit: 'kg' as const, variant: 'barbell', sets: [{ id: 'set-1', tipo: 'C' as const, weight: 80, reps: 8 }] }] };
    const mesocycle = { id: 'mesocycle-1', name: 'Block', goal: '', status: 'active' as const, durationWeeks: 1, createdAt: '', weeks: [{ id: 'week-1', weekNumber: 1, entries: [{ id: 'entry-1', order: 1, ref: { routineId: routine.id, routineName: routine.name, source: 'local' as const }, routineSnapshot: routine }] }] };
    const payload = recapSharePayload({ ...session, routineId: routine.id, lineage: { mesocycleId: mesocycle.id, weekNumber: 1, plannedSessionId: 'entry-1' } }, routine, mesocycle, [], { shareRoutineTemplate: true, shareMesocycleTemplate: true, sharePerformedSetDetails: true });

    expect(payload?.mesocycle?.routines).toHaveLength(1);
    expect(payload?.mesocycle?.routines[0].name).toBe('Upper');
    expect(payload?.performedSets?.[0].sets).toEqual([{ weight: 100, reps: 5, completed: true }]);
  });

  test('drops malformed server template payloads instead of rendering or importing them', async () => {
    client.rpc.mockResolvedValueOnce({ data: { id: 'recap-1', author_alias: 'Bro', routine_name: 'Upper', completed_at: '2026-08-01T10:00:00Z', duration_seconds: 1, exercise_count: 1, metrics: {}, caption: null, created_at: '2026-08-01T10:01:00Z', share_payload: { version: 1, routine: { name: 'Upper', muscleGroups: [], exercises: [{ name: 'Bench', muscleGroups: [], loadMode: 'external-load', loadUnit: 'kg', variant: 'barbell', sets: [null] }] } } }, error: null });
    await expect(getWorkoutRecapDetail('recap-1')).resolves.toMatchObject({ sharePayload: null });
  });

  test('drops unknown top-level keys and malformed optional template sections', async () => {
    const routine = { name: 'Upper', muscleGroups: ['pecho'], exercises: [{ name: 'Bench', muscleGroups: ['pecho'], loadMode: 'external-load', loadUnit: 'kg', variant: 'barbell', sets: [{ tipo: 'C', weight: 80, reps: 8 }] }] };
    const detail = (share_payload: unknown) => ({ id: 'recap-1', author_alias: 'Bro', routine_name: 'Upper', completed_at: '2026-08-01T10:00:00Z', duration_seconds: 1, exercise_count: 1, metrics: {}, caption: null, created_at: '2026-08-01T10:01:00Z', share_payload });
    client.rpc.mockResolvedValueOnce({ data: detail({ version: 1, routine, privateMetadata: true }), error: null })
      .mockResolvedValueOnce({ data: detail({ version: 1, routine, mesocycle: { name: 'Plan', goal: '', durationWeeks: 1, routines: [routine], weeks: [[{ routineIndex: 1 }]] } }), error: null })
      .mockResolvedValueOnce({ data: detail({ version: 1, routine, performedSets: [{ exerciseIndex: 0, sets: [{ weight: Infinity, reps: 1, completed: true }] }] }), error: null });
    await expect(getWorkoutRecapDetail('recap-1')).resolves.toMatchObject({ sharePayload: null });
    await expect(getWorkoutRecapDetail('recap-2')).resolves.toMatchObject({ sharePayload: null });
    await expect(getWorkoutRecapDetail('recap-3')).resolves.toMatchObject({ sharePayload: null });
  });

  test('treats authorized Realtime changes as invalidation only and cleans up', async () => {
    const handlers: Array<() => void> = [];
    const channel = { on: vi.fn((_type, _filter, handler) => { handlers.push(handler); return channel; }), subscribe: vi.fn(() => channel) };
    client.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'member-1' }, access_token: 'token' } }, error: null });
    client.channel.mockReturnValue(channel);
    const invalidate = vi.fn();
    const unsubscribe = await subscribeToWorkoutRecapChanges(invalidate);
    handlers[0]();
    expect(invalidate).toHaveBeenCalledOnce();
    expect(client.channel).toHaveBeenCalledWith('workout-recap-feed:member-1');
    unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
