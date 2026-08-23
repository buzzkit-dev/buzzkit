import { Avatar, AvatarFallback, AvatarImage } from '@buzzkit/ui/components/avatar';
import { Button } from '@buzzkit/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@buzzkit/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { Icon } from '@buzzkit/ui/components/icon';
import { Input } from '@buzzkit/ui/components/input';
import { Label } from '@buzzkit/ui/components/label';
import { toast } from '@buzzkit/ui/components/sonner';
import { useEffect, useState } from 'react';
import { useParams, useSubmit } from 'react-router';
import { useTheme } from '@/app/components/layout/theme-provider';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import type { Profile } from '@/app/lib/api.server';
import { initials } from '@/app/lib/utils/format';

export function AccountMenu({ profile }: { profile: Profile }) {
  const submit = useSubmit();
  const workspaceAction = useWorkspaceAction();
  const { theme, setTheme } = useTheme();
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type='button'
              aria-label='Account menu'
              className='cursor-pointer rounded-full outline-none transition-[scale] duration-150 focus-visible:ring-2 focus-visible:ring-primary-2 active:scale-[0.96]'
            />
          }
        >
          <Avatar className='size-7'>
            {profile.image && <AvatarImage src={profile.image} alt='' />}
            <AvatarFallback className='text-sm'>{initials(profile.name)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-60'>
          <DropdownMenuGroup>
            <DropdownMenuLabel className='flex flex-col py-1.5'>
              <span className='truncate text-fg-4 text-sm'>{profile.name}</span>
              <span className='truncate font-normal text-fg-2 text-xs'>{profile.email}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem icon='IconPeopleFilled' onClick={() => setEditOpen(true)}>
              Edit profile
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Icon name='IconMoonFilled' />
                Theme
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(value) => setTheme(value as typeof theme)}
                >
                  <DropdownMenuRadioItem value='light'>
                    <Icon name='IconSunFilled' />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value='dark'>
                    <Icon name='IconMoonFilled' />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value='system'>
                    <Icon name='IconImacFilled' />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              icon='IconArrowBoxRight'
              onClick={() => submit({ intent: 'sign-out' }, { method: 'post', action: workspaceAction })}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditProfileDialog profile={profile} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

function EditProfileDialog({
  profile,
  open,
  onOpenChange,
}: {
  profile: Profile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(profile.name);
  const workspaceAction = useWorkspaceAction();
  const { submit, pending } = useActionFetcher(
    () => {
      onOpenChange(false);
      toast.success('Profile updated.');
    },
    { action: workspaceAction }
  );

  useEffect(() => {
    if (open) setName(profile.name);
  }, [open, profile.name]);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed !== profile.name && !pending;

  const save = () => {
    if (!canSave) return;
    submit('profile', { name: trimmed });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>How you appear across BuzzKit.</DialogDescription>
        </DialogHeader>
        <div className='flex w-full flex-col gap-4'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='profile-name'>Name</Label>
            <Input
              id='profile-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSave) save();
              }}
              maxLength={100}
              autoComplete='name'
            />
            <span className='text-fg-2 text-xs'>
              Visible to your teammates in every workspace you are in.
            </span>
          </div>
          <Button className='mt-1 w-full' disabled={!canSave} onClick={save}>
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useWorkspaceAction(): string {
  const { slug } = useParams();
  return `/${slug}`;
}
