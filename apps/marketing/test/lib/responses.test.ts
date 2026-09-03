import { describe, expect, it } from 'vitest';
import { markdownResponse, pngResponse, textResponse } from '../../src/lib/responses';

describe('responses', () => {
  it('type markdown, text and png bodies', async () => {
    const markdown = markdownResponse('# Hi');
    expect(markdown.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(await markdown.text()).toBe('# Hi');
    expect(textResponse('hi').headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(pngResponse(new ArrayBuffer(4)).headers.get('Content-Type')).toBe('image/png');
  });
});
