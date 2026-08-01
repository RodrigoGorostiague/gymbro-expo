import { CatalogMuscleParticipation, Exercise } from '../types';
import { supabase, supabaseConfigurationError } from './supabase';

export type CatalogParticipationMode = 'primary_only' | 'primary_and_secondary' | 'all_roles';

export interface CatalogMuscleGroup {
  id: string;
  name: string;
  type: string;
  level: number;
  visibleInFilters: boolean;
  displayName: string;
  path: string;
}

type CatalogExerciseRow = {
  exercise_id: string;
  canonical_name: string;
  movement_pattern: string | null;
  equipment: string | null;
  muscle_group_ids: string[];
  primary_muscle_group_ids: string[];
  muscle_participations?: CatalogMuscleParticipationRow[];
};

type CatalogMuscleParticipationRow = {
  muscle_group_id: string;
  role: 'Principal' | 'Secundario';
  relevance: number;
  original_label: string;
};

type CatalogMuscleGroupRow = {
  id: string;
  name: string;
  type: string;
  level: number;
  visible_in_filters: boolean;
  display_name: string;
  path: string;
};

type CatalogFilterRow = CatalogExerciseRow & {
  matched_muscle_group_id: string;
  matched_muscle_name: string;
  role: string;
  relevance: number;
};

function requireCatalogClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'El catálogo remoto no está configurado.');
  return supabase;
}

function toExercise(row: CatalogExerciseRow): Exercise {
  const muscleParticipations = (row.muscle_participations ?? []).map((participation) => ({
    muscleGroupId: participation.muscle_group_id,
    role: participation.role,
    relevance: participation.relevance,
    originalLabel: participation.original_label,
  }));
  return {
    id: row.exercise_id,
    name: row.canonical_name,
    muscleGroups: row.muscle_group_ids,
    attribution: { primary: row.primary_muscle_group_ids[0] ?? row.muscle_group_ids[0], secondary: row.muscle_group_ids.filter((id) => !row.primary_muscle_group_ids.includes(id)) },
    variant: row.equipment ?? 'Sin implemento',
    defaultSets: [],
    catalog: { movementPattern: row.movement_pattern, equipment: row.equipment, muscleParticipations },
  };
}

export async function loadCatalogMuscleGroups(): Promise<CatalogMuscleGroup[]> {
  const { data, error } = await requireCatalogClient().rpc('list_catalog_muscle_groups');
  if (error) throw new Error(`No se pudieron cargar los grupos musculares: ${error.message}`);
  return (data as CatalogMuscleGroupRow[] ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    level: row.level,
    visibleInFilters: row.visible_in_filters,
    displayName: row.display_name,
    path: row.path,
  }));
}

export async function loadCatalogExercises(): Promise<Exercise[]> {
  const { data, error } = await requireCatalogClient().rpc('list_catalog_exercises');
  if (error) throw new Error(`No se pudo cargar el catálogo: ${error.message}`);
  return (data as CatalogExerciseRow[] ?? []).map(toExercise);
}

export async function filterCatalogExercises(groupId: string, mode: CatalogParticipationMode): Promise<Exercise[]> {
  const { data, error } = await requireCatalogClient().rpc('list_catalog_exercises_by_muscle_group', {
    selected_group_id: groupId,
    participation_mode: mode,
  });
  if (error) throw new Error(`No se pudo filtrar el catálogo: ${error.message}`);
  return (data as CatalogFilterRow[] ?? []).map((row) => toExercise({
    exercise_id: row.exercise_id,
    canonical_name: row.canonical_name,
    movement_pattern: row.movement_pattern,
    equipment: row.equipment,
    muscle_group_ids: [row.matched_muscle_group_id],
    primary_muscle_group_ids: row.role === 'Principal' ? [row.matched_muscle_group_id] : [],
    muscle_participations: [{
      muscle_group_id: row.matched_muscle_group_id,
      role: row.role as 'Principal' | 'Secundario',
      relevance: row.relevance,
      original_label: row.matched_muscle_name,
    }],
  }));
}
