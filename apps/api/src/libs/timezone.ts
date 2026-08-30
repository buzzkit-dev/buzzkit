export type LocalTime = { year: number; month: number; day: number; hour: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let cached = formatters.get(timezone);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(timezone, cached);
  }
  return cached;
}

export function localTime(date: Date, timezone: string): LocalTime {
  const parts = Object.fromEntries(
    formatter(timezone)
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

export function localInstant(local: LocalTime, timezone: string): Date {
  const target = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  let guess = target;
  for (let round = 0; round < 3; round += 1) {
    const seen = localTime(new Date(guess), timezone);
    const drift = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute) - target;
    if (drift === 0) break;
    guess -= drift;
  }
  return new Date(guess);
}

export function localMidnight(date: Date, timezone: string): Date {
  const { year, month, day } = localTime(date, timezone);
  return localInstant({ year, month, day, hour: 0, minute: 0 }, timezone);
}

export function nextLocalTime(from: Date, hour: number, minute: number, timezone: string): Date {
  const day = localTime(from, timezone);
  const sameDay = localInstant({ ...day, hour, minute }, timezone);
  if (sameDay.getTime() >= from.getTime()) return sameDay;
  const next = new Date(Date.UTC(day.year, day.month - 1, day.day + 1));
  return localInstant(
    { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour, minute },
    timezone
  );
}
