const formatters = new Map<string, Intl.DateTimeFormat>();

export function isTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (formatters.has(value)) return true;
  try {
    formatters.set(value, new Intl.DateTimeFormat('en-US', { timeZone: value }));
    return true;
  } catch {
    return false;
  }
}
