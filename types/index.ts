export type UserProfile = 'rodaja' | 'brisas';

export type MuscleGroup =
  | 'pecho'
  | 'espalda'
  | 'cuadriceps'
  | 'femorales'
  | 'gemelos'
  | 'hombros'
  | 'bíceps'
  | 'tríceps'
  | 'core'
  | 'glúteos'
  | 'trapecio'
  | 'antebrazos'
  | 'aductores'
  | 'abductores'
  | 'dorsales'
  | 'fullBody';

export type ExerciseVariant = string;

export type SetType = 'C' | 'F' | number;

export interface CatalogSet {
  id: string;
  tipo: SetType;
  weight: number;
  reps: number;
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
}

export interface ExerciseCatalog {
  version: 1;
  variants: ExerciseVariant[];
  exercises: Exercise[];
}

export interface RoutineSet extends CatalogSet {
  completed?: boolean;
}

export type ExerciseSet = RoutineSet;

export interface RoutineExercise {
  id: string;
  catalogExerciseId?: string;
  name: string;
  muscleGroups: MuscleGroup[];
  loadMode?: ExerciseLoadMode;
  loadUnit?: LoadUnit;
  attribution?: MuscleAttribution;
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

export type ShareStatus = 'pending' | 'accepted' | 'rejected';

export interface SharedRoutineDoc {
  id: string;
  sharedBy: UserProfile;
  sharedWith: UserProfile;
  status: ShareStatus;
  routine: {
    name: string;
    muscleGroups: MuscleGroup[];
    exercises: RoutineExercise[];
  };
  createdAt: number;
  updatedAt: number;
}

export type ShareNotificationType =
  | 'routine_share'
  | 'routine_accepted'
  | 'routine_rejected';

export interface ShareNotification {
  from: UserProfile;
  to: UserProfile;
  type: ShareNotificationType;
  shareId: string;
  routineName: string;
  message: string;
  title: string;
  createdAt: number;
  delivered: boolean;
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
  sets: CompletedSet[];
}

export interface WorkoutSession {
  id: string;
  routineId: string;
  routineName: string;
  completedAt: string;
  durationSeconds: number;
  restTimerSeconds: number;
  exercises: CompletedExercise[];
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
  readonly sets: readonly AttemptSetSnapshot[];
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

export interface RewardApplication {
  readonly id: string;
  readonly state: 'pending' | 'applied';
  readonly appliedAt?: string;
}

export interface WorkoutAttempt {
  readonly version: typeof WORKOUT_ATTEMPT_VERSION;
  readonly id: string;
  readonly owner: UserProfile;
  readonly routineId: string | null;
  readonly recordedRoutineName: string;
  readonly completedAt: string;
  readonly durationSeconds: number;
  readonly restTimerSeconds: number;
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
}

export type ThemeDecoration = 'star' | 'moon' | 'sun' | 'leaf' | 'snowflake';
export type ShopThemeCategory = 'profile' | 'basic' | 'violet' | 'special';

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
