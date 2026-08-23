import { Icon } from '@buzzkit/ui/components/icon';
import type { GuideDefinition } from '@/app/components/onboarding/guides/types';
import {
  Browser,
  MockButton,
  MockDialog,
  MockInput,
  MockRow,
  Page,
  PageTitle,
  Sidebar,
  Spot,
} from '@/app/components/onboarding/illustration';

const SIDEBAR = [
  { label: 'Emails' },
  { label: 'Broadcasts' },
  { label: 'Automations' },
  { label: 'Templates' },
  { label: 'Audience' },
  { label: 'Metrics' },
  { label: 'Domains' },
  { label: 'Logs' },
  { label: 'API keys' },
  { label: 'Webhooks' },
  { label: 'Settings' },
];

const KEY_COLUMNS = '1fr 1fr 1.1fr 0.9fr 0.7fr';

function KeysTable() {
  return (
    <div className='flex flex-col'>
      <MockRow header columns={KEY_COLUMNS} cells={['Name', 'Token', 'Permission', 'Last used', 'Created']} />
      <MockRow
        columns={KEY_COLUMNS}
        cells={['BuzzKit', 're_Vk4Tq...', 'Sending Access', 'Just now', '2m ago']}
      />
    </div>
  );
}

function ApiKeys() {
  return (
    <Browser url='resend.com/api-keys'>
      <Sidebar items={SIDEBAR} active='API keys' />
      <Page>
        <PageTitle
          action={
            <Spot className='rounded-lg'>
              <MockButton>Create API key</MockButton>
            </Spot>
          }
        >
          API keys
        </PageTitle>
        <KeysTable />
      </Page>
    </Browser>
  );
}

function DialogBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative flex flex-1'>
      <Sidebar items={SIDEBAR} active='API keys' />
      <Page className='opacity-40'>
        <PageTitle action={<MockButton>Create API key</MockButton>}>API keys</PageTitle>
        <KeysTable />
      </Page>
      <div className='absolute inset-0 flex items-center justify-center bg-fg-4/10 p-6'>{children}</div>
    </div>
  );
}

function PermissionOption({ label, selected }: { label: string; selected?: boolean }) {
  return (
    <span className='flex h-7 items-center justify-between rounded-md px-2 text-fg-4 text-xs'>
      {label}
      {selected && <Icon name='IconCheckmark1' className='size-3.5 opacity-100' />}
    </span>
  );
}

function CreateKey() {
  return (
    <Browser url='resend.com/api-keys'>
      <DialogBackdrop>
        <MockDialog title='Add API Key'>
          <MockInput label='Name' value='BuzzKit' />
          <span className='relative flex flex-col gap-1'>
            <span className='font-medium text-fg-3 text-xs'>Permission</span>
            <span className='flex h-7.5 w-full items-center justify-between gap-2 rounded-lg border border-bg-4 bg-bg-1 px-2.5 text-fg-4 text-xs'>
              Sending Access
              <Icon name='IconChevronDownMedium' className='size-3.5 shrink-0 text-fg-2' />
            </span>
            <span className='absolute top-full left-0 z-10 mt-1 flex w-full flex-col gap-0.5 rounded-lg bg-bg-1 p-1 shadow-3'>
              <PermissionOption label='Full Access' />
              <Spot className='rounded-md' inset='-inset-0.5'>
                <span className='flex w-full'>
                  <span className='flex w-full flex-col'>
                    <PermissionOption label='Sending Access' selected />
                  </span>
                </span>
              </Spot>
            </span>
          </span>
          <MockInput label='Domain' value='All domains' />
          <span className='flex justify-end gap-2 pt-1'>
            <MockButton variant='secondary'>Cancel</MockButton>
            <MockButton>Add</MockButton>
          </span>
        </MockDialog>
      </DialogBackdrop>
    </Browser>
  );
}

function CopyKey() {
  return (
    <Browser url='resend.com/api-keys'>
      <DialogBackdrop>
        <MockDialog title='View API Key'>
          <span className='-mt-2 text-pretty text-fg-2 text-xs'>
            You can only see this key once. Store it safely.
          </span>
          <span className='flex flex-col gap-1'>
            <span className='font-medium text-fg-3 text-xs'>API Key</span>
            <Spot className='rounded-lg' inset='-inset-1'>
              <span className='flex h-7.5 w-full items-center truncate rounded-lg border border-bg-4 bg-bg-1 px-2.5 text-fg-4 text-xs'>
                re_Vk4TqYn9_8RmLw2cH5jXb7PdQ3sZf6Ng
              </span>
            </Spot>
          </span>
          <span className='flex justify-end pt-1'>
            <MockButton>Done</MockButton>
          </span>
        </MockDialog>
      </DialogBackdrop>
    </Browser>
  );
}

export const resendGuide: GuideDefinition = {
  provider: 'resend',
  title: 'Connect Resend',
  description: 'An API key with sending access is all it takes.',
  docs: { label: 'Resend’s API key docs', href: 'https://resend.com/docs/dashboard/api-keys/introduction' },
  connectLabel: 'Connect Resend',
  steps: [
    {
      id: 'open-keys',
      title: 'Open API keys in Resend',
      description: 'From the sidebar, open API keys and press Create API key.',
      link: { label: 'Open API keys', href: 'https://resend.com/api-keys' },
      illustration: ApiKeys,
    },
    {
      id: 'create',
      title: 'Name it and pick Sending Access',
      description: 'BuzzKit only sends. Full Access would let this key manage your Resend account.',
      note: 'Leave the domain on All domains unless you want this key limited to one.',
      illustration: CreateKey,
    },
    {
      id: 'copy',
      title: 'Copy the key',
      description: 'Resend shows it once. Paste it here.',
      note: 'Sending to other people needs a verified domain in Resend. Until then, Resend only delivers to your own address.',
      illustration: CopyKey,
      fields: [
        {
          kind: 'text',
          name: 'apiKey',
          label: 'API key',
          placeholder: 're_…',
          secret: true,
          pattern: /^re_[A-Za-z0-9_]{8,}$/,
          invalidMessage: 'Resend keys start with re_.',
        },
      ],
    },
  ],
};
