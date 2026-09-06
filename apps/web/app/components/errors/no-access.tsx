import { Button } from '@buzzkit/ui/components/button';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Link } from 'react-router';
import { ErrorFrame } from '@/app/components/errors/frame';

const TITLE = 'You do not have access to this workspace';
const DESCRIPTION = 'Ask an owner to add you, or switch to a workspace you have access to.';

export function NoAccessPage() {
  return (
    <ErrorFrame code='403' title={TITLE} description={DESCRIPTION}>
      <Button size='sm' nativeButton={false} render={<Link to='/dashboard' />}>
        Go to your workspaces
      </Button>
    </ErrorFrame>
  );
}

export function NoAccessNotice() {
  return (
    <EmptyState icon='IconKeyholeFilled' title={TITLE} description={DESCRIPTION}>
      <Button size='sm' variant='soft' nativeButton={false} render={<Link to='/dashboard' />}>
        Go to your workspaces
      </Button>
    </EmptyState>
  );
}
