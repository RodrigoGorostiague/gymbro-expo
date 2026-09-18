import { BODY_CATALOG_LABELS } from './bodyMap/catalogLabels';

export const BODY_REGIONS = {
  chest: 'Pecho', deltoids: 'Hombros', 'upper-back': 'Dorsales y espalda media',
  trapezius: 'Trapecio', 'lower-back': 'Espalda baja', biceps: 'Bíceps', triceps: 'Tríceps',
  forearm: 'Antebrazos', abs: 'Abdominales', obliques: 'Oblicuos', gluteal: 'Glúteos y cadera lateral',
  quadriceps: 'Cuádriceps', hamstring: 'Isquiosurales', adductors: 'Aductores', calves: 'Pantorrillas', tibialis: 'Tibial anterior',
} as const;
export type BodyRegion = keyof typeof BODY_REGIONS;
export const BODY_REGION_IDS = Object.keys(BODY_REGIONS) as BodyRegion[];
// Explicit correspondence, never fuzzy-match names. Broad/deep groups remain identifiable in details.
const mapping: Record<string, readonly BodyRegion[]> = {};
function assign(ids: readonly number[], regions: readonly BodyRegion[]) {
  for (const id of ids) mapping[`GM-${String(id).padStart(3, '0')}`] = regions;
}
assign([100,101,102,103,104,105], ['chest']);
assign([110,111,112,113,114], ['deltoids']);
assign([120], ['upper-back','trapezius','lower-back']);
assign([121,122,123,124,125], ['upper-back']);
assign([126,127,128,129], ['trapezius']);
assign([130,131,132], ['lower-back']);
assign([140], ['biceps','triceps','forearm']);
assign([141,142,143], ['biceps']);
assign([144,149,150,151], ['forearm']);
assign([145,146,147,148], ['triceps']);
assign([200,201,202,203,240,241], ['gluteal']);
assign([210], ['quadriceps']);
assign([220,221], ['hamstring']);
assign([230,231,232], ['adductors']);
assign([250,251,252], ['calves']);
assign([260], ['tibialis']);
assign([300], ['abs','obliques']);
assign([301,304], ['abs']);
assign([302], ['obliques']);
assign([30,303], ['abs','obliques','lower-back']);
// Deep/functional regions without a faithful surface in this geometry: keep in textual detail.
assign([1,10,20,115,116,117,118,133,160,161,162,305,310], []);
const legacy: Record<string, readonly BodyRegion[]> = {
  pecho: ['chest'], espalda: ['upper-back','trapezius','lower-back'], dorsales: ['upper-back'],
  hombros: ['deltoids'], biceps: ['biceps'], triceps: ['triceps'], antebrazos: ['forearm'], trapecio: ['trapezius'],
  cuadriceps: ['quadriceps'], femorales: ['hamstring'], isquiosurales: ['hamstring'], gemelos: ['calves'],
  gluteos: ['gluteal'], aductores: ['adductors'], abductores: ['gluteal'], core: ['abs','obliques','lower-back'], fullbody: [],
};
export function bodyRegionsForMuscle(id: string): readonly BodyRegion[] {
  return mapping[id] ?? legacy[id.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()] ?? [];
}
export function bodyMuscleLabel(id: string, groups: readonly { id: string; displayName: string }[] = []): string {
  return groups.find((group) => group.id === id)?.displayName ?? BODY_CATALOG_LABELS[id] ?? id;
}
export function bodyRegionForSlug(slug: string): BodyRegion | undefined {
  if (slug === 'abductors') return 'gluteal';
  return slug in BODY_REGIONS ? slug as BodyRegion : undefined;
}
