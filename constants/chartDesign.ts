/** Shared visual semantics: current = accent, previous/reference = muted, never another metric. */
export const CHART_DESIGN = {
    height: 168, label: 12, detail: 15, radius: 18, stroke: 3, duration: 480
} as const;
export const CHART_ANIMATION = { type: 'timing', duration: CHART_DESIGN.duration } as const;
export function nearestChartIndex(x: number, width: number, count: number): number {
    if (!count || width <= 0)
        return 0;
    return Math.max(0, Math.min(count - 1, Math.round((x - 16) / Math.max(1, width - 32) * (count - 1))));
}
