const LAST_UPDATED = '2026-09-02';

export function frontmatter(fields: { title: string; description: string; canonical: string }): string {
  return `---
title: ${fields.title}
description: ${fields.description}
canonical: ${fields.canonical}
last-updated: ${LAST_UPDATED}
---`;
}
