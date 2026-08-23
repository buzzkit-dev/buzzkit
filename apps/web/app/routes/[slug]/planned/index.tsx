import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { data } from 'react-router';
import { findNavigationPage } from '@/app/components/layout/navigation';
import type { Route } from './+types/index';

export async function loader({ params }: Route.LoaderArgs) {
  const page = findNavigationPage(`/${params['*'] ?? ''}`);
  if (!page || page.soon) throw data(null, { status: 404 });
  return { page };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.page.label} · BuzzKit` : 'BuzzKit' }];
}

export default function PlannedRoute({ loaderData }: Route.ComponentProps) {
  const { page } = loaderData;
  return (
    <div className='flex w-full items-center justify-center'>
      <EmptyState
        icon={page.icon ?? 'IconSettingsGear4Filled'}
        title={page.label}
        description={`${page.label} is planned for ${page.planned ?? 'a later phase'} of the dashboard.`}
      />
    </div>
  );
}
