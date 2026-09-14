import type { RegisteredAction } from '@buzzkit/ui/components/action-registry';
import type {
  FilterAnnouncement,
  FilterFacet,
  FilterSearchField,
} from '@buzzkit/ui/components/filter-registry';
import type { IconName } from '@buzzkit/ui/components/icon';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
import { isEditableTarget, resolveChord } from '@/app/lib/command';

const CHORD_WINDOW_MS = 1000;

type CommandBase = {
  id: string;
  label: string;
  hint?: string;
  icon?: IconName;
  keywords?: string[];
  shortcut?: string[];
};

export type Command = CommandBase & ({ to: string; external?: boolean } | { run: () => void });

type Registry<T> = {
  register: (key: string, entries: T[]) => () => void;
  useEntries: () => T[];
};

function createRegistry<T>(): Registry<T> {
  const owners = new Map<string, T[]>();
  const listeners = new Set<() => void>();
  const empty: T[] = [];
  let snapshot = empty;

  const publish = () => {
    snapshot = [...owners.values()].flat();
    for (const listener of listeners) listener();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    register: (key, entries) => {
      owners.set(key, entries);
      publish();
      return () => {
        owners.delete(key);
        publish();
      };
    },
    useEntries: () =>
      useSyncExternalStore(
        subscribe,
        () => snapshot,
        () => empty
      ),
  };
}

const commands = createRegistry<Command>();
const actions = createRegistry<RegisteredAction>();
const facets = createRegistry<FilterFacet>();
const searchFields = createRegistry<FilterSearchField>();

export const useRegisteredCommands = commands.useEntries;
export const useRegisteredActions = actions.useEntries;
export const useRegisteredFacets = facets.useEntries;
export const useRegisteredSearchFields = searchFields.useEntries;

export function registerAction(action: RegisteredAction): () => void {
  return actions.register(action.id, [action]);
}

export function registerFilter(entry: FilterAnnouncement): () => void {
  if (entry.kind === 'search') return searchFields.register(entry.id, [entry]);
  return facets.register(entry.id, [entry]);
}

function commandSignature(entries: Command[]): string {
  return JSON.stringify(
    entries.map((command) => [
      command.id,
      command.label,
      command.hint,
      command.icon,
      command.keywords,
      command.shortcut,
      'to' in command ? [command.to, command.external] : 'run',
    ])
  );
}

export function useRegisterCommands(entries: Command[]): void {
  const key = useId();
  const latest = useRef(entries);
  latest.current = entries;
  const signature = commandSignature(entries);

  useEffect(() => {
    const bound = latest.current.map((command, index): Command => {
      if ('to' in command) return command;
      return { ...command, run: () => (latest.current[index] as { run: () => void }).run() };
    });
    return commands.register(key, bound);
  }, [key, signature]);
}

export function useCommandHotkeys({
  open,
  onOpenChange,
  base,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  base: string;
}): void {
  const navigate = useNavigate();

  useEffect(() => {
    let pending: number | null = null;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
        return;
      }
      if (open || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (pending !== null) {
        window.clearTimeout(pending);
        pending = null;
        const path = resolveChord(event.key);
        if (path === null) return;
        event.preventDefault();
        void navigate(`${base}${path}`);
        return;
      }
      if (event.key === 'g') {
        pending = window.setTimeout(() => {
          pending = null;
        }, CHORD_WINDOW_MS);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (pending !== null) window.clearTimeout(pending);
    };
  }, [open, onOpenChange, navigate, base]);
}

export function useCommandKey(): string {
  const [key, setKey] = useState('⌘');

  useEffect(() => {
    const apple = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    setKey(apple ? '⌘' : 'Ctrl');
  }, []);

  return key;
}
