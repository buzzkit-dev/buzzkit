import { Badge } from '@buzzkit/ui/components/badge';
import { Card } from '@buzzkit/ui/components/card';
import { Icon } from '@buzzkit/ui/components/icon';
import { LivePing } from '@buzzkit/ui/components/live-ping';
import { Table, TableBody, TableCell, TableRow } from '@buzzkit/ui/components/table';
import { ProviderLogo } from '@buzzkit/web/components/sources/logo';

const INBOUND = [
  { provider: 'stripe', event: 'customer.subscription.created', becomes: 'subscription.started' },
  { provider: 'revenuecat', event: 'INITIAL_PURCHASE', becomes: 'subscription.started' },
  { provider: 'superwall', event: 'cancellation', becomes: 'subscription.canceled' },
  { provider: 'stripe', event: 'invoice.payment_failed', becomes: 'payment.failed' },
  { provider: 'custom', event: 'order.shipped', becomes: 'order.shipped' },
  { provider: 'revenuecat', event: 'RENEWAL', becomes: 'subscription.renewed' },
  { provider: 'superwall', event: 'billing_issue', becomes: 'payment.failed' },
];

export function SourcesVignette() {
  return (
    <Card>
      <div className='flex items-center gap-2 border-bg-3 border-b px-4 py-3'>
        <span className='font-medium text-fg-4 text-sm'>Sources</span>
        <span className='ml-auto flex items-center gap-1.5 text-fg-2 text-xs'>
          <LivePing />
          Receiving
        </span>
      </div>
      <Table>
        <TableBody>
          {INBOUND.map((source) => (
            <TableRow key={`${source.provider}:${source.event}`}>
              <TableCell>
                <span className='flex items-center gap-2'>
                  <ProviderLogo provider={source.provider} />
                  <Badge size='sm'>{source.event}</Badge>
                </span>
              </TableCell>
              <TableCell className='w-8 px-0 text-center'>
                <Icon name='IconArrowRight' className='inline size-3.5 text-fg-1' />
              </TableCell>
              <TableCell>
                <Badge size='sm' variant='green'>
                  {source.becomes}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
