import { data } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { NoAccessNotice, NoAccessPage } from '@/app/components/errors/no-access';
import { NotFoundNotice, NotFoundPage } from '@/app/components/errors/not-found';
import { ErrorPage } from '@/app/components/errors/unexpected';
import type { Route } from './+types/index';

export function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  if (env.ENVIRONMENT !== 'development') throw data(null, { status: 404 });
  return null;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className='flex flex-col gap-2'>
      <h2 className='px-6 pt-6 font-medium text-fg-2 text-xs'>{label}</h2>
      {children}
    </section>
  );
}

export default function ErrorsPreviewRoute() {
  return (
    <div className='flex flex-col divide-y divide-bg-3'>
      <Section label='404 · full page (root error boundary)'>
        <NotFoundPage />
      </Section>
      <Section label='403 · full page (root error boundary)'>
        <NoAccessPage />
      </Section>
      <Section label='500 · full page (root error boundary)'>
        <ErrorPage
          code='500'
          details='Reload the page. If it keeps happening, contact support.'
          stack={
            "TypeError: Cannot read properties of undefined (reading 'slug')\n    at WorkspaceLayout (app/routes/[slug]/layout.tsx:118:24)\n    at renderWithHooks (react-dom-server.js:5448:16)\n    at renderIndeterminateComponent (react-dom-server.js:5521:15)"
          }
        />
      </Section>
      <Section label='404 · inside the workspace chrome'>
        <div className='flex min-h-80 flex-col p-6'>
          <NotFoundNotice />
        </div>
      </Section>
      <Section label='403 · inside the workspace chrome'>
        <div className='flex min-h-80 flex-col p-6'>
          <NoAccessNotice />
        </div>
      </Section>
    </div>
  );
}
