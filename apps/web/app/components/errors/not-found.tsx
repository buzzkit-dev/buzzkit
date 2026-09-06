import { Button } from '@buzzkit/ui/components/button';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Link } from 'react-router';
import { ErrorFrame } from '@/app/components/errors/frame';

const TITLE = 'Page not found';
const DESCRIPTION = 'That page does not exist. Check the URL, or head back to your workspaces.';

export function NotFoundPage() {
  return (
    <ErrorFrame code='404' title={TITLE} description={DESCRIPTION}>
      <Button size='sm' nativeButton={false} render={<Link to='/dashboard' />}>
        Go to your workspaces
      </Button>
    </ErrorFrame>
  );
}

export function NotFoundNotice() {
  return (
    <EmptyState icon='IconExclamationCircle' title={TITLE} description={DESCRIPTION}>
      <Button size='sm' variant='soft' nativeButton={false} render={<Link to='/dashboard' />}>
        Go to your workspaces
      </Button>
    </EmptyState>
  );
}
