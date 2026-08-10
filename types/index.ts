import type { AvatarId } from '../constants/avatars';

export type UserId = string;
export type LegacyAlias = 'rodaja' | 'brisas';
// Firebase-only features still use these aliases until their own migration work unit.
export type UserProfile = UserId;

export type MuscleGroup = string;

export type ExerciseVariant = string;

export type SetType = 'C' | 'F' | number;

export type EffortTarget =
  | { kind: 'rir'; value: 0 | 1 | 2 | 3 | 4 | 5 }
  | { kind: 'rpe'; value: 6 | 7 | 8 | 9 | 10 };

export interface CatalogSet {
  id: string;
  tipo: SetType;
  weight: number;
  reps: number;
  /** Groups contiguous physical sets as one backoff prescription. */
  backoffGroupId?: string;
  /** Optional intensity target for this physical set. */
  effortTarget?: EffortTarget;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroups: MuscleGroup[];
  loadMode?: ExerciseLoadMode;
  loadUnit?: LoadUnit;
  attribution?: MuscleAttribution;
  variant: ExerciseVariant;
  defaultSets: CatalogSet[];
  catalog?: {
    movementPattern: string | null;
    equipment: string | null;
    muscleParticipations: CatalogMuscleParticipation[];
  };
}

export interface CatalogMuscleParticipation {
  muscleGroupId: MuscleGroup;
  role: 'Principal' | 'Secundario';
  relevance: number;
  originalLabel: string;
}

export interface ExerciseCatalog {
  version: 1;
  variants: ExerciseVariant[];
  exercises: Exercise[];
}

export type DefinitionSource =
  | { kind: 'system' }
  | { kind: 'custom'; owner: UserId; originId: string };

export interface ExerciseDefinition {
  id: string;
  source: DefinitionSource;
  name: string;
  muscleGroups: MuscleGroup[];
  loadMode: ExerciseLoadMode;
  loadUnit: LoadUnit;
  variant: ExerciseVariant;
  defaultSets: CatalogSet[];
}

export interface ExerciseDefinitionSnapshot {
  id: string;
  name: string;
  muscleGroups: MuscleGroup[];
  loadMode: ExerciseLoadMode;
  loadUnit: LoadUnit;
  variant: ExerciseVariant;
}

export interface CatalogLibrary {
  version: 2;
  owner: UserId;
  definitions: ExerciseDefinition[];
  routines: Routine[];
  mesocycles: Mesocycle[];
  attempts: WorkoutAttempt[];
}

export interface CatalogImportPlan {
  recipient: UserId;
  definitions: ExerciseDefinition[];
  routines: Routine[];
  mesocycles: Mesocycle[];
}

export interface CatalogImportResult {
  library: CatalogLibrary;
  definitionReplacements: Record<string, string>;
  routineReplacements: Record<string, string>;
  mesocycleReplacements: Record<string, string>;
}

export interface RoutineSet extends CatalogSet {
  completed?: boolean;
}

export type ExerciseSet = RoutineSet;

export interface RoutineExercise {
  id: string;
  catalogExerciseId?: string;
  definitionId?: string;
  definitionSnapshot?: ExerciseDefinitionSnapshot;
  name: string;
  muscleGroups: MuscleGroup[];
  loadMode?: ExerciseLoadMode;
  loadUnit?: LoadUnit;
  attribution?: MuscleAttribution;
  /** Catalog dimensions copied into completed attempts for stable analytics. */
  catalog?: Exercise['catalog'];
  variant: ExerciseVariant;
  sets: RoutineSet[];
}

export interface Routine {
  id: string;
  name: string;
  muscleGroups: MuscleGroup[];
  exercises: RoutineExercise[];
  createdAt: string;
  isShared?: boolean;
  shareId?: string;
}

/** Current lifecycle states introduced by the mesocycle rebuild. */
export const MESOCYCLE_STATUSES = ['draft', 'scheduled', 'active', 'completed', 'paused', 'cancelled'] as const;
export type CurrentMesocycleStatus = typeof MESOCYCLE_STATUSES[number];

/**
 * Legacy persisted-model status. This stays separate until the screen rebuild
 * moves all existing consumers to `CurrentMesocycleStatus`.
 */
export type MesocycleStatus = 'draft' | 'active' | 'completed' | 'archived';

export type PlannedSessionRoutineSource = 'local' | 'shared';

export interface PlannedSessionRef {
  routineId: string;
  routineName: string;
  source: PlannedSessionRoutineSource;
  shareId?: string;
}

