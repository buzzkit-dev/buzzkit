import { ACTIVITY_BODY_COMFORT, ACTIVITY_TITLE_COMFORT } from './constants';

export function resolveActivityNotice(title: string | null, body: string | null): string | null {
  const parts: string[] = [];
  if (title && title.length > ACTIVITY_TITLE_COMFORT) {
    parts.push(`title is ${title.length} chars (aim for ${ACTIVITY_TITLE_COMFORT})`);
  }
  if (body && body.length > ACTIVITY_BODY_COMFORT) {
    parts.push(`body is ${body.length} chars (aim for ${ACTIVITY_BODY_COMFORT})`);
  }
  if (parts.length === 0) return null;

  return `Keep Live Activity text short so it does not truncate on the Lock Screen: ${parts.join(', ')}.`;
}
