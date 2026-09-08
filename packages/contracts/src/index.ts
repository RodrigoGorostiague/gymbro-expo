import { z } from 'zod';

export type RoutineSet = { id: string; tipo: 'C' | 'F' | number; weight: number; reps: number; backoffGroupId?: string; effortTarget?: { kind: 'rir' | 'rpe'; value: number } };
export type ExerciseDefinitionSnapshot = { id: string; name: string; muscleGroups: string[]; loadMode: 'external-load' | 'bodyweight' | 'assisted'; loadUnit: 'kg' | 'lb'; variant: string };
export type RoutineExercise = { id: string; catalogExerciseId?: string; definitionId?: string; definitionSnapshot?: ExerciseDefinitionSnapshot; name: string; muscleGroups: string[]; loadMode?: 'external-load' | 'bodyweight' | 'assisted'; loadUnit?: 'kg' | 'lb'; attribution?: { primary: string; secondary: string[]; weights?: Record<string, number> }; catalog?: { movementPattern: string | null; equipment: string | null; muscleParticipations: Array<{ muscleGroupId: string; role: 'Principal' | 'Secundario'; relevance: number; originalLabel: string }> }; variant: string; sets: RoutineSet[] };
export type Routine = { id: string; version?: number; versionOf?: string; previousVersionId?: string; name: string; muscleGroups: string[]; exercises: RoutineExercise[]; createdAt: string; sharedFrom?: { requestId: string; senderId: string; acceptedAt: string }; isShared?: boolean; shareId?: string };
export type PlannedSession = { id: string; ref: { routineId: string; routineName: string; source: 'local' | 'shared'; shareId?: string }; routineSnapshot?: Routine; dayLabel?: string; order: number; progressionNote?: string; note?: string; planningState?: 'pending' | 'in_progress' | 'skipped' | 'rescheduled' | 'cancelled'; planningTransition?: { from: 'pending' | 'in_progress' | 'skipped' | 'rescheduled' | 'cancelled'; to: 'pending' | 'in_progress' | 'skipped' | 'rescheduled' | 'cancelled'; at: string; reason?: string }; recoveryForPlannedSessionId?: string; recoveredByPlannedSessionId?: string; isExtraordinary?: boolean; scheduleShiftDays?: number };
export type Mesocycle = { id: string; version?: number; versionOf?: string; previousVersionId?: string; name: string; goal: string; status: 'draft' | 'scheduled' | 'active' | 'completed' | 'paused' | 'cancelled' | 'archived'; weeks: Array<{ id: string; weekNumber: number; entries: Array<PlannedSession | { id: string; kind: 'rest' }> }>; durationWeeks: number; startDate?: string; pausedAt?: string; pausedOn?: string; scheduleShiftDays?: number; lifecycleHistory?: Array<{ type: 'paused' | 'resumed' | 'completed' | 'cancelled'; at: string; [key: string]: unknown }>; createdAt: string; sharedFrom?: { requestId: string; senderId: string; acceptedAt: string } };

const idSchema = z.string().min(1).max(128);
const labelSchema = z.string().trim().min(1).max(120);
const timestampSchema = z.string().datetime({ offset: true });
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nonNegativeIntSchema = z.number().int().nonnegative();
const canonicalTextSchema = z.string();
const canonicalNumberSchema = z.number().finite();

export const effortTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rir'), value: z.number().int().min(0).max(5) }).passthrough(),
  z.object({ kind: z.literal('rpe'), value: z.number().int().min(6).max(10) }).passthrough(),
]);

export const routineSetSchema = z.object({
  id: idSchema,
  tipo: z.union([z.literal('C'), z.literal('F'), canonicalNumberSchema]),
  weight: canonicalNumberSchema,
  reps: canonicalNumberSchema,
  backoffGroupId: idSchema.optional(),
  effortTarget: effortTargetSchema.optional(),
}).passthrough();

export const exerciseDefinitionSnapshotSchema = z.object({
  id: idSchema,
  name: canonicalTextSchema,
  muscleGroups: z.array(canonicalTextSchema),
  loadMode: z.enum(['external-load', 'bodyweight', 'assisted']),
  loadUnit: z.enum(['kg', 'lb']),
  variant: canonicalTextSchema,
}).passthrough();

