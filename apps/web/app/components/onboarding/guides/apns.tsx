import { Icon } from '@buzzkit/ui/components/icon';
import type { GuideDefinition } from '@/app/components/onboarding/guides/types';
import {
  Browser,
  Callout,
  MockBackLink,
  MockButton,
  MockCheckbox,
  MockInfo,
  MockInput,
  MockRow,
  MockSelect,
  Page,
  PageTitle,
  PortalBar,
  Sidebar,
  Spot,
} from '@/app/components/onboarding/illustration';

const PORTAL = 'developer.apple.com/account/resources/authkeys/list';
const KEY_COLUMNS = '1fr 0.7fr 0.8fr 1.4fr';

const SIDEBAR = [
  { label: 'Certificates' },
  { label: 'Identifiers' },
  { label: 'Devices' },
  { label: 'Profiles' },
  { label: 'Keys' },
  { label: 'Services' },
];

function KeysList() {
  return (
    <Browser url={PORTAL}>
      <Sidebar items={SIDEBAR} active='Keys' />
      <Page>
        <PageTitle>
          <span className='flex items-center gap-1.5'>
            Keys
            <Spot className='rounded-full' inset='-inset-1'>
              <span className='flex size-4 items-center justify-center rounded-full bg-sky-4'>
                <Icon name='IconPlusMedium' className='size-3 text-white opacity-100' />
              </span>
            </Spot>
          </span>
        </PageTitle>
        <div className='flex flex-col'>
          <MockRow header columns={KEY_COLUMNS} cells={['Key ID', 'Services', 'Name', 'Environment']} />
          <MockRow
            columns={KEY_COLUMNS}
            cells={[<span key='value'>B7D2K9M4QX</span>, 'APNs', 'BuzzKit', 'Sandbox & Production']}
          />
        </div>
      </Page>
    </Browser>
  );
}

function RegisterKey() {
  return (
    <Browser url='developer.apple.com/account/resources/authkeys/add'>
      <Sidebar items={SIDEBAR} active='Keys' />
      <Page>
        <MockBackLink>All Keys</MockBackLink>
        <PageTitle action={<MockButton variant='secondary'>Continue</MockButton>}>
          Register a New Key
        </PageTitle>
        <MockInput label='Key Name' value='BuzzKit' className='max-w-56' />
        <div className='flex flex-col'>
          <MockRow header cells={['Enable', 'Name', '']} className='grid-cols-[3.5rem_1fr_auto]' />
          <div className='flex h-9 items-center gap-3 border-bg-3 border-b px-1 text-xs'>
            <Spot inset='-inset-x-1.5 -inset-y-1' className='rounded-md'>
              <MockCheckbox label='Apple Push Notifications service (APNs)' checked />
            </Spot>
            <MockButton variant='accent' className='ml-auto'>
              Configure
            </MockButton>
          </div>
          <div className='flex h-9 items-center gap-3 border-bg-3 border-b px-1 text-xs'>
            <MockCheckbox label='DeviceCheck' />
          </div>
          <div className='flex h-9 items-center gap-3 px-1 text-xs'>
            <MockCheckbox label='Sign in with Apple' />
            <MockButton variant='secondary' className='ml-auto'>
              Configure
            </MockButton>
          </div>
        </div>
      </Page>
    </Browser>
  );
}

function ConfigureKey() {
  return (
    <Browser url='developer.apple.com/account/resources/authkeys/add'>
      <Sidebar items={SIDEBAR} active='Keys' />
      <Page>
        <MockBackLink>View Key</MockBackLink>
        <PageTitle
          action={
            <span className='flex gap-1.5'>
              <MockButton variant='secondary'>Back</MockButton>
              <MockButton variant='accent'>Save</MockButton>
            </span>
          }
        >
          Configure Key
        </PageTitle>
        <MockInfo>
          The APNs configuration for accessible environment and key restriction type can’t be changed once
          saved.
        </MockInfo>
        <div className='grid grid-cols-2 gap-4'>
          <Spot inset='-inset-1.5' className='rounded-lg'>
            <MockSelect label='Environment' value='Sandbox & Production' className='w-full' />
          </Spot>
          <MockSelect label='Key Restriction' value='Team Scoped (All Topics)' />
        </div>
      </Page>
    </Browser>
  );
}

function DownloadKey() {
  return (
    <Browser url='developer.apple.com/account/resources/authkeys/download'>
      <Sidebar items={SIDEBAR} active='Keys' />
      <Page>
        <MockBackLink>All Keys</MockBackLink>
        <PageTitle
          action={
            <Spot className='rounded-lg'>
              <MockButton variant='accent'>Download</MockButton>
            </Spot>
          }
        >
          Download Your Key
        </PageTitle>
        <div className='flex flex-col'>
          <MockRow cells={['Name', 'BuzzKit']} />
          <MockRow
            cells={[
              'Key ID',
              <span key='value' className='text-fg-4'>
                Q4K8N2T7VH
              </span>,
            ]}
          />
          <MockRow cells={['Enabled Services', 'Apple Push Notifications service (APNs)']} />
        </div>
        <Callout>
          After downloading your key, it cannot be re-downloaded as the server copy is removed.
        </Callout>
      </Page>
    </Browser>
  );
}

function KeyId() {
  return (
    <Browser url='developer.apple.com/account/resources/authkeys/review'>
      <Sidebar items={SIDEBAR} active='Keys' />
      <Page>
        <MockBackLink>All Keys</MockBackLink>
        <PageTitle
          action={
            <span className='flex gap-1.5'>
              <MockButton variant='secondary'>Revoke</MockButton>
              <MockButton variant='secondary'>Edit</MockButton>
            </span>
          }
        >
          View Key Details
        </PageTitle>
        <div className='flex flex-col'>
          <MockRow cells={['Name', 'BuzzKit']} />
          <MockRow
            highlight
            cells={[
              'Key ID',
              <span key='value' className='text-fg-4'>
                Q4K8N2T7VH
              </span>,
            ]}
          />
          <MockRow cells={['Enabled Services', 'Team scoped (All topics) [Sandbox & Production]']} />
        </div>
      </Page>
    </Browser>
  );
}

