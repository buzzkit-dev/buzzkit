export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const elapsed = Math.floor((Date.now() - then) / 1000);
  const seconds = Math.abs(elapsed);
  if (seconds < 60) return 'Now';
  const ahead = elapsed < 0;
  const relative = (amount: number, unit: string) => (ahead ? `in ${amount}${unit}` : `${amount}${unit}`);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return relative(minutes, 'm');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relative(hours, 'h');
  const days = Math.floor(hours / 24);
  if (days < 7) return relative(days, 'd');
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return relative(weeks, 'w');
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
