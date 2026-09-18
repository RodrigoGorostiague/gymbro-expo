import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import bounds from '../constants/bodyMap/bounds.json';
import { bodyRegionForSlug } from '../constants/bodyMapMapping';
import { BodyMapProjection, VOLUME_BODY_REGIONS } from '../utils/bodyMapProjection';
import { bodyAppearance, bodyGeometry, BodyMapPalette } from './MuscleBodyMap';

/** Isolated original bilateral paths, cropped to their actual curve bounds. */
export function MuscleRegionGlyph({ axisId, projection, max, palette, shape = 'a' }: {
  axisId: string; projection: BodyMapProjection; max: number; palette: BodyMapPalette; shape?: 'a' | 'b';
}) {
  const regions = VOLUME_BODY_REGIONS[axisId] ?? [];
  const side = ['back', 'triceps', 'glutes', 'abductors', 'hamstrings', 'calves'].includes(axisId) ? 'back' : 'front';
  const parts = bodyGeometry[shape][side].filter(part => {
    const region = bodyRegionForSlug(part.slug);
    return region && regions.includes(region);
  });
  const boxes = bounds[shape][side] as Record<string, number[]>;
  const selected = parts.map(part => boxes[part.slug]);
  if (!selected.length) return <View style={{ width: 58, height: 54, justifyContent: 'center' }}><Text style={{ color: palette.textMuted, fontSize: 9, textAlign: 'center' }}>Región profunda</Text></View>;
  const x = Math.min(...selected.map(b => b[0])) - 4, y = Math.min(...selected.map(b => b[1])) - 4;
  const width = Math.max(...selected.map(b => b[2])) - x + 4, height = Math.max(...selected.map(b => b[3])) - y + 4;
  return <Svg testID={`muscle-glyph-${axisId}`} width={58} height={54} viewBox={`${x} ${y} ${width} ${height}`} accessible={false} aria-hidden accessibilityElementsHidden>
    {parts.flatMap(part => {
      const entry = projection.entries.find(e => e.id === bodyRegionForSlug(part.slug));
      const appearance = bodyAppearance(entry, projection, 'volume', max, palette);
      return Object.values(part.path).flat().map((d, i) => <Path key={`${part.slug}-${i}`} d={d} fill={appearance.fill} fillOpacity={appearance.opacity} stroke={palette.primary} strokeWidth={1} />);
    })}
  </Svg>;
}
