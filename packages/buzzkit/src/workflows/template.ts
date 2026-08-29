import { resolvePath } from '../expressions/evaluate';

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_$.-]+)\s*\}\}/g;

export function renderTemplate(text: string, context: unknown): string {
  return text.replace(PLACEHOLDER_PATTERN, (_, path: string) => {
    const value = resolvePath(context, path);
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

export function templatePaths(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1] as string);
}
