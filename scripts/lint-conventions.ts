import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from '@babel/parser';

type Violation = { file: string; line: number; message: string };

type BabelComment = { type: string; value: string; loc: { start: { line: number } } };

type BabelNode = {
  type: string;
  loc?: { start: { line: number } };
  [key: string]: unknown;
};

const ROOTS = [
  'apps/api/src',
  'apps/api/test',
  'apps/web/app',
  'apps/marketing/src',
  'apps/marketing/worker',
  'apps/marketing/scripts',
  'packages',
];

const SKIPPED_SEGMENTS = new Set(['node_modules', '.types', 'dist', '.wrangler', 'generated']);

const BANNED_VERB_PATTERN = /^(get|fetch|load|set|delete|destroy)[A-Z]/;

const BANNED_VERB_ALLOWLIST = new Set(['deleteCache', 'getStaticPaths']);

const VERB_CHECK_ROOTS = ['apps/api/src', 'apps/marketing', 'packages'];

const COMMENT_CHECK_EXCLUDED_ROOTS = ['packages/ui'];

const ALLOWED_COMMENT_PATTERN = /^\s*(biome-ignore|@ts-|\/\s*<reference|\/v1\/|#region|#endregion)/;

function readSource(file: string): string {
  const source = readFileSync(file, 'utf8');
  if (!file.endsWith('.astro')) return source;
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1]! : '';
}

function listSourceFiles(root: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(root)) {
    if (SKIPPED_SEGMENTS.has(entry)) continue;

    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx|astro)$/.test(entry) && !entry.endsWith('.d.ts')) files.push(path);
  }

  return files;
}

function collectCommentViolations(file: string, comments: BabelComment[], violations: Violation[]): void {
  for (const comment of comments) {
    const inner = comment.value.trim();
    if (inner.length === 0 || ALLOWED_COMMENT_PATTERN.test(inner)) continue;

    violations.push({
      file,
      line: comment.loc.start.line,
      message: `Comment found — names and structure carry the meaning, docs/ carries the rest: "${inner.slice(0, 60)}"`,
    });
  }
}

function declaredFunctionName(node: BabelNode): { name: string; line: number } | null {
  if (node.type === 'FunctionDeclaration') {
    const id = node.id as BabelNode & { name: string };
    if (id?.name) return { name: id.name, line: id.loc?.start.line ?? 0 };
  }

  if (node.type === 'ClassMethod' || node.type === 'ObjectMethod') {
    const key = node.key as BabelNode & { name?: string };
    if (key?.type === 'Identifier' && key.name) {
      return { name: key.name, line: key.loc?.start.line ?? 0 };
    }
  }

  if (node.type === 'VariableDeclarator') {
    const id = node.id as BabelNode & { name?: string };
    const init = node.init as BabelNode | null;
    const isFunction = init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression';
    if (id?.type === 'Identifier' && id.name && isFunction) {
      return { name: id.name, line: id.loc?.start.line ?? 0 };
    }
  }

  return null;
}

function walk(node: BabelNode, visit: (node: BabelNode) => void): void {
  visit(node);

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && 'type' in child) walk(child as BabelNode, visit);
      }
      continue;
    }
    if (value && typeof value === 'object' && 'type' in value) walk(value as BabelNode, visit);
  }
}

function collectVerbViolations(file: string, program: BabelNode, violations: Violation[]): void {
  walk(program, (node) => {
    const declaration = declaredFunctionName(node);
    if (!declaration) return;
    if (!BANNED_VERB_PATTERN.test(declaration.name)) return;
    if (BANNED_VERB_ALLOWLIST.has(declaration.name)) return;

    violations.push({
      file,
      line: declaration.line,
      message: `Banned verb prefix on "${declaration.name}" — use the catalog: find*/select*/list*/resolve*/create*/update*/upsert*/replace*/softDelete*/remove*/revoke*/apply*/record* (see the conventions skill)`,
    });
  });
}

function run(): void {
  const violations: Violation[] = [];

  for (const root of ROOTS) {
    for (const file of listSourceFiles(root)) {
      const source = readSource(file);
      let parsed: { program: BabelNode; comments?: BabelComment[] | null };
      try {
        parsed = parse(source, {
          sourceType: 'module',
          plugins: file.endsWith('.ts') ? ['typescript'] : ['typescript', 'jsx'],
          attachComment: false,
        }) as unknown as { program: BabelNode; comments?: BabelComment[] | null };
      } catch (error) {
        violations.push({
          file,
          line: 1,
          message: `Could not parse: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }

      if (!COMMENT_CHECK_EXCLUDED_ROOTS.some((excluded) => file.startsWith(excluded))) {
        collectCommentViolations(file, parsed.comments ?? [], violations);
      }
      if (VERB_CHECK_ROOTS.some((verbRoot) => file.startsWith(verbRoot))) {
        collectVerbViolations(file, parsed.program, violations);
      }
    }
  }

  if (violations.length === 0) return;

  for (const violation of violations) {
    process.stderr.write(
      `${relative(process.cwd(), violation.file)}:${violation.line} ${violation.message}\n`
    );
  }
  process.stderr.write(`\n${violations.length} convention violation(s).\n`);
  process.exit(1);
}

run();
