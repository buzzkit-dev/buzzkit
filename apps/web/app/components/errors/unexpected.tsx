import { Button } from '@buzzkit/ui/components/button';
import { CardContent } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { Link } from 'react-router';
import { ErrorFrame } from '@/app/components/errors/frame';

export function ErrorPage({
  title = 'Something broke',
  code,
  details,
  stack,
  onRetry,
}: {
  title?: string;
  code?: string;
  details?: string;
  stack?: string;
  onRetry?: () => void;
}) {
  return (
    <ErrorFrame
      code={code}
      title={title}
      description={details}
      content={
        stack ? (
          <CardContent>
            <CodeBlock code={stack} className='max-h-72 overflow-auto' />
          </CardContent>
        ) : null
      }
    >
      {onRetry ? (
        <Button size='sm' onClick={onRetry}>
          Try again
        </Button>
      ) : null}
      <Button
        size='sm'
        variant={onRetry ? 'soft' : 'default'}
        nativeButton={false}
        render={<Link to='/dashboard' />}
      >
        Go to your workspaces
      </Button>
      <Button size='sm' variant='soft' nativeButton={false} render={<a href='mailto:support@buzzkit.dev' />}>
        Contact support
      </Button>
    </ErrorFrame>
  );
}
