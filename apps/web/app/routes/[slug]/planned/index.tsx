import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { data } from 'react-router';
import { findNavigationPage } from '@/app/components/layout/navigation';
import type { Route } from './+types/index';

export function loader({ params }: Route.LoaderArgs) {
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
    <div className='flex w-full flex-col gap-5'>
      <header className='flex flex-col gap-0.5'>
        <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
          {page.label}
        </h1>
        <p className='text-pretty text-base text-fg-2 leading-tighter'>
          Planned for {page.planned ?? 'a later phase'} of the dashboard.
        </p>
      </header>
      <EmptyState
        icon={page.icon ?? 'IconSettingsGear4Filled'}
        title={`${page.label} is on the way`}
        description='This page is built in a later phase. Everything you see in the sidebar is the plan.'
      />
    </div>
  );
}
