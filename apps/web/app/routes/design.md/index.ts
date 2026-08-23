import designMarkdown from '../../../../../docs/design.md?raw';

export function loader() {
  return new Response(designMarkdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
