import { Badge } from '@buzzkit/ui/components/badge';
import { Card } from '@buzzkit/ui/components/card';
import { PastelAvatar } from '@buzzkit/ui/components/pastel-avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';

const TENANTS = [
  { slug: 'gymly', name: 'Gymly', subscribers: 13_460, platforms: ['iOS', 'Android'] },
  { slug: 'nook', name: 'Nook', subscribers: 8212, platforms: ['iOS'] },
  { slug: 'harbor', name: 'Harbor', subscribers: 2904, platforms: ['iOS', 'Android'] },
  { slug: 'trail', name: 'Trail', subscribers: 1187, platforms: ['Android'] },
];

export function TenantsVignette() {
  return (
    <Card>
      <div className='flex items-center gap-2 border-bg-3 border-b px-4 py-3'>
        <PastelAvatar seed='orbit' size={22} className='rounded-md corner-superellipse/1.125' />
        <span className='font-medium text-fg-4 text-sm'>Orbit</span>
        <span className='text-fg-2 text-xs'>1 workspace key</span>
        <Badge size='sm' className='ml-auto'>
          4 tenants
        </Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tenant</TableHead>
            <TableHead>Subscribers</TableHead>
            <TableHead>Channels</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {TENANTS.map((tenant) => (
            <TableRow key={tenant.slug}>
              <TableCell>
                <span className='flex flex-col'>
                  <span className='font-medium text-fg-4'>{tenant.name}</span>
                  <span className='text-fg-2 text-xs'>buzzkit-tenant: {tenant.slug}</span>
                </span>
              </TableCell>
              <TableCell className='tabular-nums'>{tenant.subscribers.toLocaleString('en-US')}</TableCell>
              <TableCell>
                <span className='flex items-center gap-1'>
                  {tenant.platforms.map((platform) => (
                    <Badge key={platform} size='sm' variant={platform === 'iOS' ? 'blue' : 'purple'}>
                      {platform}
                    </Badge>
                  ))}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