export interface PlannedSession {
  id: string;
  ref: PlannedSessionRef;
  /** Immutable prescription captured when this calendar slot is created. */
  routineSnapshot?: Routine;
  dayLabel?: string;
  order: number;
  progressionNote?: string;
  note?: string;
}

export type MesocycleEntry = PlannedSession | { id: string; kind: 'rest' };

export interface MesocycleWeek {
  id: string;
  weekNumber: number;
  entries: MesocycleEntry[];
}

export interface Mesocycle {
  id: string;
  name: string;
  goal: string;
  status: MesocycleStatus;
  weeks: MesocycleWeek[];
  durationWeeks: number;
  startDate?: string;
  createdAt: string;
}

export interface ProfilePlanLibrary {
  routines: Routine[];
  mesocycles: Mesocycle[];
}

export interface PrivatePlanShareRequest {
  id: string;
  senderAlias: string;
  senderAvatarId: AvatarId;
  senderFrameId?: string;
  senderTitleId?: string;
  senderThemeId: string | null;
  contentKind: 'routine' | 'mesocycle';
  snapshot: ProfilePlanLibrary & { mesocycle?: Mesocycle };
  createdAt: string;
}

export interface PrivatePlanShareImport {
  routineIds: string[];
  mesocycleId: string | null;
}

export interface CompletedSet {
  setId: string;
  weight: number;
  reps: number;
  completed: boolean;
}

export interface CompletedExercise {
  exerciseId: string;
  catalogExerciseId?: string;
  name: string;
  muscleGroupIds?: MuscleGroup[];
  sets: CompletedSet[];
}

export interface WorkoutSession {
  id: string;
  routineId: string;
  routineName: string;
  completedAt: string;
  durationSeconds: number;
  restTimerSeconds: number;
  lineage?: WorkoutLineage;
  recapPublicationKey?: string;
  exercises: CompletedExercise[];
}

export interface WorkoutRecapInput {
  routineName: string;
  completedAt: string;
  durationSeconds: number;
  exerciseCount: number;
  metrics: Record<string, number>;
  exercises: WorkoutRecapExercise[];
  sharePayload?: WorkoutRecapSharePayload;
  caption?: string;
}

export interface WorkoutRecapExercise {
  name: string;
  muscleGroupIds: MuscleGroup[];
  sets: Array<{ weight: number; reps: number; completed: boolean }>;
}

export interface WorkoutRecap {
  id: string;
  authorId?: string;
  authorAlias: string;
  authorAvatarId: string;
  authorThemeId: string | null;
  authorFrameId?: string;
  authorTitleId?: string;
  routineName: string;
  completedAt: string;
  durationSeconds: number;
  exerciseCount: number;
  muscleGroupIds: MuscleGroup[];
  muscleDistribution?: Array<{ id: MuscleGroup; value: number }>;
  reactionCount?: number;
  commentCount?: number;
  viewerHasReacted?: boolean;
  metrics: Record<string, number>;
  caption: string | null;
  createdAt: string;
  templateAvailable: boolean;
  mesocycleAvailable: boolean;
  isAuthor: boolean;
}

export interface WorkoutRecapDetail extends WorkoutRecap {
  exercises: WorkoutRecapExercise[];
  sharePayload: WorkoutRecapSharePayload | null;
  reactionCount: number;
  viewerHasReacted: boolean;
  comments: WorkoutRecapComment[];
  previousComparable: { id: string; completedAt: string; durationSeconds: number; exerciseCount: number; metrics: Record<string, number> } | null;
}

export interface WorkoutRecapComment {
  id: string;
  authorAlias: string;
  authorAvatarId: string;
  authorThemeId: string | null;
  body: string;
  createdAt: string;
  isAuthor: boolean;
}

export interface WorkoutRecapReactionState {
  reacted: boolean;
  reactionCount: number;
}

export interface WorkoutRecapSharePayload {
  version: 1;
  routine?: {
    name: string;
    muscleGroups: MuscleGroup[];
    exercises: Array<{
      name: string;
      muscleGroups: MuscleGroup[];
      loadMode: ExerciseLoadMode;
      loadUnit: LoadUnit;
      variant: ExerciseVariant;
      sets: Array<Pick<CatalogSet, 'tipo' | 'weight' | 'reps' | 'effortTarget'> & { backoffGroup?: number }>;
    }>;
  };
  mesocycle?: {
    name: string;
    goal: string;
    durationWeeks: number;
    weeks: Array<Array<{ routineIndex: number; dayLabel?: string } | null>>;
    routines: NonNullable<WorkoutRecapSharePayload['routine']>[];
  };
  performedSets?: Array<{ exerciseIndex: number; sets: Array<{ weight: number; reps: number; completed: boolean }> }>;
}

