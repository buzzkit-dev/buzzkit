import { Icon } from '@buzzkit/ui/components/icon';
import type { GuideDefinition } from '@/app/components/onboarding/guides/types';
import {
  Browser,
  MockButton,
  MockDialog,
  MockTabs,
  Page,
  PageTitle,
  Sidebar,
  Spot,
} from '@/app/components/onboarding/illustration';

const CONSOLE = 'console.firebase.google.com';

const SIDEBAR = [
  { label: 'Project Overview' },
  { label: 'Authentication' },
  { label: 'Firestore Database' },
  { label: 'Messaging' },
  { label: 'Hosting' },
];

const TABS = ['General', 'Cloud Messaging', 'Integrations', 'Service accounts', 'Data privacy'];

function ProjectSettings() {
  return (
    <Browser url={`${CONSOLE}/project/acme-app/overview`}>
      <div className='flex w-40 shrink-0 flex-col border-bg-3 border-r bg-background-subtle py-3'>
        <span className='flex items-center justify-between px-2.5 pb-2'>
          <span className='truncate font-medium text-fg-4 text-xs'>acme-app</span>
          <Spot className='rounded-full' inset='-inset-1.5'>
            <Icon name='IconSettingsGear1' className='size-4 text-fg-3 opacity-100' />
          </Spot>
        </span>
        <Sidebar items={SIDEBAR} active='Project Overview' className='w-full border-0 bg-transparent py-0' />
      </div>
      <Page>
        <PageTitle>Project Overview</PageTitle>
        <div className='grid grid-cols-3 gap-3'>
          <span className='h-16 rounded-xl bg-bg-2' />
          <span className='h-16 rounded-xl bg-bg-2' />
          <span className='h-16 rounded-xl bg-bg-2' />
        </div>
      </Page>
    </Browser>
  );
}

function ServiceAccounts() {
  return (
    <Browser url={`${CONSOLE}/project/acme-app/settings/serviceaccounts`}>
      <Sidebar items={SIDEBAR} className='bg-background-subtle' />
      <Page>
        <PageTitle>Project settings</PageTitle>
        <MockTabs items={TABS} active='Service accounts' highlight='Service accounts' />
        <span className='font-medium text-fg-4 text-xs'>Firebase Admin SDK</span>
        <span className='h-10 rounded-xl bg-bg-2' />
      </Page>
    </Browser>
  );
}

function GenerateKey() {
  return (
    <Browser url={`${CONSOLE}/project/acme-app/settings/serviceaccounts`}>
      <Sidebar items={SIDEBAR} className='bg-background-subtle' />
      <Page>
        <PageTitle>Project settings</PageTitle>
        <MockTabs items={TABS} active='Service accounts' />
        <div className='flex flex-col gap-2'>
          <span className='font-medium text-fg-4 text-xs'>Firebase Admin SDK</span>
          <span className='text-fg-2 text-xs'>firebase-adminsdk@acme-app.iam.gserviceaccount.com</span>
          <span className='mt-1'>
            <Spot className='rounded-lg'>
              <MockButton variant='accent'>Generate new private key</MockButton>
            </Spot>
          </span>
        </div>
      </Page>
    </Browser>
  );
}

function ConfirmKey() {
  return (
    <Browser url={`${CONSOLE}/project/acme-app/settings/serviceaccounts`}>
      <div className='relative flex flex-1'>
        <Sidebar items={SIDEBAR} className='bg-background-subtle' />
        <Page className='opacity-40'>
          <PageTitle>Project settings</PageTitle>
          <MockTabs items={TABS} active='Service accounts' />
        </Page>
        <div className='absolute inset-0 flex items-center justify-center bg-fg-4/10 p-6'>
          <MockDialog title='Generate new private key?'>
            <span className='text-pretty text-fg-2 text-xs'>
              This key grants access to your project’s Firebase services. Keep it confidential and never store
              it in a public repository.
            </span>
            <span className='flex justify-end gap-2 pt-1'>
              <MockButton variant='secondary'>Cancel</MockButton>
              <Spot className='rounded-lg'>
                <MockButton variant='accent'>Generate key</MockButton>
              </Spot>
            </span>
          </MockDialog>
        </div>
      </div>
    </Browser>
  );
}

export const fcmGuide: GuideDefinition = {
  provider: 'fcm',
  title: 'Connect Firebase Cloud Messaging',
  description: 'A Firebase service account lets BuzzKit send through FCM.',
  docs: {
    label: 'Firebase’s guide to the Admin SDK credentials',
    href: 'https://firebase.google.com/docs/cloud-messaging/auth-server',
  },
  connectLabel: 'Connect Firebase',
  steps: [
    {
      id: 'open-settings',
      title: 'Open your Firebase project settings',
      description:
        'In the Firebase console, press the gear next to Project Overview and choose Project settings.',
      link: { label: 'Open the Firebase console', href: `https://${CONSOLE}` },
      illustration: ProjectSettings,
    },
    {
      id: 'service-accounts',
      title: 'Go to Service accounts',
      description: 'The tab at the end of the settings header. It shows the Firebase Admin SDK account.',
      illustration: ServiceAccounts,
    },
    {
      id: 'generate',
      title: 'Generate a new private key',
      description: 'Press Generate new private key and confirm.',
      illustration: GenerateKey,
    },
    {
      id: 'upload',
      title: 'Upload the JSON file',
      description: 'Firebase downloads a JSON file with the project id, client email and private key.',
      illustration: ConfirmKey,
      fields: [
        {
          kind: 'file',
          name: 'serviceAccount',
          label: 'Service account JSON',
          accept: '.json,application/json',
          prompt: 'Drop the service account JSON here',
          hint: 'Named like acme-app-firebase-adminsdk-xxxxx.json.',
          parse: (text) => {
            try {
              const parsed = JSON.parse(text) as Record<string, unknown>;
              const projectId = typeof parsed.project_id === 'string' ? parsed.project_id : null;
              const clientEmail = typeof parsed.client_email === 'string' ? parsed.client_email : null;
              const privateKey = typeof parsed.private_key === 'string' ? parsed.private_key : null;
              if (!projectId || !clientEmail || !privateKey) {
                return {
                  ok: false,
                  error:
                    'That JSON is missing project_id, client_email or private_key. Choose the Firebase Admin SDK key.',
                };
              }
              return { ok: true, summary: `${projectId} · ${clientEmail}` };
            } catch {
              return {
                ok: false,
                error: 'That file is not valid JSON. Choose the file Firebase downloaded.',
              };
            }
          },
        },
      ],
    },
  ],
};