export const muscleAttributionSchema = z.object({
  primary: canonicalTextSchema,
  secondary: z.array(canonicalTextSchema),
  weights: z.record(canonicalNumberSchema).optional(),
}).passthrough();

export const catalogProjectionSchema = z.object({
  movementPattern: z.string().nullable(),
  equipment: z.string().nullable(),
  muscleParticipations: z.array(z.object({
    muscleGroupId: canonicalTextSchema,
    role: z.enum(['Principal', 'Secundario']),
    relevance: canonicalNumberSchema,
    originalLabel: canonicalTextSchema,
  }).passthrough()),
}).passthrough();

export const catalogMuscleParticipationRpcRowSchema = z.object({
  muscle_group_id: idSchema,
  role: z.enum(['Principal', 'Secundario']),
  relevance: z.number().finite().min(0).max(1),
  original_label: z.string(),
}).strict();

export const catalogMuscleParticipationSchema = z.object({
  muscleGroupId: idSchema,
  role: z.enum(['Principal', 'Secundario']),
  relevance: z.number().finite().min(0).max(1),
  originalLabel: z.string(),
}).strict();

export const catalogExerciseRpcRowSchema = z.object({
  exercise_id: idSchema,
  canonical_name: z.string().min(1),
  movement_pattern: z.string().nullable(),
  equipment: z.string().nullable(),
  muscle_group_ids: z.array(idSchema),
  primary_muscle_group_ids: z.array(idSchema).nullable(),
  muscle_participations: z.array(catalogMuscleParticipationRpcRowSchema),
}).strict();

export const catalogExerciseSchema = z.object({
  id: idSchema,
  canonicalName: z.string().min(1),
  movementPattern: z.string().nullable(),
  equipment: z.string().nullable(),
  muscleGroupIds: z.array(idSchema),
  primaryMuscleGroupIds: z.array(idSchema).nullable(),
  muscleParticipations: z.array(catalogMuscleParticipationSchema),
}).strict();

export const catalogParticipationModeSchema = z.enum(['primary_only', 'primary_and_secondary', 'all_roles']);

export const catalogExerciseMatchRpcRowSchema = z.object({
  exercise_id: idSchema, canonical_name: z.string().min(1), movement_pattern: z.string().nullable(), equipment: z.string().nullable(),
  matched_muscle_group_id: idSchema, matched_muscle_name: z.string().min(1), selected_parent_id: idSchema,
  role: z.enum(['Principal', 'Secundario']), relevance: z.number().finite().min(0).max(1), path: z.string().min(1),
}).strict();

export const catalogExerciseMatchSchema = z.object({
  exerciseId: idSchema, canonicalName: z.string().min(1), movementPattern: z.string().nullable(), equipment: z.string().nullable(),
  matchedMuscleGroupId: idSchema, matchedMuscleName: z.string().min(1), selectedParentId: idSchema,
  role: z.enum(['Principal', 'Secundario']), relevance: z.number().finite().min(0).max(1), path: z.string().min(1),
}).strict();

export const catalogMuscleGroupRpcRowSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  type: z.string().min(1),
  level: z.number().int().nonnegative(),
  visible_in_filters: z.boolean(),
  display_name: z.string().min(1),
  path: z.string().min(1),
  parent_group_ids: z.array(idSchema),
}).strict();

export const catalogMuscleGroupSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  type: z.string().min(1),
  level: z.number().int().nonnegative(),
  visibleInFilters: z.boolean(),
  displayName: z.string().min(1),
  path: z.string().min(1),
  parentGroupIds: z.array(idSchema),
}).strict();

export const routineExerciseSchema = z.object({
  id: idSchema,
  catalogExerciseId: idSchema.optional(),
  definitionId: idSchema.optional(),
  definitionSnapshot: exerciseDefinitionSnapshotSchema.optional(),
  name: canonicalTextSchema,
  muscleGroups: z.array(canonicalTextSchema),
  loadMode: z.enum(['external-load', 'bodyweight', 'assisted']).optional(),
  loadUnit: z.enum(['kg', 'lb']).optional(),
  attribution: muscleAttributionSchema.optional(),
  catalog: catalogProjectionSchema.optional(),
  variant: canonicalTextSchema,
  sets: z.array(routineSetSchema),
}).passthrough();

export const contentLineageSchema = z.object({
  version: z.number().int().positive(),
  versionOf: idSchema.optional(),
  previousVersionId: idSchema.optional(),
}).strict();

