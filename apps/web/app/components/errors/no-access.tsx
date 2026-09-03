import { Button } from '@buzzkit/ui/components/button';
import { Link } from 'react-router';

export function NoAccessPage() {
  return (
    <main className='flex min-h-svh items-center justify-center p-6'>
      <div className='flex w-full max-w-lg flex-col gap-6'>
        <header className='flex flex-col gap-1.5'>
          <span className='text-fg-2 text-xs'>403</span>
          <h1 className='text-balance font-medium text-3xl text-fg-4 leading-tighter tracking-tight'>
            You don&rsquo;t have access to this workspace
          </h1>
          <p className='text-pretty text-fg-2 text-sm'>
            Ask an owner to add you, or switch to a workspace you belong to.
          </p>
        </header>
        <div>
          <Button nativeButton={false} render={<Link to='/dashboard' />}>
            Go to your workspaces
          </Button>
        </div>
      </div>
    </main>
  );
}
