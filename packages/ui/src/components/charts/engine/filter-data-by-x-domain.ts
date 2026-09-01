export function filterDataByXDomain(
  data: Record<string, unknown>[],
  xDomain: [Date, Date],
  xAccessor: (d: Record<string, unknown>) => Date
): Record<string, unknown>[] {
  const start = xDomain[0].getTime();
  const end = xDomain[1].getTime();
  const minTime = Math.min(start, end);
  const maxTime = Math.max(start, end);

  return data.filter((d) => {
    const time = xAccessor(d).getTime();
    return time >= minTime && time <= maxTime;
  });
}