export const routineSchema: z.ZodType<Routine> = z.object({
  id: idSchema,
  version: z.number().int().positive().optional(),
  versionOf: idSchema.optional(),
  previousVersionId: idSchema.optional(),
  name: canonicalTextSchema,
  muscleGroups: z.array(canonicalTextSchema),
  exercises: z.array(routineExerciseSchema),
  createdAt: canonicalTextSchema,
  sharedFrom: z.object({ requestId: idSchema, senderId: idSchema, acceptedAt: timestampSchema }).strict().optional(),
  isShared: z.boolean().optional(),
  shareId: idSchema.optional(),
}).passthrough();

export const usableRoutineSchema: z.ZodType<Routine> = routineSchema.superRefine((routine, context) => {
  if (!labelSchema.safeParse(routine.name).success) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Routine name is required.', path: ['name'] });
  if (!timestampSchema.safeParse(routine.createdAt).success) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Routine createdAt must be an ISO timestamp.', path: ['createdAt'] });
  if (routine.muscleGroups.length < 1 || routine.muscleGroups.length > 32) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Routine muscle groups must contain 1–32 items.', path: ['muscleGroups'] });
  if (routine.exercises.length < 1 || routine.exercises.length > 100) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Routine exercises must contain 1–100 items.', path: ['exercises'] });
  if (new Set(routine.exercises.map(({ id }) => id)).size !== routine.exercises.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Routine exercise IDs must be unique.', path: ['exercises'] });
  }
  routine.exercises.forEach((exercise, index) => {
    if (!labelSchema.safeParse(exercise.name).success || !labelSchema.safeParse(exercise.variant).success || exercise.muscleGroups.length < 1 || exercise.sets.length < 1 || exercise.sets.length > 100) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Each usable exercise requires metadata and 1–100 sets.', path: ['exercises', index] });
    }
    if (new Set(exercise.sets.map(({ id }) => id)).size !== exercise.sets.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Routine set IDs must be unique.', path: ['exercises', index, 'sets'] });
    exercise.sets.forEach((set, setIndex) => {
      const validType = set.tipo === 'C' || set.tipo === 'F' || (Number.isInteger(set.tipo) && set.tipo >= 0 && set.tipo <= 10);
      if (!validType || !Number.isInteger(set.reps) || set.reps < 0 || set.reps > 1_000 || set.weight < 0 || set.weight > 10_000) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Routine set prescription is outside usable limits.', path: ['exercises', index, 'sets', setIndex] });
    });
  });
});

export const createRoutineSchema: z.ZodType<Routine> = usableRoutineSchema.superRefine((routine, context) => {
  if (routine.version !== undefined && routine.version !== 1) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A new routine must begin at content version 1.', path: ['version'] });
  if (routine.versionOf !== undefined || routine.previousVersionId !== undefined || routine.sharedFrom !== undefined || routine.isShared === true || routine.shareId !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'A new routine cannot contain lineage or sharing metadata.', path: [] });
  }
});

export const plannedSessionRefSchema = z.object({
  routineId: idSchema,
  routineName: canonicalTextSchema,
  source: z.enum(['local', 'shared']),
  shareId: idSchema.optional(),
}).passthrough();

export const plannedSessionTransitionSchema = z.object({
  from: z.enum(['pending', 'in_progress', 'skipped', 'rescheduled', 'cancelled']),
  to: z.enum(['pending', 'in_progress', 'skipped', 'rescheduled', 'cancelled']),
  at: canonicalTextSchema,
  reason: canonicalTextSchema.optional(),
}).passthrough();

export const plannedSessionSchema = z.object({
  id: idSchema,
  ref: plannedSessionRefSchema,
  routineSnapshot: routineSchema.optional(),
  dayLabel: canonicalTextSchema.optional(),
  order: canonicalNumberSchema,
  progressionNote: canonicalTextSchema.optional(),
  note: canonicalTextSchema.optional(),
  planningState: z.enum(['pending', 'in_progress', 'skipped', 'rescheduled', 'cancelled']).optional(),
  planningTransition: plannedSessionTransitionSchema.optional(),
  recoveryForPlannedSessionId: idSchema.optional(),
  recoveredByPlannedSessionId: idSchema.optional(),
  isExtraordinary: z.boolean().optional(),
  scheduleShiftDays: nonNegativeIntSchema.optional(),
}).passthrough();

