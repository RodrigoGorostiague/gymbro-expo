export type UserProfile = 'rodaja' | 'brisas';

export interface ExerciseSet {
  id: string;
  weight: number;
  reps: number;
}

export interface Exercise {
  id: string;
  name: string;
  sets: ExerciseSet[];
}

export interface Routine {
  id: string;
  name: string;
  exercises: Exercise[];
  createdAt: string;
}

export interface CompletedSet {
  setId: string;
  weight: number;
  reps: number;
  completed: boolean;
}

export interface CompletedExercise {
  exerciseId: string;
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
