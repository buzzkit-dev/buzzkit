import { Button } from '@buzzkit/ui/components/button';
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem } from '@buzzkit/ui/components/combobox';
import type { IconName } from '@buzzkit/ui/components/icon';
import { Input } from '@buzzkit/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buzzkit/ui/components/select';
import { cn } from '@buzzkit/ui/lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import {
  ATTRIBUTE_OPERATORS,
  CHANNEL_CHOICES,
  COUNT_COMPARATORS,
  type CountComparator,
  emptyRow,
  KINDS,
  type Match,
  type Row,
  type RowKind,
  rowProblem,
  WINDOWS,
  type Window,
} from './expression';

const ROW_INPUT = 'h-8 px-2.5';

const MATCHES: { value: Match; label: string }[] = [
  { value: 'all', label: 'all' },
  { value: 'any', label: 'any' },
];

const ANY_TIME: { value: Window; label: string }[] = [
  { value: 'any', label: 'ever' },
  ...WINDOWS.map((window) => ({ value: window.value, label: `last ${window.label}` })),
];

const EVER: { value: Window; label: string }[] = [
  { value: 'any', label: 'ever' },
  ...WINDOWS.map((window) => ({ value: window.value, label: `last ${window.label}` })),
];

const DIRECTIONS: { value: 'within' | 'olderThan'; label: string }[] = [
  { value: 'within', label: 'active in the last' },
  { value: 'olderThan', label: 'not active in the last' },
];