export const mesocycleLifecycleEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paused'), at: canonicalTextSchema, localDate: canonicalTextSchema }).passthrough(),
  z.object({ type: z.literal('resumed'), at: canonicalTextSchema, localDate: canonicalTextSchema, pauseStartedAt: canonicalTextSchema, pauseStartedDate: canonicalTextSchema, shiftDays: canonicalNumberSchema, shiftedPlannedSessionIds: z.array(idSchema) }).passthrough(),
  z.object({ type: z.literal('completed'), at: canonicalTextSchema }).passthrough(),
  z.object({ type: z.literal('cancelled'), at: canonicalTextSchema }).passthrough(),
]);

export const mesocycleEntrySchema = z.union([
  plannedSessionSchema,
  z.object({ id: idSchema, kind: z.literal('rest') }).passthrough(),
]);

export const mesocycleWeekSchema = z.object({
  id: idSchema,
  weekNumber: canonicalNumberSchema,
  entries: z.array(mesocycleEntrySchema),
}).passthrough();

export const mesocycleSchema: z.ZodType<Mesocycle> = z.object({
  id: idSchema,
  version: z.number().int().positive().optional(),
  versionOf: idSchema.optional(),
  previousVersionId: idSchema.optional(),
  name: canonicalTextSchema,
  goal: canonicalTextSchema,
  status: z.enum(['draft', 'scheduled', 'active', 'completed', 'paused', 'cancelled', 'archived']),
  weeks: z.array(mesocycleWeekSchema),
  durationWeeks: canonicalNumberSchema,
  startDate: canonicalTextSchema.optional(),
  pausedAt: canonicalTextSchema.optional(),
  pausedOn: canonicalTextSchema.optional(),
  scheduleShiftDays: canonicalNumberSchema.optional(),
  lifecycleHistory: z.array(mesocycleLifecycleEventSchema).optional(),
  createdAt: canonicalTextSchema,
  sharedFrom: z.object({ requestId: idSchema, senderId: idSchema, acceptedAt: timestampSchema }).strict().optional(),
}).passthrough();

export const usableMesocycleSchema: z.ZodType<Mesocycle> = mesocycleSchema.superRefine((mesocycle, context) => {
  if (!labelSchema.safeParse(mesocycle.name).success || !timestampSchema.safeParse(mesocycle.createdAt).success) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Mesocycle name and createdAt must be usable.', path: [] });
  if (!Number.isInteger(mesocycle.durationWeeks) || mesocycle.durationWeeks < 1 || mesocycle.durationWeeks > 52) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Mesocycle duration must be 1–52 weeks.', path: ['durationWeeks'] });
  if (mesocycle.weeks.length !== mesocycle.durationWeeks) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Weeks must match durationWeeks.', path: ['weeks'] });
  }
  const identities = [...mesocycle.weeks.map(({ id }) => id), ...mesocycle.weeks.flatMap(({ entries }) => entries.map(({ id }) => id))];
  if (new Set(identities).size !== identities.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Mesocycle week and entry IDs must be unique.', path: ['weeks'] });
  }
  mesocycle.weeks.forEach((week, index) => {
    if (!Number.isInteger(week.weekNumber) || week.weekNumber < 1 || week.weekNumber > 52 || week.entries.length > 7) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Mesocycle weeks require a valid number and at most seven entries.', path: ['weeks', index] });
  });
});

export const createMesocycleSchema: z.ZodType<Mesocycle> = usableMesocycleSchema.superRefine((mesocycle, context) => {
  if (mesocycle.version !== undefined && mesocycle.version !== 1) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A new mesocycle must begin at content version 1.', path: ['version'] });
  if (!['draft', 'scheduled'].includes(mesocycle.status)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A new mesocycle must be draft or scheduled.', path: ['status'] });
  if (mesocycle.status === 'scheduled' && !localDateSchema.safeParse(mesocycle.startDate).success) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A scheduled mesocycle requires a local start date.', path: ['startDate'] });
  if (mesocycle.status === 'draft' && mesocycle.startDate !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A draft mesocycle cannot have a start date.', path: ['startDate'] });
  if (mesocycle.versionOf !== undefined || mesocycle.previousVersionId !== undefined || mesocycle.sharedFrom !== undefined || mesocycle.pausedAt !== undefined || mesocycle.pausedOn !== undefined || mesocycle.lifecycleHistory !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'A new mesocycle cannot contain lineage, sharing, or lifecycle history.', path: [] });
  }
});

