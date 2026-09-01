import { scaleLinear } from '@visx/scale';
import type { LineConfig } from './chart-context';

/** Default axis id when `yAxisId` is omitted (Recharts-style `0` / primary left axis). */
export const DEFAULT_Y_AXIS_ID = 'left';

export function normalizeYAxisId(id?: string | number): string {
  if (id == null || id === '') {
    return DEFAULT_Y_AXIS_ID;
  }
  return String(id);
}

export function groupLinesByYAxisId(lines: LineConfig[]): Map<string, LineConfig[]> {
  const groups = new Map<string, LineConfig[]>();
  for (const line of lines) {
    const axisId = normalizeYAxisId(line.yAxisId);
    const bucket = groups.get(axisId) ?? [];
    bucket.push(line);
    groups.set(axisId, bucket);
  }
  return groups;
}

type YScale = ReturnType<typeof scaleLinear<number>>;

export function resolvePrimaryYScale(yScales: Record<string, YScale>, fallback: YScale): YScale {
  const primary = yScales[DEFAULT_Y_AXIS_ID];
  if (primary) {
    return primary;
  }
  const first = Object.values(yScales)[0];
  return first ?? fallback;
}

export function buildYScalesFromDomains({
  lines,
  innerHeight,
  domainsByAxis,
}: {
  lines: LineConfig[];
  innerHeight: number;
  domainsByAxis: Record<string, [number, number]>;
}): Record<string, YScale> {
  const groups = groupLinesByYAxisId(lines);
  const scales: Record<string, YScale> = {};

  for (const [axisId] of groups) {
    const domain =
      domainsByAxis[axisId] ?? domainsByAxis[DEFAULT_Y_AXIS_ID] ?? ([0, 100] as [number, number]);
    scales[axisId] = scaleLinear({
      range: [innerHeight, 0],
      domain,
    });
  }

  if (!scales[DEFAULT_Y_AXIS_ID]) {
    scales[DEFAULT_Y_AXIS_ID] = scaleLinear({
      range: [innerHeight, 0],
      domain: domainsByAxis[DEFAULT_Y_AXIS_ID] ?? [0, 100],
    });
  }

  return scales;
}

/** Single-axis charts (bar, scatter, candlestick, live line). */
