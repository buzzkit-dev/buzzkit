import { Avatar, AvatarFallback, AvatarImage } from '@buzzkit/ui/components/avatar';
import { Button } from '@buzzkit/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { Icon } from '@buzzkit/ui/components/icon';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { cn } from '@buzzkit/ui/lib/utils';
import { useState } from 'react';
import { Link } from 'react-router';
import { CreateWorkspaceDialog } from '@/app/components/workspace/create-dialog';
import type { Workspace } from '@/app/lib/api.server';

export function WorkspaceAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  return (
    <Avatar size='sm' className={cn('corner-superellipse/1.125 rounded-lg', className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt='' className='rounded-lg' />}
      <AvatarFallback className='rounded-lg'>{name.charAt(0)}</AvatarFallback>
    </Avatar>
  );
}

export function WorkspaceSwitcher({ workspaces, current }: { workspaces: Workspace[]; current: Workspace }) {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant='ghost' className='w-full justify-start pr-2.5 pl-1.25' />}
        >
          <WorkspaceAvatar name={current.name} avatarUrl={current.avatarUrl} />
          <Truncate>{current.name}</Truncate>
          <Icon name='IconChevronGrabberVertical' className='ml-auto size-4 text-fg-2' />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-60'>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                className='py-1 pl-1.25'
                render={<Link to={`/${workspace.slug}`} />}
              >
                <WorkspaceAvatar
                  name={workspace.name}
                  avatarUrl={workspace.avatarUrl}
                  className='size-5.5!'
                />
                <Truncate>{workspace.name}</Truncate>
                {workspace.slug === current.slug && (
                  <Icon name='IconCheckmark1' className='ml-auto size-4 rotate-[4deg]' />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setCreating(true)} icon='IconPlusMedium'>
              Create workspace
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