export function validateMesocycleRoutineReferences(mesocycle: Mesocycle, ownedRoutineIds: ReadonlySet<string>): boolean {
  return mesocycle.weeks.every(({ entries }) => entries.every((entry) => !('ref' in entry) || ownedRoutineIds.has(entry.ref.routineId)));
}

export function revisedCollectionSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ revision: nonNegativeIntSchema, items: z.array(item) }).strict().superRefine((collection, context) => {
    const ids = collection.items.map((candidate) => (candidate as { id: string }).id);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Collection item IDs must be unique.', path: ['items'] });
  });
}

export function saveCasInputSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ expectedRevision: nonNegativeIntSchema, items: z.array(item) }).strict().superRefine((input, context) => {
    const ids = input.items.map((candidate) => (candidate as { id: string }).id);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Collection item IDs must be unique.', path: ['items'] });
  });
}

export function casResultSchema<T extends z.ZodTypeAny>(item: T) {
  const state = revisedCollectionSchema(item);
  return z.discriminatedUnion('status', [
    z.object({ status: z.literal('saved'), collection: state }).strict(),
    z.object({ status: z.literal('conflict'), current: state }).strict(),
  ]);
}

export const routineCollectionSchema = revisedCollectionSchema(routineSchema);
export const mesocycleCollectionSchema = revisedCollectionSchema(mesocycleSchema);
export const saveRoutinesInputSchema = saveCasInputSchema(routineSchema);
export const saveMesocyclesInputSchema = saveCasInputSchema(mesocycleSchema);
export const saveRoutinesResultSchema = casResultSchema(routineSchema);
export const saveMesocyclesResultSchema = casResultSchema(mesocycleSchema);

export const contentProvenanceSchema = z.object({
  sourceAuthorId: idSchema,
  sourcePublicationId: idSchema,
  sourceVersionId: idSchema,
}).strict();

export const publicationVisibilitySchema = z.enum(['private', 'circle', 'community']);
export const publicationKindSchema = z.enum(['routine', 'mesocycle']);
export const publicationContentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('routine'), value: routineSchema }).strict(),
  z.object({ kind: z.literal('mesocycle'), value: mesocycleSchema }).strict(),
]);

export const publishPlanInputSchema = z.object({
  kind: publicationKindSchema,
  sourceVersionId: idSchema,
  visibility: publicationVisibilitySchema,
  copyAllowed: z.boolean(),
  recipientIds: z.array(idSchema).max(100).optional(),
}).strict();

export const authorizedPlanPublicationSchema = z.object({
  id: idSchema,
  authorId: idSchema,
  authorAlias: labelSchema,
  kind: publicationKindSchema,
  sourceVersionId: idSchema,
  visibility: publicationVisibilitySchema,
  copyAllowed: z.boolean(),
  content: publicationContentSchema,
  createdAt: timestampSchema,
}).strict();

export const privatePlanOfferSchema = z.object({
  id: idSchema,
  publication: authorizedPlanPublicationSchema,
  recipientId: idSchema,
  state: z.enum(['pending', 'accepted', 'rejected', 'revoked']),
}).strict();

export const copiedPlanResultSchema = z.object({
  kind: publicationKindSchema,
  localId: idSchema,
  provenance: contentProvenanceSchema,
}).strict();

export const authorizedProfileSchema = z.object({
  id: idSchema,
  alias: labelSchema,
  avatarId: idSchema,
  frameId: idSchema.optional(),
  titleId: idSchema.nullable().optional(),
  presentationThemeId: idSchema.nullable(),
  categories: z.record(z.string()),
  relationshipStatus: z.enum(['discover', 'bro', 'partner', 'incoming_request', 'outgoing_request']).optional(),
}).strict();

export const equippedPresentationSchema = z.object({
  avatarId: idSchema,
  frameId: idSchema.nullable(),
  titleId: idSchema.nullable(),
  themeId: idSchema.nullable(),
}).strict();

export const feedItemSchema = z.object({
  publication: authorizedPlanPublicationSchema,
  author: authorizedProfileSchema,
  reactionCount: nonNegativeIntSchema,
  commentCount: nonNegativeIntSchema,
  viewerHasReacted: z.boolean(),
}).strict();

