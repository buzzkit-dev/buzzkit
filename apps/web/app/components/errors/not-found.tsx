import { Button } from '@buzzkit/ui/components/button';
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className='flex min-h-svh items-center justify-center p-6'>
      <div className='flex w-full max-w-lg flex-col gap-6'>
        <header className='flex flex-col'>
          <span className='text-fg-2 text-xs'>404</span>
          <h1 className='mt-1.5 text-balance font-medium text-3xl text-fg-4 leading-tighter tracking-tight'>
            Page not found
          </h1>
          <p className='mt-0.5 text-pretty text-fg-2 text-sm'>
            That page does not exist. Check the URL, or head back to the dashboard.
          </p>
        </header>
        <div>
          <Button nativeButton={false} render={<Link to='/dashboard' />}>
            Go home
          </Button>
        </div>
      </div>
    </main>
  );
}
