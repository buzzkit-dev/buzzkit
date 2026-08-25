import { Avatar, AvatarImage } from '@buzzkit/ui/components/avatar';
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
import { PastelAvatar } from '@buzzkit/ui/components/pastel-avatar';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { cn } from '@buzzkit/ui/lib/utils';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { CreateWorkspaceDialog } from '@/app/components/workspace/create-dialog';
import type { Tenant, Workspace } from '@/app/lib/api.server';

/**
 * A workspace always has a picture: the uploaded one when there is one,
 * otherwise a pastel gradient picked from the slug, so every workspace is
 * recognisable at a glance without anyone uploading anything.
 */
export function WorkspaceAvatar({
  slug,
  avatarUrl,
  size = 24,
  className,
}: {
  slug: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      <Avatar
        className={cn('corner-superellipse/1.125 rounded-lg', className)}
        style={{ width: size, height: size }}
      >
        <AvatarImage src={avatarUrl} alt='' className='rounded-lg' />
      </Avatar>
    );
  }
  return (
    <PastelAvatar seed={slug} size={size} className={cn('corner-superellipse/1.125 rounded-lg', className)} />
  );
}

export function WorkspaceSwitcher({
  workspaces,
  current,
  tenant,
  tenants,
}: {
  workspaces: Workspace[];
  current: Workspace;
  tenant: Tenant;
  tenants: Tenant[];
}) {
  const [creating, setCreating] = useState(false);
  const { pathname } = useLocation();
  const switchable = tenants.length > 1;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant='ghost' className='w-full justify-start pr-2.5 pl-1.25' />}
        >
          <WorkspaceAvatar slug={current.slug} avatarUrl={current.avatarUrl} />
          <Truncate>
            {current.name}
            {switchable && !tenant.isDefault && <span className='text-fg-2'> · {tenant.name}</span>}
          </Truncate>
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
                <WorkspaceAvatar slug={workspace.slug} avatarUrl={workspace.avatarUrl} size={22} />
                <Truncate>{workspace.name}</Truncate>
                {workspace.slug === current.slug && (
                  <Icon name='IconCheckmark1' className='ml-auto size-4 rotate-[4deg]' />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {switchable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Tenants</DropdownMenuLabel>
                {tenants.map((entry) => (
                  <DropdownMenuItem
                    key={entry.id}
                    icon='IconBuildingsFilled'
                    render={<Link to={`${pathname}?tenant=${entry.slug}`} />}
                  >
                    <Truncate>{entry.name}</Truncate>
                    {entry.slug === tenant.slug && (
                      <Icon name='IconCheckmark1' className='ml-auto size-4 rotate-[4deg]' />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  icon='IconSettingsGear4Filled'
                  render={<Link to={`/${current.slug}/settings/tenants`} />}
                >
                  Manage tenants
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
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
