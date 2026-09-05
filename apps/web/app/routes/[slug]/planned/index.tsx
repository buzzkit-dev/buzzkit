import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { data, useParams } from 'react-router';
import { findNavigationPage, type NavigationPage } from '@/app/components/layout/navigation';
import { PageHeader } from '@/app/components/layout/page-header';
import type { PageHandle } from '@/app/components/loading/handle';
import type { Route } from './+types/index';

export function loader({ params }: Route.LoaderArgs) {
  const page = findNavigationPage(`/${params['*'] ?? ''}`);
  if (!page || page.soon) throw data(null, { status: 404 });
  return { page };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.page.label} · BuzzKit` : 'BuzzKit' }];
}

function PlannedPage({ page }: { page: NavigationPage }) {
  return (
    <div className='flex w-full flex-col gap-5'>
      <PageHeader
        title={page.label}
        description={`Planned for ${page.planned ?? 'a later phase'} of the dashboard.`}
      />
      <EmptyState
        icon={page.icon ?? 'IconSettingsGear4Filled'}
        title={`${page.label} is on the way`}
        description='This page is built in a later phase. Everything you see in the sidebar is the plan.'
      />
    </div>
  );
}

function PlannedPending() {
  const params = useParams();
  const page = findNavigationPage(`/${params['*'] ?? ''}`);
  return page ? <PlannedPage page={page} /> : null;
}

export default function PlannedRoute({ loaderData }: Route.ComponentProps) {
  return <PlannedPage page={loaderData.page} />;
}

export const handle: PageHandle = { skeleton: <PlannedPending /> };
