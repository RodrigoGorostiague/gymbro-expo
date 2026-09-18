import React from 'react';
import { act } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, resetRuntimeHarness } from './helpers/runtimeHarness';
import { WorkoutCompletionFeedPreview } from '../components/WorkoutCompletionFeedPreview';
const mock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../services/workoutCompletionPreview', () => ({ getWorkoutCompletionPreview: mock.get }));
vi.mock('../hooks/useAnimationActivity', () => ({ useAnimationActivity: () => false }));
vi.mock('../components/WorkoutPublicationCard', () => ({ WorkoutPublicationCard: (props: any) => React.createElement('RecapPreview', props) }));
vi.mock('../components/CommunityMilestoneCard', () => ({ CommunityMilestoneCard: (props: any) => React.createElement('RecordPreview', props) }));
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
beforeEach(() => { resetRuntimeHarness(); mock.get.mockReset(); });
afterEach(() => { resetRuntimeHarness(); vi.useRealTimers(); });
test('queries exact session and previews real cards without engagement controls', async () => {
 mock.get.mockResolvedValue({ confirmed: true, status: 'published', recap: { id: 'recap-1' }, activities: [{ id: 'pr-1', kind: 'personal_record' }] });
 const tree = render(React.createElement(WorkoutCompletionFeedPreview, { attemptId: 'session-1' })); await flush();
 expect(mock.get).toHaveBeenCalledWith('session-1');
 act(() => tree.root.findAll((node) => String(node.type) === 'View' && !!node.props.onLayout)[0].props.onLayout({ nativeEvent: { layout: { width: 360 } } }));
 expect(tree.root.findByType('RecapPreview' as any).props).toMatchObject({ recap: { id: 'recap-1' }, preview: true });
 expect(tree.root.findByType('RecordPreview' as any).props).toMatchObject({ activity: { id: 'pr-1' }, preview: true });
});
test('pending publication refreshes and stops after confirmation', async () => {
 vi.useFakeTimers();
 mock.get.mockResolvedValueOnce({ confirmed: true, status: 'pending', recap: null, activities: [] }).mockResolvedValue({ confirmed: true, status: 'published', recap: { id: 'r' }, activities: [] });
 const tree = render(React.createElement(WorkoutCompletionFeedPreview, { attemptId: 's' })); await flush();
 expect(JSON.stringify(tree.toJSON())).toContain('pendiente');
 await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
 expect(mock.get).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
});
test.each(['private', 'removed', 'joint'])('%s does not fabricate an individual publication', async (status) => {
 mock.get.mockResolvedValue({ confirmed: true, status, recap: null, activities: [] });
 const tree = render(React.createElement(WorkoutCompletionFeedPreview, { attemptId: 's' })); await flush();
 expect(tree.root.findAllByType('RecapPreview' as any)).toHaveLength(0);
 expect(JSON.stringify(tree.toJSON())).not.toContain('Publicado en el feed');
});
test('request failures are retryable and do not masquerade as pending or private', async () => {
 mock.get.mockRejectedValue(new Error('Offline'));
 const tree = render(React.createElement(WorkoutCompletionFeedPreview, { attemptId: 's' })); await flush();
 expect(JSON.stringify(tree.toJSON())).toContain('No se pudieron consultar');
 expect(tree.root.findAllByProps({ accessibilityLabel: 'Actualizar publicaciones' }).length).toBeGreaterThan(0);
});
test('late response for a previous session cannot replace the current preview', async () => {
 let resolveOld!: (value: unknown) => void;
 mock.get.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValue({ confirmed: true, status: 'private', recap: null, activities: [] });
 const tree = render(React.createElement(WorkoutCompletionFeedPreview, { attemptId: 'old' }));
 act(() => tree.update(React.createElement(WorkoutCompletionFeedPreview, { attemptId: 'new' }))); await flush();
 await act(async () => resolveOld({ confirmed: true, status: 'published', recap: { id: 'old' }, activities: [] }));
 expect(JSON.stringify(tree.toJSON())).toContain('Solo vos');
 expect(JSON.stringify(tree.toJSON())).not.toContain('Publicado en el feed');
});
