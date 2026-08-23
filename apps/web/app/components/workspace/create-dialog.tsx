import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@buzzkit/ui/components/dialog';
import { useEffect, useRef } from 'react';
import { useFetcher, useLocation, useParams } from 'react-router';
import { WorkspaceFields } from '@/app/components/workspace/fields';
import type { FormErrors } from '@/app/hooks/use-focus-first-error';

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
        </DialogHeader>
        <CreateWorkspaceForm onCreated={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CreateWorkspaceForm({ onCreated }: { onCreated: () => void }) {
  const fetcher = useFetcher<{ errors?: FormErrors }>();
  const location = useLocation();
  const { slug } = useParams();
  const openedAt = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== openedAt.current) onCreated();
  }, [location.pathname, onCreated]);

  return (
    <fetcher.Form method='post' action={`/${slug}`} className='w-full'>
      <input type='hidden' name='intent' value='create-workspace' />
      <WorkspaceFields errors={fetcher.data?.errors} pending={fetcher.state !== 'idle'} />
    </fetcher.Form>
  );
}
