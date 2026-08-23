import { Outlet, useOutletContext } from 'react-router';
import { SettingsNav } from '@/app/components/settings/navigation';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/layout';

export default function SettingsLayout({ params }: Route.ComponentProps) {
  const context = useOutletContext<WorkspaceOutletContext>();

  return (
    <div className='w-full overflow-y-auto'>
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-8 pt-4 pb-8 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-10'>
        <div className='shrink-0 sm:sticky sm:top-2 sm:self-start'>
          <SettingsNav workspaceSlug={params.slug} />
        </div>
        <div className='flex min-w-0 flex-col gap-5'>
          <Outlet context={context} />
        </div>
      </div>
    </div>
  );
}
