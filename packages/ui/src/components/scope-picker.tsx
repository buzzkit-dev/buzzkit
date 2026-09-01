'use client';

import { Checkbox } from '@buzzkit/ui/components/checkbox';
import { Icon } from '@buzzkit/ui/components/icon';
import { Input } from '@buzzkit/ui/components/input';
import { Label } from '@buzzkit/ui/components/label';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { cn } from '@buzzkit/ui/lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import { useId, useRef, useState } from 'react';

export type ScopeGroup = { label: string; wildcard?: string; options: string[] };

const unfold = { type: 'spring', duration: 0.3, bounce: 0 } as const;
const fold = { type: 'spring', duration: 0.2, bounce: 0 } as const;

/**
 * Grouped multi-select for permission-like strings (`resource:action`).
 * Each group is a collapsible row with a tri-state checkbox: checking the
 * group selects its wildcard (or every option when it has none); checking
 * every option collapses back into the wildcard. Search expands every
 * matching group.
 */
function ScopePicker({
  groups,
  selected,
  onChange,
  searchPlaceholder = 'Search permissions',
  className,
}: {
  groups: ScopeGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchPlaceholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  const trimmedQuery = query.trim().toLowerCase();
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      matches: trimmedQuery ? group.options.filter((option) => option.includes(trimmedQuery)) : group.options,
    }))
    .filter((group) => group.matches.length > 0 || group.label.includes(trimmedQuery));

  const toggleExpanded = (label: string) =>
    setExpanded((current) =>
      current.includes(label) ? current.filter((entry) => entry !== label) : [...current, label]
    );

  const stateOf = (group: ScopeGroup) => {
    const wildcardOn = group.wildcard !== undefined && selected.includes(group.wildcard);
    const count = group.options.filter((option) => selected.includes(option)).length;
    return { wildcardOn, allOn: wildcardOn || count === group.options.length, count };
  };
  const without = (group: ScopeGroup) =>
    selected.filter((entry) => entry !== group.wildcard && !group.options.includes(entry));
  const toggleGroup = (group: ScopeGroup) => {
    const { allOn } = stateOf(group);
    if (allOn) onChange(without(group));
    else onChange([...without(group), ...(group.wildcard ? [group.wildcard] : group.options)]);
  };
  const toggleOption = (group: ScopeGroup, option: string) => {
    const { wildcardOn } = stateOf(group);
    const current = wildcardOn ? group.options : group.options.filter((entry) => selected.includes(entry));
    const next = current.includes(option)
      ? current.filter((entry) => entry !== option)
      : [...current, option];
    onChange(
      group.wildcard && next.length === group.options.length
        ? [...without(group), group.wildcard]
        : [...without(group), ...next]
    );
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        className='h-8 text-sm'
      />
      <ScrollFade targetRef={listRef} />
      <div ref={listRef} className='scrollbar-hide max-h-52 overflow-y-auto'>
        <div className='flex flex-col gap-0.5'>
          {visibleGroups.map((group) => {
            const { wildcardOn, allOn, count } = stateOf(group);
            const open = trimmedQuery !== '' || expanded.includes(group.label);
            const groupId = `${uid}-${group.label}`;
            return (
              <div key={group.label} className='flex flex-col'>
                <div
                  className={cn(
                    'relative isolate flex h-8 items-center gap-2 rounded-lg px-1.5',
                    "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:content-['']",
                    'before:transition-[background-color,inset] before:duration-150 before:ease-out active:before:inset-x-(--press-inset-x) active:before:inset-y-(--press-inset-y)',
                    'hover:before:bg-bg-a1 active:before:bg-bg-a1'
                  )}
                >
                  <button
                    type='button'
                    onClick={() => toggleExpanded(group.label)}
                    aria-expanded={open}
                    aria-label={`${open ? 'Collapse' : 'Expand'} ${group.label}`}
                    className='absolute inset-0 cursor-pointer rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-primary-2'
                  />
                  <Checkbox
                    id={groupId}
                    checked={allOn}
                    onCheckedChange={() => toggleGroup(group)}
                    className='relative'
                  />
                  <Label htmlFor={groupId} className='relative font-medium text-fg-4 text-xs'>
                    {group.wildcard ?? group.label}
                  </Label>
                  <span className='text-fg-2 text-xs'>{allOn ? 'all' : count > 0 ? count : ''}</span>
                  <Icon
                    name='IconChevronRightMedium'
                    className={cn(
                      'mr-0.5 ml-auto size-3.5 transition-transform duration-150',
                      open && 'rotate-90'
                    )}
                  />
                </div>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      key='options'
                      className='overflow-hidden'
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0, transition: fold }}
                      transition={unfold}
                    >
                      <div className='flex flex-col gap-0.5 pt-0.5 pb-1 pl-8'>
                        {group.matches.map((option) => (
                          <Label
                            key={option}
                            htmlFor={`${uid}-${option}`}
                            className='flex h-6 cursor-pointer items-center gap-2 font-normal text-fg-3 text-xs'
                          >
                            <Checkbox
                              id={`${uid}-${option}`}
                              checked={wildcardOn || selected.includes(option)}
                              onCheckedChange={() => toggleOption(group, option)}
                            />
                            {option}
                          </Label>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {visibleGroups.length === 0 && (
            <span className='flex items-center justify-center py-4 text-fg-2 text-sm'>
              Nothing matches your search.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export { ScopePicker };
