import { Card } from '@buzzkit/ui/components/card';
import { Field, FieldLabel } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buzzkit/ui/components/select';
import { cn } from '@buzzkit/ui/lib/utils';
import { useState } from 'react';
import { CADENCES, type Cadence, estimate, readNumber } from '../../lib/estimate';
import { DeliveryHint } from './DeliveryHint';

const money = { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } as const;
const count = { maximumFractionDigits: 0 } as const;

function Adorned({
  prefix,
  suffix,
  children,
}: {
  prefix?: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <div className='relative flex items-center'>
      {prefix && (
        <span className='pointer-events-none absolute left-3.5 z-10 text-fg-2 text-sm'>{prefix}</span>
      )}
      {children}
      {suffix && (
        <span className='pointer-events-none absolute right-3.5 z-10 text-fg-2 text-sm'>{suffix}</span>
      )}
    </div>
  );
}

function Result({
  label,
  hint,
  children,
  note,
  tone = 'strong',
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  note: React.ReactNode;
  tone?: 'strong' | 'quiet';
}) {
  return (
    <div className='flex flex-col gap-0.5'>
      <span className='flex items-center gap-1.5 text-fg-2 text-sm'>
        {label}
        {hint}
      </span>
      <span
        className={cn('font-medium text-2xl tracking-tight', tone === 'strong' ? 'text-fg-4' : 'text-fg-2')}
      >
        {children}
      </span>
      <span className='text-fg-2 text-xs'>{note}</span>
    </div>
  );
}

export function Calculator({
  delivery,
}: {
  delivery: { text: string; rows: { action: string; count: string }[] };
}) {
  const [users, setUsers] = useState('50000');
  const [perUser, setPerUser] = useState('3');
  const [cadence, setCadence] = useState<Cadence>('week');
  const [mauRate, setMauRate] = useState('12');

  const activeUsers = readNumber(users);
  const perMonth = CADENCES.find((entry) => entry.value === cadence)?.perMonth ?? 1;
  const deliveries = Math.round(activeUsers * readNumber(perUser) * perMonth);
  const result = estimate(deliveries);
  const cost = result ? result.base + result.extra : Number.NaN;
  const perMau = (activeUsers / 1000) * readNumber(mauRate);
  const saving = perMau - cost;

  return (
    <Card className='p-5'>
      <div className='grid gap-4 sm:grid-cols-3'>
        <Field>
          <FieldLabel htmlFor='calc-users'>Monthly active users</FieldLabel>
          <Adorned suffix='users'>
            <Input
              id='calc-users'
              inputMode='numeric'
              value={users}
              onChange={(event) => setUsers(event.target.value)}
              className='pr-16'
            />
          </Adorned>
        </Field>
        <Field>
          <FieldLabel htmlFor='calc-per-user'>Notifications per user</FieldLabel>
          <div className='flex'>
            <Input
              id='calc-per-user'
              inputMode='decimal'
              value={perUser}
              onChange={(event) => setPerUser(event.target.value)}
              className='rounded-r-none'
            />
            <Select items={CADENCES} value={cadence} onValueChange={(next) => setCadence(next as Cadence)}>
              <SelectTrigger
                className='h-8.5 shrink-0 rounded-l-none enabled:hover:before:bg-bg-2 enabled:active:before:bg-bg-2 aria-expanded:before:bg-bg-2 enabled:active:before:inset-0'
                aria-label='How often'
              >
                <SelectValue className='transition-opacity duration-200 ease-out group-active/select-trigger:opacity-60' />
              </SelectTrigger>
              <SelectContent>
                {CADENCES.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor='calc-mau'>Per-MAU price you pay today</FieldLabel>
          <Adorned prefix='$' suffix='per 1,000 a month'>
            <Input
              id='calc-mau'
              inputMode='decimal'
              value={mauRate}
              onChange={(event) => setMauRate(event.target.value)}
              className='pr-32 pl-7'
            />
          </Adorned>
        </Field>
      </div>
      <div className='mt-5 grid gap-4 border-bg-3 border-t pt-5 sm:grid-cols-3'>
        <Result
          label='Deliveries a month'
          hint={<DeliveryHint text={delivery.text} rows={delivery.rows} />}
          note={
            <>
              <NumberFlow value={activeUsers} format={count} /> users ×{' '}
              <NumberFlow value={readNumber(perUser)} />{' '}
              {CADENCES.find((entry) => entry.value === cadence)?.label}
            </>
          }
        >
          <NumberFlow value={deliveries} format={count} />
        </Result>
        <Result
          label='On BuzzKit'
          note={
            result === null ? (
              'Custom volume, talk to us'
            ) : result.extra > 0 ? (
              <>
                {result.plan} · <NumberFlow value={result.base} format={money} /> plus{' '}
                <NumberFlow value={result.extra} format={money} /> for{' '}
                <NumberFlow value={result.extraDeliveries} format={count} /> extra deliveries
              </>
            ) : (
              `${result.plan} a month, everything included`
            )
          }
        >
          {result === null ? 'Enterprise' : <NumberFlow value={cost} format={money} />}
        </Result>
        <Result
          label='Priced per active user'
          tone='quiet'
          note={
            result === null || saving <= 0 ? (
              <>
                at <NumberFlow value={readNumber(mauRate)} format={money} /> per 1,000 users
              </>
            ) : (
              <span className='text-red-text'>
                <NumberFlow value={saving} format={money} /> a month more than BuzzKit
              </span>
            )
          }
        >
          <NumberFlow value={perMau} format={money} />
        </Result>
      </div>
    </Card>
  );
}
