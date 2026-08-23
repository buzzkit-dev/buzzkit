import { Button } from '@buzzkit/ui/components/button';

export function ErrorPage({
  title = 'Something broke',
  details,
  stack,
  onRetry,
  onGoHome,
}: {
  title?: string;
  details?: string;
  stack?: string;
  onRetry?: () => void;
  onGoHome?: () => void;
}) {
  return (
    <main className='flex min-h-svh items-center justify-center p-6'>
      <div className='flex w-full max-w-lg flex-col gap-4'>
        <header className='flex flex-col'>
          <h1 className='text-balance font-medium text-3xl text-fg-4 leading-tighter tracking-tight'>
            {title}
          </h1>
          {details ? <p className='text-pretty text-fg-2'>{details}</p> : null}
        </header>

        {stack ? (
          <pre className='max-h-96 overflow-auto rounded-xl bg-bg-2 p-3 text-fg-3 text-xs leading-relaxed'>
            <code>{stack}</code>
          </pre>
        ) : null}

        {onRetry || onGoHome ? (
          <div className='flex items-center gap-2'>
            {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
            {onGoHome ? (
              <Button variant={onRetry ? 'soft' : 'default'} onClick={onGoHome}>
                Go home
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
