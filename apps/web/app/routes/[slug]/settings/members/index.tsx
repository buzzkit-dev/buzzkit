import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@buzzkit/ui/components/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@buzzkit/ui/components/avatar';
import { Button } from '@buzzkit/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@buzzkit/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buzzkit/ui/components/select';
import { toast } from '@buzzkit/ui/components/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { RoleBadge } from '@/app/components/badges';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { Time } from '@/app/hooks/use-time-ago';
import { membersAction } from '@/app/lib/actions/members.server';
import { ApiError, type Invite, listInvites, listMembers, type Member } from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

type Role = 'member' | 'admin' | 'owner';

const ROLES: { value: Role; label: string; description: string }[] = [
  {
    value: 'member',
    label: 'Member',
    description: 'Members can read everything and manage subscribers, topics and messages.',
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Admins can also manage channels, tenants, API keys and who has access.',
  },
  {
    value: 'owner',
    label: 'Owner',
    description: 'Owners can also delete the workspace and hand over ownership.',
  },
];

export function meta() {
  return [{ title: 'Members · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const ctx = { request, env };
  const [members, invites] = await Promise.all([
    listMembers(ctx, token, params.slug),
    listInvites(ctx, token, params.slug).catch((error) => {
      if (error instanceof ApiError && error.status === 403) return [] as Invite[];
      throw error;
    }),
  ]);
  return { members, invites };
}

export const action = membersAction;

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('');
}

function MemberAvatar({ member }: { member: Member }) {
  const { user } = member;
  if (user.image) {
    return (
      <Avatar size='sm'>
        <AvatarImage src={user.image} alt='' />
        <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
      </Avatar>
    );
  }
  return <Avatar size='sm' name={user.email} label={user.name ?? user.email} picture='orb' />;
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { submit, pending } = useActionFetcher((data) => {
    if (data.emailSent) {
      toast.success('Invite sent', { description: `${data.email} has an email with the link.` });
      onOpenChange(false);
      return;
    }
    setLink({ email: String(data.email), href: `${window.location.origin}/invite/${data.token}` });
  });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [link, setLink] = useState<{ email: string; href: string } | null>(null);
  const valid = email.trim().includes('@');
  const description = ROLES.find((entry) => entry.value === role)?.description;

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setRole('member');
    setLink(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>{link ? 'Share the invite link' : 'Invite member'}</DialogTitle>
        </DialogHeader>
        {link ? (
          <FieldGroup className='w-full'>
            <Field>
              <FieldLabel htmlFor='invite-link'>Invite link</FieldLabel>
              <Input id='invite-link' value={link.href} readOnly onFocus={(event) => event.target.select()} />
              <FieldDescription>
                The email to {link.email} could not be sent. Send them this link instead; it works for 7 days.
              </FieldDescription>
            </Field>
            <Button
              className='w-full'
              onClick={() =>
                navigator.clipboard.writeText(link.href).then(
                  () => toast.success('Copied to clipboard'),
                  () =>
                    toast.error('Unable to copy', { description: 'Select the link and copy it manually.' })
                )
              }
            >
              Copy link
            </Button>
          </FieldGroup>
        ) : (
          <FieldGroup className='w-full'>
            <Field>
              <FieldLabel htmlFor='invite-email'>Email</FieldLabel>
              <Input
                id='invite-email'
                type='email'
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder='name@company.com'
                autoComplete='off'
                spellCheck={false}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && valid && !pending) submit('invite', { email, role });
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='invite-role'>Role</FieldLabel>
              <Select
                items={ROLES.filter((entry) => entry.value !== 'owner')}
                value={role}
                onValueChange={(value) => setRole(value as Role)}
              >
                <SelectTrigger id='invite-role' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter((entry) => entry.value !== 'owner').map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{description}</FieldDescription>
            </Field>
            <Button
              className='w-full'
              disabled={!valid || pending}
              loading={pending}
              onClick={() => submit('invite', { email, role })}
            >
              Send invite
            </Button>
          </FieldGroup>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({
  member,
  self,
  actor,
  onRemove,
}: {
  member: Member;
  self: boolean;
  actor: Role | null;
  onRemove: (member: Member) => void;
}) {
  const { submit, pending } = useActionFetcher();
  const canManage = actor === 'owner' || (actor === 'admin' && member.role !== 'owner');
  const roles = ROLES.filter((entry) => entry.value !== 'owner' || actor === 'owner');

  return (
    <TableRow>
      <TableCell className='max-w-96 py-2'>
        <span className='flex min-w-0 items-center gap-3'>
          <MemberAvatar member={member} />
          <span className='flex min-w-0 flex-col'>
            <span className='flex items-center gap-1.5'>
              <Truncate className='font-medium text-fg-4'>{member.user.name ?? member.user.email}</Truncate>
              {self && <span className='shrink-0 text-fg-2 text-xs'>You</span>}
            </span>
            {member.user.name && <Truncate className='text-fg-2 text-xs'>{member.user.email}</Truncate>}
          </span>
        </span>
      </TableCell>
      <TableCell>
        <RoleBadge role={member.role} />
      </TableCell>
      <TableCell>
        <Time at={member.createdAt} />
      </TableCell>
      <TableCell className='w-0 py-1.5 text-right'>
        {canManage && !self && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-xs'
                  icon='IconDotGrid1x3Horizontal'
                  aria-label='Member actions'
                  disabled={pending}
                />
              }
            />
            <DropdownMenuContent align='end'>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Change role</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={member.role}
                    onValueChange={(value) => submit('role', { id: member.id, role: String(value) })}
                  >
                    {roles.map((entry) => (
                      <DropdownMenuRadioItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant='destructive' onClick={() => onRemove(member)}>
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}

function InviteRow({
  invite,
  canManage,
  onRevoke,
}: {
  invite: Invite;
  canManage: boolean;
  onRevoke: (invite: Invite) => void;
}) {
  const { submit, pending } = useActionFetcher((data) => {
    if (data.emailSent)
      toast.success('Invite sent again', { description: `${data.email} has a fresh link.` });
    else
      toast.error('Unable to send the email', {
        description: 'The link was refreshed. Revoke and invite again to get a link to share.',
      });
  });
  const expired = new Date(invite.expiresAt).getTime() < Date.now();

  return (
    <TableRow>
      <TableCell className='max-w-96 font-medium text-fg-4'>
        <Truncate>{invite.email}</Truncate>
      </TableCell>
      <TableCell>
        <RoleBadge role={invite.role} />
      </TableCell>
      <TableCell>
        <Time at={invite.createdAt} />
      </TableCell>
      <TableCell>
        {expired ? <span className='text-fg-2'>Expired</span> : <Time at={invite.expiresAt} />}
      </TableCell>
      <TableCell className='w-0 py-1.5 text-right'>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-xs'
                  icon='IconDotGrid1x3Horizontal'
                  aria-label='Invite actions'
                  disabled={pending}
                />
              }
            />
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => submit('resend', { id: invite.id })}>
                Send again
              </DropdownMenuItem>
              <DropdownMenuItem variant='destructive' onClick={() => onRevoke(invite)}>
                Revoke
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function MembersRoute({ loaderData }: Route.ComponentProps) {
  const { workspace, profile } = useOutletContext<WorkspaceOutletContext>();
  const remove = useActionFetcher(() => setRemoveOpen(false));
  const revoke = useActionFetcher(() => setRevokeOpen(false));
  const { members, invites } = loaderData;
  const actor = (workspace.role ?? null) as Role | null;
  const canManage = actor === 'owner' || actor === 'admin';
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [revoking, setRevoking] = useState<Invite | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Members
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Manage who has access to this workspace.
          </p>
        </div>
        {canManage && (
          <Button icon='IconPlusMedium' onClick={() => setInviteOpen(true)}>
            Invite member
          </Button>
        )}
      </header>

      <Card className='shrink-0'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>
                <span className='sr-only'>Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                self={member.user.id === profile.id}
                actor={actor}
                onRemove={(target) => {
                  setRemoving(target);
                  setRemoveOpen(true);
                }}
              />
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className='shrink-0'>
        <CardHeader divider>
          <CardTitle>Invites</CardTitle>
          <CardDescription>People who were invited and have not joined yet.</CardDescription>
        </CardHeader>
        {invites.length === 0 ? (
          <EmptyState
            size='sm'
            icon='IconInviteFilled'
            title='No pending invites'
            description='Invite a teammate and they appear here until they accept.'
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Invited</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>
                  <span className='sr-only'>Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((invite) => (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  canManage={canManage}
                  onRevoke={(target) => {
                    setRevoking(target);
                    setRevokeOpen(true);
                  }}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing?.user.name ?? removing?.user.email}”?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this workspace immediately. You can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={remove.pending}
              onClick={() => removing && remove.submit('remove', { id: removing.id })}
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke the invite for “{revoking?.email}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The link they received stops working immediately. You can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={revoke.pending}
              onClick={() => revoking && revoke.submit('revoke', { id: revoking.id })}
            >
              Revoke invite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
