import { Outlet, useOutletContext } from 'react-router';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';

export default function SettingsLayout() {
  const context = useOutletContext<WorkspaceOutletContext>();
  return (
    <div className='mx-auto flex w-full max-w-3xl flex-col gap-5'>
      <Outlet context={context} />
    </div>
  );
}