export const inAppNotificationSchema = z.object({
  id: idSchema,
  recipientId: idSchema,
  kind: z.enum(['circle_request', 'plan_offer', 'reaction', 'comment']),
  actor: authorizedProfileSchema.optional(),
  publicationId: idSchema.optional(),
  readAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
}).strict();

export const presentationManifestSchema = z.object({
  id: idSchema,
  name: labelSchema,
  tokens: z.object({
    primary: z.string().min(1), secondary: z.string().min(1), accent: z.string().min(1),
    background: z.array(z.string().min(1)).min(1), surface: z.string().min(1), border: z.string().min(1),
    text: z.string().min(1), textMuted: z.string().min(1), onPrimary: z.string().min(1), success: z.string().min(1),
  }).strict(),
  decoration: z.enum(['none', 'star', 'moon', 'sun', 'leaf', 'snowflake']).default('none'),
}).strict();

export type PresentationManifest = z.infer<typeof presentationManifestSchema>;

export type CosmeticPresentation = { id: string; label: string; asset: string };

export const DEFAULT_PRESENTATION_MANIFEST: PresentationManifest = Object.freeze({
  id: 'gymbro-default', name: 'GymBro Default', decoration: 'none',
  tokens: { primary: '#E85D04', secondary: '#DC2F02', accent: '#F48C06', background: ['#1A0A00', '#3D1300'], surface: '#321508', border: '#A94A1B', text: '#FFF5EB', textMuted: '#DDBEAA', onPrimary: '#FFFFFF', success: '#52B788' },
});

const webTheme = (id: string, name: string, primary: string, secondary: string, accent: string, background: string[], light = false, decoration: PresentationManifest['decoration'] = 'none'): PresentationManifest => ({ id, name, decoration, tokens: { primary, secondary, accent, background, surface: light ? 'rgba(255,255,255,.78)' : 'rgba(18,12,28,.72)', border: light ? 'rgba(30,20,45,.2)' : 'rgba(255,255,255,.24)', text: light ? '#25152E' : '#FFF8F2', textMuted: light ? '#66546E' : '#D7C8D8', onPrimary: light ? '#FFFFFF' : '#130B18', success: light ? '#197A55' : '#8EE3B7' } });

const WEB_THEMES = [
  webTheme('white', 'White', '#5C5C5C', '#9E9E9E', '#BDBDBD', ['#FFFFFF', '#EEEEEE'], true),
  webTheme('black', 'Black', '#E0E0E0', '#757575', '#A0A0A0', ['#000000', '#141414']),
  webTheme('green', 'Green', '#43A047', '#1B5E20', '#81C784', ['#0A1F0C', '#1B5E20'], false, 'leaf'),
  webTheme('violeta', 'Violet', '#7E57C2', '#512DA8', '#B388FF', ['#120820', '#3D2060'], false, 'star'),
  webTheme('blue', 'Blue', '#1E88E5', '#0D47A1', '#64B5F6', ['#0A1628', '#1565C0']),
  webTheme('sun', 'Summer sun', '#FFB300', '#FF6F00', '#FFE082', ['#3E2723', '#FF8F00'], false, 'sun'),
  webTheme('leaf', 'Autumn leaf', '#E65100', '#BF360C', '#FFAB40', ['#1A0E00', '#8D4000'], false, 'leaf'),
  webTheme('moon', 'Night moon', '#9FA8DA', '#5C6BC0', '#C5CAE9', ['#0D1025', '#283593'], false, 'moon'),
  webTheme('star', 'Galaxy star', '#B388FF', '#651FFF', '#FFD740', ['#0A0015', '#4A0080'], false, 'star'),
  webTheme('snowflake', 'Winter Arc', '#0288D1', '#4FC3F7', '#01579B', ['#E3F2FD', '#FFFFFF'], true, 'snowflake'),
  webTheme('red', 'Crimson', '#E53935', '#B71C1C', '#EF5350', ['#1A0505', '#7F0000']),
  webTheme('sakura', 'Sakura', '#B2386F', '#E879A8', '#702341', ['#FFF5FA', '#F9D8E6'], true, 'leaf'),
  webTheme('aurora', 'Aurora', '#5EEAD4', '#7C3AED', '#D8B4FE', ['#071C2A', '#6236B8'], false, 'star'),
  webTheme('cyberpunk', 'Neon Vital', '#FF3CAC', '#784BA0', '#00F5D4', ['#130526', '#0B6072'], false, 'star'),
  webTheme('boca', 'La 12', '#1746A2', '#082B68', '#F6C445', ['#06152E', '#1746A2'], false, 'star'),
  webTheme('river', 'Millo Monumental', '#E53935', '#961B1B', '#FFFFFF', ['#170808', '#BA2A2A']),
  webTheme('prisma', 'Diamond Fit', '#8B5CF6', '#EC4899', '#FDE047', ['#1A103B', '#D94A99'], false, 'star'),
] as const;

