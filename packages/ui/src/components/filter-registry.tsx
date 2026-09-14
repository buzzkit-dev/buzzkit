'use client';

import { useCardTitle } from '@buzzkit/ui/components/card';
import { createRegistryContext } from '@buzzkit/ui/components/registry';
import * as React from 'react';

export type FilterOption = { value: string; label: string };

export type FilterFacet = {
  kind: 'facet';
  id: string;
  label: string;
  scope: string | null;
  clearable: boolean;
  value: string | null;
  options: FilterOption[];
  onValueChange: (value: string | null) => void;
};

export type FilterSearchField = {
  kind: 'search';
  id: string;
  label: string;
  onValueChange: (value: string) => void;
};

export type FilterAnnouncement = FilterFacet | FilterSearchField;

const { RegistryProvider: FilterRegistryProvider, useRegister: useFilterRegister } =
  createRegistryContext<FilterAnnouncement>('FilterRegistry');

function plainLabel(option: { value: string; label: React.ReactNode }): FilterOption {
  return { value: option.value, label: typeof option.label === 'string' ? option.label : option.value };
}

function useRegisterSearchField(label: string | null, onValueChange: ((value: string) => void) | undefined) {
  const register = useFilterRegister();
  const id = React.useId();
  const latest = React.useRef(onValueChange);
  latest.current = onValueChange;
  const enabled = onValueChange !== undefined;

  React.useEffect(() => {
    if (!register || !enabled || label === null) return;
    return register({ kind: 'search', id, label, onValueChange: (value) => latest.current?.(value) });
  }, [register, enabled, id, label]);
}

function useRegisterFacet(facet: Omit<FilterFacet, 'id' | 'kind' | 'scope'> & { disabled: boolean }) {
  const register = useFilterRegister();
  const scope = useCardTitle();
  const id = React.useId();
  const { label, value, options, onValueChange, disabled, clearable } = facet;
  const serialized = JSON.stringify(options);
  const latest = React.useRef(onValueChange);
  latest.current = onValueChange;

  React.useEffect(() => {
    if (!register || disabled) return;
    return register({
      kind: 'facet',
      id,
      label,
      scope,
      clearable,
      value,
      options: JSON.parse(serialized) as FilterOption[],
      onValueChange: (next) => latest.current(next),
    });
  }, [register, id, label, scope, value, serialized, disabled, clearable]);
}

export { FilterRegistryProvider, plainLabel, useRegisterFacet, useRegisterSearchField };
