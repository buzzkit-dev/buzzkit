import { describe, expect, it } from 'vitest';
import { renderTemplate, templatePaths } from '../../src/workflows/index';

describe('renderTemplate', () => {
  it('fills paths, blanks missing ones and lists what it reads', () => {
    const context = {
      trigger: { data: { endsAt: 'Friday', n: 2 } },
      subscriber: { attributes: { name: 'Ada' } },
    };
    expect(
      renderTemplate(
        'Hi {{ subscriber.attributes.name }}, {{trigger.data.n}} checks until {{ trigger.data.endsAt }}',
        context
      )
    ).toBe('Hi Ada, 2 checks until Friday');
    expect(renderTemplate('{{ trigger.data.missing }}!', context)).toBe('!');
    expect(templatePaths('{{ a.b }} and {{ c }}')).toEqual(['a.b', 'c']);
  });
});
