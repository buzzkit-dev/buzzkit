import type { Subscriber } from '@/app/lib/api.server';

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function attribute(subscriber: Pick<Subscriber, 'attributes'>, key: string): string | null {
  const value = (subscriber.attributes as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export function countryName(code: string): string {
  try {
    return regionNames.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
