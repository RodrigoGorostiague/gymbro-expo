import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(element: React.ReactElement) { let tree!: TestRenderer.ReactTestRenderer; act(() => { tree=TestRenderer.create(element); }); mounted.push(tree); return tree; }
function resetRuntimeHarness() { act(() => { mounted.splice(0).forEach((tree) => tree.unmount()); }); }
const findButton = (root: TestRenderer.ReactTestInstance, title: string) => root.find((node) => String(node.type) === 'GlassButton' && node.props.title === title);
const findText = (root: TestRenderer.ReactTestInstance, text: string) => root.findAll((node) => String(node.type) === 'Text' && node.children.join('') === text)[0];
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: 'rodaja' }) }));
vi.mock('../context/DataContext', () => ({ useData: () => ({ routines: [], mesocycles: [] }) }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { primary:'#AABBCC',text:'#fff',textMuted:'#ddd',glass:'#222',glassBorder:'#333',background:['#000','#111'] } }) }));
vi.mock('../components/UI', () => ({ GlassButton: (props: any) => React.createElement('GlassButton', props) }));
vi.mock('../components/HapticPressable', () => ({ HapticPressable: (props: any) => React.createElement('HapticPressable', props, props.children) }));
const mock = vi.hoisted(() => ({ get: vi.fn(), stage: vi.fn(), confirm: vi.fn(), load: vi.fn(), save: vi.fn(), profile: { autoShareCompletedWorkouts: true } }));
vi.mock('../context/SocialContext', () => ({ useSocial: () => ({ ownProfile: mock.profile }) }));
vi.mock('../services/workoutCompletionPreview', () => ({ getWorkoutCompletionPreview: mock.get, stageWorkoutCompletion: mock.stage, confirmWorkoutCompletion: mock.confirm }));
vi.mock('../services/workoutReviewSelection', () => ({ loadWorkoutReviewSelection: mock.load, saveWorkoutReviewSelection: mock.save }));
vi.mock('../components/WorkoutVictory', () => ({ WorkoutVictory: () => null }));
vi.mock('../components/WorkoutPublicationCard', () => ({ WorkoutPublicationCard: (props: any) => React.createElement('RecapCard', props) }));
vi.mock('../components/CommunityMilestoneCard', () => ({ CommunityMilestoneCard: (props: any) => React.createElement('RecordCard', props) }));
vi.mock('../components/AppThemeLoadingOverlay', () => ({ GymBroLoadingOverlay: (props: any) => React.createElement('LoginLoader', props) }));
import { WorkoutCompletionReview } from '../components/WorkoutCompletionReview';
import type { WorkoutSession } from '../types';
const session: WorkoutSession = { id: 's', routineId: 'r', routineName: 'Upper', recapPublicationKey: 'key-s', completedAt: '2026-09-17T10:00:00Z', durationSeconds: 60, restTimerSeconds: 30, exercises: [] };
const records = ['load','reps','volume'].map((type, index) => ({ activity: { id: `record-${index}`, kind: 'personal_record', createdAt: session.completedAt, authorAlias: 'A', authorAvatarId: 'capybara-athlete', authorThemeId: null, payload: { exercise_name: 'Press', variant: 'Barra', record_type: type, best_score: 60, previous_score: 50, score_unit: 'kg', partition: 8 } }, selected: false }));
const preview = { confirmed: true, status: 'review', reviewRequired: true, sharingEnabled: true, joint: false, records, recap: null, activities: [] };
const flush = async () => { await act(async () => { for (let i=0;i<12;i++) await Promise.resolve(); }); };
const checkbox = (tree: ReturnType<typeof render>, index: number) => tree.root.findAll((node) => String(node.type) === 'HapticPressable' && node.props.accessibilityRole === 'checkbox')[index];
beforeEach(() => { resetRuntimeHarness(); vi.clearAllMocks(); mock.get.mockResolvedValue(preview); mock.stage.mockResolvedValue(true); mock.load.mockResolvedValue(null); mock.save.mockResolvedValue(undefined); mock.confirm.mockResolvedValue({ ...preview, reviewRequired: false, status: 'published' }); });
afterEach(() => { resetRuntimeHarness(); vi.restoreAllMocks(); });
test('shows every record unselected, with no audience or optional workout toggle', async () => {
 const tree = render(React.createElement(WorkoutCompletionReview, { session, onDone: vi.fn() })); await flush();
 expect(findText(tree.root, 'Lograste 3 récords')).toBeTruthy();
 expect([0,1,2].map((index) => checkbox(tree,index).props.accessibilityState.checked)).toEqual([false,false,false]);
 expect(JSON.stringify(tree.toJSON())).not.toMatch(/audiencia|Terminar sin publicar|Seleccionar destino/);
 expect(mock.confirm).not.toHaveBeenCalled();
 expect(mock.stage).toHaveBeenCalledWith('s', expect.objectContaining({ routineName: 'Upper' }), 'key-s');
});
test('persists chosen IDs and publishes only after explicit confirmation using login loader', async () => {
 let finish!: (value: unknown) => void;
 mock.confirm.mockImplementation(() => new Promise((resolve) => { finish=resolve; }));
 const onDone = vi.fn(); const tree = render(React.createElement(WorkoutCompletionReview, { session, onDone })); await flush();
 act(() => checkbox(tree,1).props.onPress()); await flush();
 expect(mock.save).toHaveBeenLastCalledWith('rodaja','s',{ ids:['record-1'],submitted:false });
 act(() => findButton(tree.root,'Confirmar y publicar').props.onPress()); await flush();
 expect(mock.confirm).toHaveBeenCalledWith('s',['record-1']);
 expect(tree.root.findByType('LoginLoader' as any).props.visible).toBe(true);
 expect(onDone).not.toHaveBeenCalled();
 await act(async () => { finish({ ...preview, reviewRequired:false }); });
 expect(onDone).toHaveBeenCalledOnce();
});
test('zero chosen records still confirms the automatic workout publication', async () => {
 const tree = render(React.createElement(WorkoutCompletionReview,{session,onDone:vi.fn()})); await flush();
 act(() => findButton(tree.root,'Confirmar y publicar').props.onPress()); await flush();
 expect(mock.confirm).toHaveBeenCalledWith('s',[]);
});
test('privacy off adds no override or record selection and still finishes', async () => {
 mock.get.mockResolvedValue({ ...preview,sharingEnabled:false });
 const tree = render(React.createElement(WorkoutCompletionReview,{session,onDone:vi.fn()})); await flush();
 expect(mock.stage).not.toHaveBeenCalled();
 expect(tree.root.findAll((node) => node.props.accessibilityRole === 'checkbox')).toHaveLength(0);
 act(() => findButton(tree.root,'Finalizar').props.onPress()); await flush();
 expect(mock.confirm).toHaveBeenCalledWith('s',[]);
});
test('restores selection and ambiguous submission; retry cannot silently change records', async () => {
 mock.load.mockResolvedValue({ids:['record-2'],submitted:true}); mock.confirm.mockRejectedValue(new Error('lost response'));
 const tree = render(React.createElement(WorkoutCompletionReview,{session,onDone:vi.fn()})); await flush();
 expect(checkbox(tree,2).props.accessibilityState).toMatchObject({checked:true,disabled:true});
 act(() => findButton(tree.root,'Reintentar publicación').props.onPress()); await flush();
 expect(mock.confirm).toHaveBeenCalledWith('s',['record-2']);
 expect(tree.root.findByType('LoginLoader' as any).props.visible).toBe(false);
});
test('preparation failure cannot publish', async () => {
 mock.get.mockRejectedValue(new Error('offline'));
 const tree = render(React.createElement(WorkoutCompletionReview,{session,onDone:vi.fn()})); await flush();
 expect(findButton(tree.root,'Preparando…').props.disabled).toBe(true);
 expect(mock.confirm).not.toHaveBeenCalled();
});

test('rapid confirm taps dispatch one immutable command', async () => {
 let finish!: (value: unknown) => void;
 mock.confirm.mockImplementation(() => new Promise((resolve) => { finish=resolve; }));
 const onDone = vi.fn(); const tree = render(React.createElement(WorkoutCompletionReview, { session, onDone })); await flush();
 act(() => { const button=findButton(tree.root,'Confirmar y publicar'); button.props.onPress(); button.props.onPress(); }); await flush();
 expect(mock.confirm).toHaveBeenCalledOnce();
 await act(async () => { finish({ ...preview, reviewRequired:false }); });
 expect(onDone).toHaveBeenCalledOnce();
});
test('leaving during local persistence prevents a stale publication request', async () => {
 let saved!: () => void;
 mock.save.mockImplementation(() => new Promise<void>((resolve) => { saved=resolve; }));
 const onDone=vi.fn(); const tree=render(React.createElement(WorkoutCompletionReview,{session,onDone})); await flush();
 act(() => findButton(tree.root,'Confirmar y publicar').props.onPress());
 act(() => tree.unmount());
 await act(async () => { saved(); });
 expect(mock.confirm).not.toHaveBeenCalled();
 expect(onDone).not.toHaveBeenCalled();
});
