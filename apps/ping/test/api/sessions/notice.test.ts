import {
  ACTIVITY_BODY_COMFORT,
  ACTIVITY_TITLE_COMFORT,
  resolveActivityNotice,
} from '@buzzkit/ping/api/sessions/index';
import { describe, expect, it } from 'vitest';

describe('resolveActivityNotice', () => {
  it('says nothing when the text is comfortably short', () => {
    expect(resolveActivityNotice('Running migrations', '3 of 7 applied')).toBeNull();
  });

  it('flags a long title', () => {
    const notice = resolveActivityNotice('T'.repeat(ACTIVITY_TITLE_COMFORT + 1), null);

    expect(notice).toContain('title');
    expect(notice).toContain(String(ACTIVITY_TITLE_COMFORT));
  });

  it('flags a long body', () => {
    const notice = resolveActivityNotice('Short', 'B'.repeat(ACTIVITY_BODY_COMFORT + 1));

    expect(notice).toContain('body');
  });

  it('flags both at once', () => {
    const notice = resolveActivityNotice(
      'T'.repeat(ACTIVITY_TITLE_COMFORT + 1),
      'B'.repeat(ACTIVITY_BODY_COMFORT + 1)
    );

    expect(notice).toContain('title');
    expect(notice).toContain('body');
  });
});
