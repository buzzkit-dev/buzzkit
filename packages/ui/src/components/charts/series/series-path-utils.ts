import { area as d3Area, line as d3Line } from 'd3-shape';

// biome-ignore lint/suspicious/noExplicitAny: d3 curve factory type
type CurveFactory = any;

export interface SeriesPathPoint {
  x: number;
  y: number;
  key: string;
}

export function computeSeriesPathPoints(
  data: Record<string, unknown>[],
  xAccessor: (datum: Record<string, unknown>) => Date,
  xScale: (value: Date) => number | undefined,
  yScale: (value: number) => number | undefined,
  dataKey: string
): SeriesPathPoint[] {
  return data.map((datum, index) => {
    const xValue = xAccessor(datum);
    const yValue = datum[dataKey];
    return {
      x: xScale(xValue) ?? 0,
      y: typeof yValue === 'number' ? (yScale(yValue) ?? 0) : 0,
      key: String(xValue.getTime?.() ?? index),
    };
  });
}

function sampleSeriesY(points: SeriesPathPoint[], x: number): number {
  const first = points[0] as SeriesPathPoint;
  const last = points.at(-1) as SeriesPathPoint;
  if (x <= first.x) {
    return first.y;
  }
  if (x >= last.x) {
    return last.y;
  }
  for (let index = 1; index < points.length; index += 1) {
    const upper = points[index] as SeriesPathPoint;
    if (x <= upper.x) {
      const lower = points[index - 1] as SeriesPathPoint;
      const span = upper.x - lower.x;
      const t = span > 0 ? (x - lower.x) / span : 1;
      return lower.y + (upper.y - lower.y) * t;
    }
  }
  return last.y;
}

/**
 * The previous shape is resampled at the new x positions, so a series keeps
 * its full width from the first frame and only its heights move.
 */
export function interpolateSeriesPathPoints(
  from: SeriesPathPoint[],
  to: SeriesPathPoint[],
  progress: number
): SeriesPathPoint[] {
  if (progress >= 1 || from.length === 0) {
    return to;
  }

  return to.map((target) => {
    const start = sampleSeriesY(from, target.x);
    return { key: target.key, x: target.x, y: start + (target.y - start) * progress };
  });
}

export function seriesPathFromPoints(points: SeriesPathPoint[], curve: CurveFactory): string {
  if (points.length === 0) {
    return '';
  }

  const generator = d3Line<SeriesPathPoint>()
    .x((point) => point.x)
    .y((point) => point.y)
    .curve(curve);

  return generator(points) ?? '';
}

export function seriesAreaFromPoints(
  points: SeriesPathPoint[],
  curve: CurveFactory,
  baselineY: number
): string {
  if (points.length === 0) {
    return '';
  }

  const generator = d3Area<SeriesPathPoint>()
    .x((point) => point.x)
    .y0(baselineY)
    .y1((point) => point.y)
    .curve(curve);

  return generator(points) ?? '';
}

export function seriesPathTransitionSignature({
  renderData,
  xAccessor,
  dataKey,
  innerWidth,
  xDomainMin,
  xDomainMax,
}: {
  renderData: Record<string, unknown>[];
  xAccessor: (datum: Record<string, unknown>) => Date;
  dataKey: string;
  innerWidth: number;
  xDomainMin: number;
  xDomainMax: number;
}): string {
  const values = renderData.map((datum) => {
    const xValue = xAccessor(datum);
    const yValue = datum[dataKey];
    return `${xValue.getTime()}:${typeof yValue === 'number' ? yValue : ''}`;
  });

  return `${innerWidth}|${xDomainMin}|${xDomainMax}|${values.join(',')}`;
}
