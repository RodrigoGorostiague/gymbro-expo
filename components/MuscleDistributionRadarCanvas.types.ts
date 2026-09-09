import type { AppTheme } from '../types';
import type { RadarPoint } from '../utils/radarGeometry';

export interface MuscleDistributionRadarCanvasProps {
  size: number;
  center: number;
  radius: number;
  rings: readonly (readonly RadarPoint[])[];
  axes: readonly RadarPoint[];
  shape: readonly RadarPoint[];
  reference?: readonly RadarPoint[];
  focusedIndex: number;
  theme: Pick<AppTheme, 'glassBorder' | 'primary' | 'accent' | 'textMuted'>;
}
