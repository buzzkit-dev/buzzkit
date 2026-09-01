export interface ProjectionPoint {
  date: Date;
  value: number;
}

export function projectionValueExtents(
  paths: ProjectionPoint[][]
): { minValue: number; maxValue: number } | null {
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;

  for (const path of paths) {
    for (const point of path) {
      if (point.value < minValue) {
        minValue = point.value;
      }
      if (point.value > maxValue) {
        maxValue = point.value;
      }
    }
  }

  if (minValue === Number.POSITIVE_INFINITY) {
    return null;
  }

  return { minValue, maxValue };
}

/** Collect date extents from projection point arrays. */
export function projectionDateExtents(
  paths: ProjectionPoint[][]
): { minTime: number; maxTime: number } | null {
  let minTime = Number.POSITIVE_INFINITY;
  let maxTime = Number.NEGATIVE_INFINITY;

  for (const path of paths) {
    for (const point of path) {
      const time = point.date.getTime();
      if (time < minTime) {
        minTime = time;
      }
      if (time > maxTime) {
        maxTime = time;
      }
    }
  }

  if (minTime === Number.POSITIVE_INFINITY) {
    return null;
  }

  return { minTime, maxTime };
}
