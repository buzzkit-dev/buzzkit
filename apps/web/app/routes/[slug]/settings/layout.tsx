import { Outlet, useOutletContext } from 'react-router';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';

export default function SettingsLayout() {
  const context = useOutletContext<WorkspaceOutletContext>();
  return (
    <div className='flex w-full flex-col gap-5'>
      <Outlet context={context} />
    </div>
  );
}
