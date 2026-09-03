import { Badge } from '@buzzkit/ui/components/badge';
import { Card } from '@buzzkit/ui/components/card';
import { Icon } from '@buzzkit/ui/components/icon';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { PastelAvatar } from '@buzzkit/ui/components/pastel-avatar';
import { Snippet } from '../ui/Snippet';

interface Copy {
  lead: string;
  text: string;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative h-60 overflow-hidden rounded-xl bg-background-subtle ring-1 ring-bg-3/60 corner-superellipse/1.125'>
      {children}
    </div>
  );
}

const TENANTS = [
  { slug: 'gymly', name: 'Gymly', current: true },
  { slug: 'nook', name: 'Nook' },
  { slug: 'harbor', name: 'Harbor' },
  { slug: 'trail', name: 'Trail' },
  { slug: 'ledger', name: 'Ledger' },
];

export function ValueCards({
  codeFirst,
  multiTenant,
  ownKeys,
  sendHtml,
}: {
  codeFirst: Copy;
  multiTenant: Copy;
  ownKeys: Copy;
  sendHtml: string;
}) {
  return (
    <div className='grid gap-4 md:grid-cols-3'>
      <div className='flex flex-col rounded-[1.75rem] bg-bg-1 p-4 shadow-2 corner-superellipse/1.125'>
        <Frame>
          <div className='absolute top-1/2 left-6 w-[150%] -translate-y-1/2'>
            <Snippet html={sendHtml} />
          </div>
        </Frame>
        <p className='min-h-[3lh] px-1 pt-4 text-fg-2 text-sm leading-normal text-pretty'>
          <span className='font-medium text-fg-4'>{codeFirst.lead}</span> {codeFirst.text}
        </p>
      </div>
      <div className='flex flex-col rounded-[1.75rem] bg-bg-1 p-4 shadow-2 corner-superellipse/1.125'>
        <Frame>
          <div className='absolute top-6 left-6 w-64'>
            <Card className='p-1 shadow-3'>
              <span className='px-2.5 pt-1.5 pb-1 font-medium text-fg-2 text-xs'>Workspaces</span>
              <span className='flex h-8 items-center gap-2 rounded-lg py-1 pr-2 pl-1.25 text-fg-4 text-sm'>
                <PastelAvatar seed='orbit' size={22} className='rounded-md corner-superellipse/1.125' />
                Orbit
                <Icon name='IconCheckmark1' className='ml-auto size-4 rotate-[4deg]' />
              </span>
              <span className='mx-2 my-1 border-bg-3 border-t' />
              <span className='px-2.5 pt-1.5 pb-1 font-medium text-fg-2 text-xs'>Tenants</span>
              {TENANTS.map((tenant) => (
                <span
                  key={tenant.slug}
                  className='flex h-8 items-center gap-2 rounded-lg py-1 pr-2 pl-2 text-fg-4 text-sm'
                >
                  <Icon name='IconBuildingsFilled' className='size-4' />
                  {tenant.name}
                  {tenant.current && <Icon name='IconCheckmark1' className='ml-auto size-4 rotate-[4deg]' />}
                </span>
              ))}
            </Card>
          </div>
        </Frame>
        <p className='min-h-[3lh] px-1 pt-4 text-fg-2 text-sm leading-normal text-pretty'>
          <span className='font-medium text-fg-4'>{multiTenant.lead}</span> {multiTenant.text}
        </p>
      </div>
      <div className='flex flex-col rounded-[1.75rem] bg-bg-1 p-4 shadow-2 corner-superellipse/1.125'>
        <Frame>
          <div className='absolute top-1/2 left-6 w-[130%] -translate-y-1/2'>
            <Card>
              <div className='flex items-center gap-3 border-bg-3 border-b px-4 py-3'>
                <IconTile icon='IconAppleFilled' size='sm' className='text-fg-2' />
                <span className='flex min-w-0 flex-col'>
                  <span className='font-medium text-fg-4 text-sm'>Apple Push Notification service</span>
                  <span className='text-fg-2 text-xs'>AuthKey_84F2QX.p8 · Team 6K2P…</span>
                </span>
                <Badge size='sm' variant='green' className='ml-auto'>
                  Active
                </Badge>
              </div>
              <div className='flex items-center gap-3 border-bg-3 border-b px-4 py-3'>
                <IconTile icon='IconGooglePlayStoreFilled' size='sm' className='text-fg-2' />
                <span className='flex min-w-0 flex-col'>
                  <span className='font-medium text-fg-4 text-sm'>Firebase Cloud Messaging</span>
                  <span className='text-fg-2 text-xs'>gymly-prod · service account</span>
                </span>
                <Badge size='sm' variant='green' className='ml-auto'>
                  Active
                </Badge>
              </div>
              <div className='flex items-center gap-3 px-4 py-3'>
                <IconTile icon='IconFingerPrint1Filled' size='sm' className='text-fg-2' />
                <span className='flex min-w-0 flex-col'>
                  <span className='font-medium text-fg-4 text-sm'>Identity secret</span>
                  <span className='text-fg-2 text-xs'>Rotated 3 days ago</span>
                </span>
              </div>
            </Card>
          </div>
        </Frame>
        <p className='min-h-[3lh] px-1 pt-4 text-fg-2 text-sm leading-normal text-pretty'>
          <span className='font-medium text-fg-4'>{ownKeys.lead}</span> {ownKeys.text}
        </p>
      </div>
    </div>
  );
}