export interface WorkoutRecapPage {
  recaps: WorkoutRecap[];
  nextCursor: string | null;
}

export interface ActiveWorkoutDraft {
  version: 1;
  owner: UserId;
  attemptId: string;
  routineId: string;
  startedAtMs: number;
  restTimerSeconds: number;
  completedSets: Record<string, boolean>;
  setValues: Record<string, { weight: string; reps: string }>;
  restEndsAtMs?: number;
  /** Optional pause metadata; omitted fields keep version-1 drafts backwards compatible. */
  pausedAtMs?: number;
  pausedDurationMs?: number;
  pausedRestRemainingSeconds?: number;
  lineage?: WorkoutLineage;
  jointWorkoutId?: string;
  /** Session-local prescription. Existing drafts without it are migrated on resume. */
  routineSnapshot?: Routine;
}

export const WORKOUT_ATTEMPT_VERSION = 1 as const;

export type WorkoutAttemptStatus = 'partial' | 'completed' | 'fully-completed';
export type ExerciseLoadMode = 'external-load' | 'bodyweight' | 'assisted';
export type LoadUnit = 'kg' | 'lb';

export interface MuscleAttribution {
  primary: MuscleGroup;
  secondary: readonly MuscleGroup[];
  weights?: Partial<Readonly<Record<MuscleGroup, number>>>;
}

export type SetPerformance =
  | { mode: 'external-load'; reps: number; load: number; unit: LoadUnit }
  | { mode: 'bodyweight'; reps: number; bodyweight: number; unit: LoadUnit }
  | { mode: 'assisted'; reps: number; assistance: number; unit: LoadUnit };

export interface AttemptSetPlan {
  readonly id: string;
  readonly type: SetType;
  readonly targetReps?: number;
  readonly targetLoad?: number;
  readonly backoffGroupId?: string;
  readonly effortTarget?: EffortTarget;
}

export interface AttemptSetResult {
  readonly setId: string;
  readonly performed: boolean;
  readonly performance: SetPerformance | null;
}

export interface AttemptSetSnapshot {
  readonly plan: AttemptSetPlan;
  readonly result: AttemptSetResult;
}

export interface AttemptExerciseSnapshot {
  readonly exerciseId: string | null;
  readonly recordedName: string;
  readonly attribution: MuscleAttribution | null;
  /** Frozen catalog dimensions. Older attempts intentionally omit these. */
  readonly catalog?: {
    readonly movementPattern: string | null;
    readonly muscleParticipations: readonly CatalogMuscleParticipation[];
  };
  readonly sets: readonly AttemptSetSnapshot[];
}

export type AnthropometricMetricType =
  | 'body_weight'
  | 'height'
  | 'neck'
  | 'shoulders'
  | 'chest'
  | 'waist'
  | 'hips'
  | 'biceps_relaxed'
  | 'biceps_flexed'
  | 'forearm'
  | 'thigh'
  | 'calf';

export type AnthropometricUnit = 'kg' | 'cm';

export interface BodyMetric {
  readonly id: string;
  readonly owner: UserId;
  readonly metricType: AnthropometricMetricType;
  readonly value: number;
  readonly unit: AnthropometricUnit;
  readonly measuredAt: string;
  readonly source: 'manual';
  readonly notes?: string;
}

export interface AttemptCompletion {
  readonly validSets: number;
  readonly plannedSets: number;
  readonly adherence: number;
  readonly displayPercent: number;
  readonly status: WorkoutAttemptStatus;
}

export interface AttemptReward {
  readonly setGems: number;
  readonly completionGems: number;
  readonly fullCompletionBonus: number;
  readonly totalGems: number;
  readonly qualifiesForCompletion: boolean;
}

export interface AttemptFinalization {
  readonly completion: AttemptCompletion;
  readonly reward: AttemptReward;
}

export interface RewardReceiptEntry {
  readonly kind: string;
  readonly amount: number;
  readonly breakdown: Record<string, unknown>;
}

export interface RewardReceipt {
  readonly balance: number;
  readonly entries: readonly RewardReceiptEntry[];
  readonly weekly: { readonly target?: number; readonly completed?: number };
  readonly mesocycle?: { readonly next?: string };
}

