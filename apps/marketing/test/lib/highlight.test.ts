import { describe, expect, it } from 'vitest';
import { highlight } from '../../src/lib/highlight';
import { SEND_CURL, SEND_REQUEST, SWIFT } from '../../src/lib/snippets';

describe('highlight', () => {
  it('detects the language from the snippet', async () => {
    expect(await highlight(SEND_REQUEST)).toContain('var(--code-');
    expect(await highlight(SWIFT)).toContain('BuzzKit');
    expect(await highlight('{ "a": 1 }')).toContain('var(--code-');
  });

  it('highlights the JSON body of a curl call as JSON', async () => {
    const html = await highlight(SEND_CURL, 'bash');
    expect(html).toContain(`<span style="color:var(--code-token-keyword)">    "to"</span>`);
    expect(html).toContain(`<span style="color:var(--code-token-string-expression)"> "user_42"</span>`);
    expect(html).toContain(`<span style="color:var(--code-token-punctuation)">'</span>`);
  });

  it('only colors through the token variables', async () => {
    const html = await highlight(SEND_REQUEST, 'http');
    expect(html).not.toMatch(/#[0-9a-f]{6}/i);
  });
});