export const PRESENTATION_MANIFESTS: Readonly<Record<string, PresentationManifest>> = Object.freeze({
  [DEFAULT_PRESENTATION_MANIFEST.id]: DEFAULT_PRESENTATION_MANIFEST,
  'profile-rodaja': Object.freeze({ ...DEFAULT_PRESENTATION_MANIFEST, id: 'profile-rodaja', name: 'Fuego' }),
  'profile-brisas': Object.freeze({ id: 'profile-brisas', name: 'Brisa', decoration: 'none', tokens: { primary: '#D63384', secondary: '#9B59B6', accent: '#FF85C0', background: ['#FFF7FC', '#EDE0F8'], surface: '#FFFFFF', border: '#C9A4D3', text: '#3A1F45', textMuted: '#705A78', onPrimary: '#FFFFFF', success: '#2E9E6A' } }),
  ...Object.fromEntries(WEB_THEMES.map((theme) => [theme.id, Object.freeze(theme)])),
});

export function resolvePresentationManifest(themeId: string | null | undefined, manifests: Readonly<Record<string, unknown>> = PRESENTATION_MANIFESTS): PresentationManifest {
  const parsed = themeId ? presentationManifestSchema.safeParse(manifests[themeId]) : null;
  return parsed?.success ? parsed.data : DEFAULT_PRESENTATION_MANIFEST;
}

const cosmetic = (ids: readonly string[], kind: string): Readonly<Record<string, CosmeticPresentation>> => Object.freeze(Object.fromEntries(ids.map((id) => [id, Object.freeze({ id, label: id.replaceAll('-', ' '), asset: `/presentation/${kind}.svg` })])));
export const AVATAR_PRESENTATIONS = cosmetic(['capybara-athlete', 'capybara-mark', 'capigirl', 'capigirl-ponytail', 'capigirl-braid', 'capigirl-bob', 'capigirl-bun', 'capybro-spiky', 'capybro-quiff', 'capybro-topknot', 'capybro-cropped', 'capybro-river-tattoo', 'capybro-beanie-headphones', 'capybro-cap-headphones', 'capybro-cap-tank', 'capybro-beanie-tank', 'capybro-red-visor', 'capybro-argentina-beanie', 'capybro-argentina-visor', 'capybro-boca', 'capybro-river', 'capybro-argentina', 'capigirl-pink-squat', 'capigirl-purple-deadlift', 'capigirl-blue-squat', 'capigirl-black-pink-deadlift', 'capigirl-pink-jacket-deadlift', 'capigirl-black-dumbbell', 'capigirl-pink-dumbbell', 'capigirl-purple-tee', 'capigirl-purple-sport'], 'avatar');
export const FRAME_PRESENTATIONS = cosmetic(['principiante', 'intermedio', 'avanzado', 'gymbro', 'gymrat', 'g-boom', 'alfa', 'alfa-user', 'sigma', 'shop-campeon-indiscutible', 'shop-heavy-duty', 'shop-neon-vital', 'shop-alfa', 'shop-la-12', 'shop-rosa-carmesi', 'shop-millo', 'shop-celtic-spirit', 'shop-hierro-fe-disciplina', 'shop-yo-soy-el-huno', 'shop-spqr', 'shop-fuerza-rinoceronte', 'shop-fuerza-pantera', 'shop-diamond-fit', 'shop-ruby-fit', 'shop-valhalla-training', 'shop-aurora-fitness', 'shop-holy-fit', 'shop-medjay-core', 'shop-fuerza-cocodrilo', 'shop-fuerza-gorila', 'shop-elegante-sport', 'shop-banzai', 'shop-neon-gym', 'shop-fuerza-elefante', 'shop-this-is-sparta', 'shop-fuerza-tigre', 'shop-winter-arc'], 'frame');
export const TITLE_PRESENTATIONS = cosmetic(['principiante', 'intermedio', 'avanzado', 'gymbro', 'gymrat', 'g-boom', 'alfa', 'alfa-user', 'sigma', 'brawl-rookie', 'brawl-contender', 'brawl-challenger', 'brawl-elite', 'brawl-apex', 'brawl-titan', 'brawl-warlord', 'brawl-legend'], 'title');
export function resolveCosmeticPresentation(kind: 'avatar' | 'frame' | 'title', id: string | null | undefined): CosmeticPresentation | null {
  const manifests = kind === 'avatar' ? AVATAR_PRESENTATIONS : kind === 'frame' ? FRAME_PRESENTATIONS : TITLE_PRESENTATIONS;
  return id && manifests[id] ? manifests[id] : kind === 'avatar' ? AVATAR_PRESENTATIONS['capybara-athlete']! : null;
}

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export interface Database {
  public: {
    Functions: {
      load_routines_v2: { Args: Record<string, never>; Returns: RoutineCollection };
      save_routines_v2: { Args: { input: SaveRoutinesInput }; Returns: SaveRoutinesResult };
      load_mesocycles_v2: { Args: Record<string, never>; Returns: MesocycleCollection };
      save_mesocycles_v2: { Args: { input: SaveMesocyclesInput }; Returns: SaveMesocyclesResult };
      list_catalog_exercises: { Args: Record<string, never>; Returns: CatalogExerciseRpcRow[] };
      list_catalog_exercises_by_muscle_group: { Args: { selected_group_id: string; participation_mode: CatalogParticipationMode }; Returns: CatalogExerciseMatchRpcRow[] };
      list_catalog_muscle_groups_with_parents: { Args: Record<string, never>; Returns: CatalogMuscleGroupRpcRow[] };
      publish_plan: { Args: { input: PublishPlanInput }; Returns: AuthorizedPlanPublication };
      copy_plan_publication: { Args: { publication_id: string }; Returns: CopiedPlanResult };
    };
  };
}