function TeamId() {
  return (
    <Browser url={PORTAL}>
      <div className='flex min-w-0 flex-1 flex-col'>
        <PortalBar
          product='Developer'
          highlightAccount
          account={
            <>
              Acme Inc. - <span className='text-fg-4'>7NF3W9P2LK</span>
            </>
          }
        />
        <div className='flex min-h-0 flex-1'>
          <Sidebar items={SIDEBAR} active='Keys' />
          <Page>
            <PageTitle>Keys</PageTitle>
            <div className='flex flex-col'>
              <MockRow header columns={KEY_COLUMNS} cells={['Key ID', 'Services', 'Name', 'Environment']} />
              <MockRow
                columns={KEY_COLUMNS}
                cells={[<span key='value'>Q4K8N2T7VH</span>, 'APNs', 'BuzzKit', 'Sandbox & Production']}
              />
            </div>
          </Page>
        </div>
      </div>
    </Browser>
  );
}

function BundleId() {
  return (
    <Browser url='developer.apple.com/account/resources/identifiers/list'>
      <Sidebar items={SIDEBAR} active='Identifiers' />
      <Page>
        <PageTitle>Identifiers</PageTitle>
        <div className='flex flex-col'>
          <MockRow header cells={['Name', 'Identifier']} />
          <MockRow
            highlight
            cells={[
              'Acme',
              <span key='value' className='text-fg-4'>
                com.acme.app
              </span>,
            ]}
          />
          <MockRow cells={['Acme Widgets', <span key='value'>com.acme.app.widgets</span>]} />
        </div>
      </Page>
    </Browser>
  );
}

export const apnsGuide: GuideDefinition = {
  provider: 'apns',
  title: 'Connect Apple',
  description: 'One APNs key covers every iOS app on your team.',
  docs: {
    label: 'Apple’s guide to token-based APNs keys',
    href: 'https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns',
  },
  connectLabel: 'Connect Apple',
  steps: [
    {
      id: 'open-keys',
      title: 'Open Keys in your Apple Developer account',
      description:
        'Under Certificates, Identifiers & Profiles, choose Keys and press the plus next to the title.',
      link: { label: 'Open Keys', href: `https://${PORTAL}` },
      illustration: KeysList,
    },
    {
      id: 'register',
      title: 'Name the key and enable APNs',
      description:
        'Any name without special characters works. Tick Apple Push Notifications service (APNs) and press Configure.',
      illustration: RegisterKey,
    },
    {
      id: 'configure',
      title: 'Allow both environments',
      description:
        'Set Environment to Sandbox & Production and keep Key Restriction on Team Scoped. Save, then Continue and Register.',
      illustration: ConfigureKey,
    },
    {
      id: 'download',
      title: 'Download the .p8 file',
      description: 'Apple lets you download it exactly once. Drop it here the moment you have it.',
      illustration: DownloadKey,
      fields: [
        {
          kind: 'file',
          name: 'p8',
          label: 'APNs key file',
          accept: '.p8,application/x-pem-file,text/plain',
          prompt: 'Drop your AuthKey_XXXXXXXXXX.p8 here',
          hint: 'The file never leaves this page unencrypted.',
          derive: (file): Record<string, string> => {
            const match = /AuthKey_([A-Z0-9]{10})\.p8$/i.exec(file.name);
            return match ? { keyId: match[1]!.toUpperCase() } : {};
          },
          parse: (text) =>
            text.includes('-----BEGIN PRIVATE KEY-----')
              ? { ok: true, summary: 'PKCS #8 private key' }
              : { ok: false, error: 'That file is not an APNs key. Choose the .p8 file Apple gave you.' },
        },
      ],
    },
    {
      id: 'key-id',
      skipWhenDerived: true,
      title: 'Copy the Key ID',
      description:
        'Shown on the key’s detail page and in the file name after AuthKey_. Ten letters and numbers.',
      illustration: KeyId,
      fields: [
        {
          kind: 'text',
          name: 'keyId',
          label: 'Key ID',
          placeholder: 'Q4K8N2T7VH',
          uppercase: true,
          length: 10,
          pattern: /^[A-Z0-9]{10}$/,
          invalidMessage: 'A Key ID is exactly 10 letters and numbers.',
        },
      ],
    },
    {
      id: 'team-id',
      title: 'Copy your Team ID',
      description: 'The ten characters after your team name in the top right of the portal.',
      illustration: TeamId,
      fields: [
        {
          kind: 'text',
          name: 'teamId',
          label: 'Team ID',
          placeholder: '7NF3W9P2LK',
          uppercase: true,
          length: 10,
          pattern: /^[A-Z0-9]{10}$/,
          invalidMessage: 'A Team ID is exactly 10 letters and numbers.',
        },
      ],
    },
    {
      id: 'bundle-id',
      title: 'Enter your app’s bundle ID',
      description: 'From Identifiers, or the General tab of your target in Xcode.',
      illustration: BundleId,
      fields: [
        {
          kind: 'text',
          name: 'bundleId',
          label: 'Bundle ID',
          placeholder: 'com.acme.app',
          pattern: /^[A-Za-z0-9.-]+$/,
          invalidMessage: 'Bundle IDs use letters, numbers, dots and hyphens.',
        },
      ],
    },
  ],
};
