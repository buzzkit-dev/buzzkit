import { renderTemplate, renderTemplateValue } from '@buzzkit/api/engine/template';
import { describe, expect, it } from 'vitest';

const context = {
  trigger: {
    data: {
      endsAt: '2026-09-04T09:00:00Z',
      checks: 1234.5,
      name: 'ada lovelace',
      n: 2,
      endsOn: 'Friday',
      tags: ['a', 'b', 'c'],
    },
  },
  subscriber: { attributes: { name: 'Ada' } },
  vars: { cancel: true },
};

describe('renderTemplate', () => {
  it('fills paths and blanks missing ones', () => {
    expect(
      renderTemplate(
        'Hi {{ subscriber.attributes.name }}, {{trigger.data.n}} checks until {{ trigger.data.endsOn }}',
        context
      )
    ).toBe('Hi Ada, 2 checks until Friday');
    expect(renderTemplate('{{ trigger.data.missing }}!', context)).toBe('!');
  });

  it('applies filters and the condition', () => {
    expect(renderTemplate('{{ trigger.data.endsAt | date }}', context)).toBe('September 4, 2026');
    expect(renderTemplate('{{ trigger.data.endsAt | date: "short" }}', context)).toBe('9/4/26');
    expect(renderTemplate('{{ trigger.data.endsAt | time }}', context, { timezone: 'Europe/Berlin' })).toBe(
      '11:00 AM'
    );
    expect(renderTemplate('{{ trigger.data.checks | number }}', context)).toBe('1,234.5');
    expect(renderTemplate('{{ trigger.data.checks | number: 0 }}', context)).toBe('1,235');
    expect(renderTemplate('{{ trigger.data.missing | number }}', context)).toBe('');
    expect(renderTemplate('{{ subscriber.attributes.nick | default: "there" }}', context)).toBe('there');
    expect(renderTemplate('{{ subscriber.attributes.name | default: "there" }}', context)).toBe('Ada');
    expect(renderTemplate('{{ trigger.data.name | upcase }}', context)).toBe('ADA LOVELACE');
    expect(renderTemplate('{{ subscriber.attributes.name | downcase }}', context)).toBe('ada');
    expect(renderTemplate('{{ trigger.data.name | truncate: 6 }}', context)).toBe('ada l…');
    expect(renderTemplate('{{ trigger.data.name | truncate: 40 }}', context)).toBe('ada lovelace');
    expect(
      renderTemplate(
        '{{ vars.cancel ? "Resubscribe to keep your alerts." : "Your alerts continue." }}',
        context
      )
    ).toBe('Resubscribe to keep your alerts.');
    expect(renderTemplate('{{ trigger.data.missing ? "a" : trigger.data.name | upcase }}', context)).toBe(
      'ADA LOVELACE'
    );
    expect(renderTemplate("{{ trigger.data.n | default: 'none' }} of {{ 'it' | upcase }}", context)).toBe(
      '2 of IT'
    );
    expect(() => renderTemplate('{{ a.b | nope }}', context)).toThrow('"nope" is not a filter');
  });

  it('shapes text, numbers and lists', () => {
    expect(renderTemplate('{{ trigger.data.name | capitalize }}', context)).toBe('Ada lovelace');
    expect(renderTemplate('{{ "  hi  " | strip | append: "!" | prepend: "> " }}', context)).toBe('> hi!');
    expect(renderTemplate('{{ "a-b-c" | replace: "-", " " }}', context)).toBe('a b c');
    expect(renderTemplate('{{ trigger.data.n | pluralize: "check" }}', context)).toBe('2 checks');
    expect(renderTemplate('{{ 1 | pluralize: "day" }} / {{ 3 | pluralize: "day", "days" }}', context)).toBe(
      '1 day / 3 days'
    );
    expect(
      renderTemplate(
        '{{ trigger.data.tags | size }} {{ trigger.data.tags | first }} {{ trigger.data.tags | last }}',
        context
      )
    ).toBe('3 a c');
    expect(
      renderTemplate('{{ trigger.data.tags | join: ", " }} {{ trigger.data.tags | join }}', context)
    ).toBe('a, b, c a b c');
    expect(renderTemplate('{{ "a b&c" | url_encode }}', context)).toBe('a%20b%26c');
    expect(renderTemplate('{{ trigger.data.tags | json }}', context)).toBe('["a","b","c"]');
    expect(
      renderTemplate('{{ trigger.data.checks | round }} {{ trigger.data.checks | round: 1 }}', context)
    ).toBe('1235 1234.5');
    expect(
      renderTemplate(
        '{{ trigger.data.checks | ceil }} {{ trigger.data.checks | floor }} {{ -2 | abs }}',
        context
      )
    ).toBe('1235 1234 2');
    expect(
      renderTemplate(
        '{{ trigger.data.n | plus: 3 }} {{ trigger.data.n | minus: 3 }} {{ trigger.data.n | times: 4 }}',
        context
      )
    ).toBe('5 -1 8');
    expect(
      renderTemplate(
        '{{ 7 | divided_by: 2 }} {{ 7 | modulo: 2 }} {{ 7 | at_least: 10 }} {{ 7 | at_most: 5 }}',
        context
      )
    ).toBe('3.5 1 10 5');
    expect(renderTemplate('{{ 7 | divided_by: 0 }}|{{ "x" | plus: 1 }}|', context)).toBe('||');
    expect(renderTemplateValue('{{ trigger.data.n | plus: 1 }}', context)).toBe(3);
  });

  it('does date arithmetic and distances from now', () => {
    const now = new Date('2026-09-01T09:00:00Z');
    expect(renderTemplate('{{ trigger.data.endsAt | plus: "1d" | date: "weekday" }}', context)).toBe(
      'Saturday'
    );
    expect(renderTemplate('{{ trigger.data.endsAt | minus: "2h" | time }}', context)).toBe('7:00 AM');
    expect(renderTemplate('{{ now | plus: "3d" | date }}', context, { now })).toBe('September 4, 2026');
    expect(renderTemplate('{{ trigger.data.endsAt | until }}', context, { now })).toBe('3 days');
    expect(renderTemplate('{{ trigger.data.endsAt | until: "short" }}', context, { now })).toBe('3d');
    expect(renderTemplate('{{ trigger.data.endsAt | plus: "1h" | until }}', context, { now })).toBe('3 days');
    expect(renderTemplate('{{ now | plus: "90m" | until }}', context, { now })).toBe('2 hours');
    expect(renderTemplate('{{ now | plus: "10m" | until }}', context, { now })).toBe('10 minutes');
    expect(renderTemplate('{{ now | minus: "8d" | ago }}', context, { now })).toBe('1 week');
    expect(renderTemplate('{{ now | minus: "1d" | until }}', context, { now })).toBe('0 minutes');
    expect(renderTemplate('{{ "soon" | until }}|', context, { now })).toBe('|');
  });

  it('keeps the type of a lone placeholder', () => {
    expect(renderTemplateValue('{{ trigger.data.checks }}', context)).toBe(1234.5);
    expect(renderTemplateValue('{{ vars.cancel }}', context)).toBe(true);
    expect(renderTemplateValue('{{ trigger.data.checks }}!', context)).toBe('1234.5!');
    expect(renderTemplateValue('plain', context)).toBe('plain');
  });
});
