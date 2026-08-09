import { AnthropometricMetricType, AnthropometricUnit } from '../types';

export type AnthropometricDefinition = {
  type: AnthropometricMetricType;
  label: string;
  unit: AnthropometricUnit;
  help: string;
};

export const ANTHROPOMETRICS: readonly AnthropometricDefinition[] = [
  { type: 'body_weight', label: 'Peso corporal', unit: 'kg', help: 'Pesate descalzo, con ropa similar y a la misma hora para comparar tus registros.' },
  { type: 'height', label: 'Talla', unit: 'cm', help: 'Medite descalzo, erguido y mirando al frente. La talla cambia poco, registrala sólo cuando sea necesario.' },
  { type: 'neck', label: 'Cuello', unit: 'cm', help: 'Rodeá el cuello con la cinta justo debajo de la nuez, sin ajustar la piel.' },
  { type: 'shoulders', label: 'Hombros y espalda', unit: 'cm', help: 'Pasá la cinta alrededor del punto más ancho de hombros y espalda, con los brazos relajados.' },
  { type: 'chest', label: 'Pecho', unit: 'cm', help: 'Medí el tórax a la altura media del pecho, después de una exhalación normal.' },
  { type: 'waist', label: 'Cintura', unit: 'cm', help: 'Medí el contorno natural entre costillas y cadera, relajado y sin contraer el abdomen.' },
  { type: 'hips', label: 'Cadera', unit: 'cm', help: 'Rodeá la parte más ancha de glúteos y cadera con los pies juntos.' },
  { type: 'biceps_relaxed', label: 'Bíceps relajado', unit: 'cm', help: 'Con el brazo extendido y suelto, medí el punto de mayor perímetro del brazo superior.' },
  { type: 'biceps_flexed', label: 'Bíceps contraído', unit: 'cm', help: 'Flexioná el brazo a 90 grados y contraé el bíceps; medí su punto más ancho.' },
  { type: 'forearm', label: 'Antebrazo', unit: 'cm', help: 'Medí el punto de mayor perímetro del antebrazo, con la mano relajada.' },
  { type: 'thigh', label: 'Muslo', unit: 'cm', help: 'De pie y con el peso repartido, medí el punto de mayor perímetro del muslo.' },
  { type: 'calf', label: 'Pantorrilla', unit: 'cm', help: 'Medí el punto de mayor perímetro de la pantorrilla con el pie apoyado.' },
];

export const anthropometricByType = Object.fromEntries(ANTHROPOMETRICS.map((metric) => [metric.type, metric])) as Record<AnthropometricMetricType, AnthropometricDefinition>;
