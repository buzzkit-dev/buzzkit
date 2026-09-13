'use client';

import { createRegistryContext } from '@buzzkit/ui/components/registry';
import * as React from 'react';

export type RegisteredAction = {
  id: string;
  label: string;
  icon?: string;
  activate: () => void;
};

const { RegistryProvider: ActionRegistryProvider, useRegister } =
  createRegistryContext<RegisteredAction>('ActionRegistry');

function textOf(node: React.ReactNode): string | null {
  if (typeof node === 'string') return node.trim() || null;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    const parts = node.map(textOf).filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(' ') : null;
  }
  return null;
}

function useRegisterAction({
  children,
  icon,
  disabled,
  activate,
}: {
  children: React.ReactNode;
  icon?: string;
  disabled: boolean;
  activate: () => void;
}) {
  const register = useRegister();
  const id = React.useId();
  const label = textOf(children);
  const latest = React.useRef(activate);
  latest.current = activate;

  React.useEffect(() => {
    if (!register || label === null || disabled) return;
    return register({ id, label, icon, activate: () => latest.current() });
  }, [register, id, label, icon, disabled]);
}

export { ActionRegistryProvider, useRegisterAction };