export type TrainingRank = 'Principiante' | 'Intermedio' | 'Avanzado' | 'GymBro' | 'GymRat' | 'G-Boom' | 'Alfa' | 'Sigma';

export interface ExperienceProgress {
  readonly level: number;
  readonly rank: TrainingRank;
  readonly xpIntoLevel: number;
  readonly xpForNextLevel: number;
  readonly totalXp: number;
}

export interface ExperienceReceipt {
  readonly attemptId: string;
  readonly earnedXp: number;
  readonly entries: readonly RewardReceiptEntry[];
  readonly progress: ExperienceProgress;
}

export type CommunityActivityKind =
  | 'rank_up'
  | 'personal_record'
  | 'mesocycle_completed'
  | 'mesocycle_perfect_week'
  | 'weekly_goal'
  | 'weekly_streak'
  | 'first_joint_workout'
  | 'joint_workout_completed'
  | 'weekly_volume_record'
  | 'monthly_volume_record'
  | 'monthly_consistency'
  | 'muscle_balance_improved';

export interface CommunityActivityIdentity {
  readonly id: string;
  readonly kind: CommunityActivityKind;
  readonly authorAlias: string;
  readonly authorAvatarId: AvatarId;
  readonly authorFrameId?: string;
  readonly authorTitleId?: string;
  readonly authorThemeId: string | null;
  readonly createdAt: string;
}

export interface CommunityRankUpActivity extends CommunityActivityIdentity {
  readonly kind: 'rank_up';
  readonly level: number;
  readonly rank: TrainingRank;
  readonly unlockedFrameId?: string;
  readonly unlockedTitleId?: string;
}

export interface CommunityMilestoneActivity extends CommunityActivityIdentity {
  readonly kind: Exclude<CommunityActivityKind, 'rank_up'>;
  /** The server projection contains only display-safe milestone aggregates. */
  readonly payload: Readonly<Record<string, string | number>>;
}

export type CommunityActivity = CommunityRankUpActivity | CommunityMilestoneActivity;

export interface CommunityActivityPage {
  readonly activities: readonly CommunityActivity[];
  readonly nextCursor: string | null;
}

export interface RewardApplication {
  readonly id: string;
  readonly state: 'pending' | 'applied';
  readonly appliedAt?: string;
}

export interface WorkoutLineage {
  readonly mesocycleId: string;
  readonly weekNumber: number;
  readonly plannedSessionId: string;
}

export interface WorkoutAttempt {
  readonly version: typeof WORKOUT_ATTEMPT_VERSION;
  readonly id: string;
  readonly owner: UserId;
  readonly routineId: string | null;
  readonly recordedRoutineName: string;
  readonly completedAt: string;
  readonly durationSeconds: number;
  readonly restTimerSeconds: number;
  readonly lineage?: WorkoutLineage;
  readonly recapPublicationKey?: string;
  /** A joint completion is represented by its single server-owned group post, never a standalone recap. */
  readonly jointWorkoutId?: string;
  readonly exercises: readonly AttemptExerciseSnapshot[];
  readonly completion: AttemptCompletion;
  readonly reward: AttemptReward;
  readonly rewardApplication: RewardApplication;
}

export interface AppTheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string[];
  glass: string;
  glassBorder: string;
  text: string;
  textMuted: string;
  onPrimary: string;
  success: string;
  blurTint: 'light' | 'dark';
  tabBarBackground: string;
  decoration?: ThemeDecoration;
  interaction?: ThemeInteraction;
  celebration?: ThemeCelebrationSpec;
}

export type ThemeDecoration = 'star' | 'moon' | 'sun' | 'leaf' | 'snowflake';
export type ShopThemeCategory = 'profile' | 'basic' | 'violet' | 'special';
export type ShopThemeRarity = 'common' | 'rare' | 'exclusive';
export type ThemeInteraction = 'set-celebration';
export type ThemeCelebrationShape = 'circle' | 'diamond' | 'bar';
export interface ThemeCelebrationSpec {
  duration: number;
  particleCount: number;
  spread: number;
  rise: number;
  rotation: number;
  flashScale: number;
  shape: ThemeCelebrationShape;
}

export interface WeeklyGoalState {
  bonusWeekKey: string | null;
  lastWeekWorkouts: number;
}

export interface ShopState {
  gems: number;
  rewardReceiptIds: string[];
  purchasedThemeIds: string[];
  equippedThemeId: string | null;
  combineWithPartner: boolean;
  weeklyGoal: WeeklyGoalState;
}
