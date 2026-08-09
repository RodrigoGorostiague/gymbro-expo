export type RadarPoint = { x: number; y: number };

export function radarPoint(index: number, total: number, radius: number, center: number): RadarPoint {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / total;
  return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
}

export function radarPoints(values: readonly number[], max: number, radius: number, center: number, minimum = 0): RadarPoint[] {
  return values.map((value, index) => radarPoint(index, values.length, Math.max(minimum, radius * value / max), center));
}

export function svgPoints(points: readonly RadarPoint[]) {
  return points.map(({ x, y }) => `${x},${y}`).join(' ');
}
