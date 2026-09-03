import { describe, expect, it } from 'vitest';
import { renderDevelopersIndex } from '../../../src/lib/llms/developers';
import { site } from '../../../src/lib/site';
import { listSitePaths, resolvesOnSite } from './links';

describe('renderDevelopersIndex', () => {
  const body = renderDevelopersIndex();

  it('links the developer hub, auth, the OpenAPI document, the catalog and the skill', () => {
    expect(body.startsWith('# BuzzKit for developers\n\n> ')).toBe(true);
    for (const path of [
      '/developers.md',
      '/auth.md',
      '/openapi.json',
      '/.well-known/api-catalog',
      '/.well-known/agent-skills/buzzkit/SKILL.md',
      '/llms.txt',
    ]) {
      expect(body).toContain(`${site.url}${path}`);
    }
    expect(body).toContain(site.docsUrl);
    expect(body).toContain(site.iosDocsUrl);
  });

  it('only links paths the site serves', () => {
    for (const path of listSitePaths(body)) expect(resolvesOnSite(path), path).toBe(true);
  });
});