function Choice<V extends string>({
  items,
  value,
  onChange,
  className,
  label,
}: {
  items: readonly { value: V; label: string; icon?: IconName }[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
  label: string;
}) {
  return (
    <Select items={items} value={value} onValueChange={(next) => onChange(next as V)}>
      <SelectTrigger className={cn('shrink-0', className)} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} icon={item.icon}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EventPicker({
  value,
  onChange,
  eventNames,
  placeholder,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  eventNames: string[];
  placeholder: string;
  invalid: true | undefined;
}) {
  return (
    <Combobox
      items={eventNames}
      value={eventNames.includes(value) ? value : null}
      inputValue={value}
      onInputValueChange={(next, details) => {
        if (
          details.reason === 'input-change' ||
          details.reason === 'clear-press' ||
          details.reason === 'item-press'
        ) {
          onChange(next);
        }
      }}
      onValueChange={(next) => {
        if (typeof next === 'string') onChange(next);
      }}
    >
      <ComboboxInput
        placeholder={placeholder}
        title={value || undefined}
        aria-label='Event'
        aria-invalid={invalid}
        autoComplete='off'
        spellCheck={false}
        className='h-8 px-2.5'
        containerClassName='min-w-20 flex-1'
        showTrigger={false}
      />
      <ComboboxContent>
        {(name: string) => (
          <ComboboxItem key={name} value={name}>
            {name}
          </ComboboxItem>
        )}
      </ComboboxContent>
    </Combobox>
  );
}

type ChannelChoice = (typeof CHANNEL_CHOICES)[number];

function ConditionFields({
  row,
  onChange,
  eventNames,
  channelChoices,
  showProblems,
}: {
  row: Row;
  onChange: (row: Row) => void;
  eventNames: string[];
  channelChoices: ChannelChoice[];
  showProblems: boolean;
}) {
  const problem = showProblems ? rowProblem(row) : null;
  const invalid = (field: string) => (problem === field ? true : undefined);

  switch (row.kind) {
    case 'attribute':
      return (
        <>
          <Input
            value={row.key}
            onChange={(event) => onChange({ ...row, key: event.target.value })}
            placeholder='plan'
            aria-label='Attribute'
            aria-invalid={invalid('key')}
            autoComplete='off'
            spellCheck={false}
            className={`${ROW_INPUT} min-w-24 flex-1`}
          />
          <Choice
            items={ATTRIBUTE_OPERATORS}
            value={row.operator}
            onChange={(operator) => onChange({ ...row, operator })}
            label='Comparison'
          />
          {row.operator !== 'exists' && row.operator !== 'missing' && (
            <Input
              value={row.value}
              onChange={(event) => onChange({ ...row, value: event.target.value })}
              placeholder={
                row.operator === 'in'
                  ? 'pro, team'
                  : ['gt', 'gte', 'lt', 'lte'].includes(row.operator)
                    ? '10'
                    : 'pro'
              }
              aria-label='Value'
              aria-invalid={invalid('value')}
              autoComplete='off'
              spellCheck={false}
              className={`${ROW_INPUT} min-w-24 flex-1`}
            />
          )}
        </>
      );
    case 'count':
      return (
        <>
          <EventPicker
            value={row.event}
            onChange={(event) => onChange({ ...row, event })}
            eventNames={eventNames}
            placeholder='workout.completed'
            invalid={invalid('event')}
          />
          <Choice
            items={COUNT_COMPARATORS}
            value={row.comparator}
            onChange={(comparator: CountComparator) => onChange({ ...row, comparator })}
            label='Comparison'
          />
          <Input
            value={row.count}
            onChange={(event) => onChange({ ...row, count: event.target.value })}
            inputMode='numeric'
            aria-label='Times'
            aria-invalid={invalid('count')}
            className={`${ROW_INPUT} w-14 shrink-0`}
          />
          <span className='shrink-0 text-fg-2 text-sm'>×</span>
          <Choice
            items={ANY_TIME}
            value={row.within}
            onChange={(within) => onChange({ ...row, within })}
            label='Window'
          />
        </>
      );
    case 'never':
      return (
        <>
          <EventPicker
            value={row.event}
            onChange={(event) => onChange({ ...row, event })}
            eventNames={eventNames}
            placeholder='app.reviewed'
            invalid={invalid('event')}
          />
          <Choice
            items={EVER}
            value={row.within}
            onChange={(within) => onChange({ ...row, within })}
            label='Window'
          />
        </>
      );
    case 'lastSeen':
      return (
        <>
          <Choice
            items={DIRECTIONS}
            value={row.direction}
            onChange={(direction) => onChange({ ...row, direction })}
            label='Activity'
          />
          <Choice
            items={WINDOWS}
            value={row.within}
            onChange={(within) => onChange({ ...row, within })}
            label='Window'
          />
        </>
      );
    case 'channel':
      return (
        <>
          <span className='shrink-0 text-fg-2 text-sm'>can receive</span>
          <Choice
            items={
              channelChoices.some((choice) => choice.value === row.channel)
                ? channelChoices
                : [...channelChoices, ...CHANNEL_CHOICES.filter((choice) => choice.value === row.channel)]
            }
            value={row.channel}
            onChange={(channel) => onChange({ ...row, channel })}
            label='Channel'
          />
        </>
      );
  }
  return null;
}

export function SegmentBuilder({
  match,
  rows,
  eventNames,
  channels,
  showProblems,
  onMatchChange,
  onRowsChange,
}: {
  match: Match;
  rows: Row[];
  eventNames: string[];
  channels: Array<'push' | 'email'>;
  showProblems: boolean;
  onMatchChange: (match: Match) => void;
  onRowsChange: (rows: Row[]) => void;
}) {
  const connected = CHANNEL_CHOICES.filter((choice) => channels.includes(choice.value));
  const channelChoices = connected.length > 0 ? connected : CHANNEL_CHOICES;
  const defaultChannel = channelChoices[0]!.value;
  const replace = (next: Row) => onRowsChange(rows.map((row) => (row.id === next.id ? next : row)));
  const changeKind = (row: Row, kind: RowKind) => replace({ ...emptyRow(kind, defaultChannel), id: row.id });

  return (
    <div className='flex flex-col'>
      <div className='flex items-center gap-2 border-bg-3 border-b px-4 py-2.25 text-fg-4 text-sm'>
        <span>Subscribers matching</span>
        <Choice items={MATCHES} value={match} onChange={onMatchChange} label='Match' />
        <span>of these conditions</span>
      </div>
      <AnimatePresence initial={false}>
        {rows.map((row) => (
          <motion.div
            key={row.id}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', bounce: 0, visualDuration: 0.2 }}
            className='overflow-hidden'
          >
            <div className='flex items-center gap-2 border-bg-3 border-b px-4 py-2.5'>
              <Choice
                items={KINDS}
                value={row.kind}
                onChange={(kind) => changeKind(row, kind)}
                label='Condition'
              />
              <ConditionFields
                key={row.kind}
                row={row}
                onChange={replace}
                eventNames={eventNames}
                channelChoices={channelChoices}
                showProblems={showProblems}
              />
              <Button
                variant='ghost'
                size='icon'
                icon='IconTrashCan'
                aria-label='Remove condition'
                disabled={rows.length === 1}
                className='ml-auto shrink-0 text-fg-2 hover:text-fg-4'
                onClick={() => onRowsChange(rows.filter((entry) => entry.id !== row.id))}
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <div className='px-4 py-3'>
        <Button
          variant='soft'
          size='sm'
          icon='IconPlusMedium'
          onClick={() => onRowsChange([...rows, emptyRow('attribute', defaultChannel)])}
        >
          Add condition
        </Button>
      </div>
    </div>
  );
}
