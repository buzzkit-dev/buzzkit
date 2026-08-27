export function describeEvents(events: string[]): string {
  if (events.length === 0 || events.includes('*')) return 'Every event';
  return events.length === 1 ? events[0]! : `${events.length} events`;
}
