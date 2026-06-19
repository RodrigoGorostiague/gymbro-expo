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
  | 'fullBody';

export type ExerciseVariant = 'mancuernas' | 'barra' | 'libre';

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
  variant: ExerciseVariant;
  defaultSets: CatalogSet[];
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
  purchasedThemeIds: string[];
  equippedThemeId: string | null;
  combineWithPartner: boolean;
  weeklyGoal: WeeklyGoalState;
}