export type CatalogMuscleParticipationRpcRow = z.infer<typeof catalogMuscleParticipationRpcRowSchema>;
export type CatalogMuscleParticipation = z.infer<typeof catalogMuscleParticipationSchema>;
export type CatalogExerciseRpcRow = z.infer<typeof catalogExerciseRpcRowSchema>;
export type CatalogExercise = z.infer<typeof catalogExerciseSchema>;
export type CatalogParticipationMode = z.infer<typeof catalogParticipationModeSchema>;
export type CatalogExerciseMatchRpcRow = z.infer<typeof catalogExerciseMatchRpcRowSchema>;
export type CatalogExerciseMatch = z.infer<typeof catalogExerciseMatchSchema>;
export type CatalogMuscleGroupRpcRow = z.infer<typeof catalogMuscleGroupRpcRowSchema>;
export type CatalogMuscleGroup = z.infer<typeof catalogMuscleGroupSchema>;
export type RoutineCollection = z.infer<typeof routineCollectionSchema>;
export type MesocycleCollection = z.infer<typeof mesocycleCollectionSchema>;
export type SaveRoutinesInput = z.infer<typeof saveRoutinesInputSchema>;
export type SaveMesocyclesInput = z.infer<typeof saveMesocyclesInputSchema>;
export type SaveRoutinesResult = z.infer<typeof saveRoutinesResultSchema>;
export type SaveMesocyclesResult = z.infer<typeof saveMesocyclesResultSchema>;
export type ContentLineage = z.infer<typeof contentLineageSchema>;
export type ContentProvenance = z.infer<typeof contentProvenanceSchema>;
export type PublishPlanInput = z.infer<typeof publishPlanInputSchema>;
export type AuthorizedPlanPublication = z.infer<typeof authorizedPlanPublicationSchema>;
export type CopiedPlanResult = z.infer<typeof copiedPlanResultSchema>;
export type AuthorizedProfile = z.infer<typeof authorizedProfileSchema>;
export type FeedItem = z.infer<typeof feedItemSchema>;
export type InAppNotification = z.infer<typeof inAppNotificationSchema>;
export type EquippedPresentation = z.infer<typeof equippedPresentationSchema>;
