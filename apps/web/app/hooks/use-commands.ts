import type { FilterFacet } from '@buzzkit/ui/components/filter-bar';
import type { IconName } from '@buzzkit/ui/components/icon';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
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

const registrations = new Map<string, Command[]>();
const listeners = new Set<() => void>();
const NONE: Command[] = [];
let snapshot: Command[] = NONE;

function publish() {
  snapshot = [...registrations.values()].flat();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRegisteredCommands(): Command[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => NONE
  );
}

const facets = new Map<string, FilterFacet>();
const facetListeners = new Set<() => void>();
const NO_FACETS: FilterFacet[] = [];
let facetSnapshot: FilterFacet[] = NO_FACETS;

function publishFacets() {
  facetSnapshot = [...facets.values()];
  for (const listener of facetListeners) listener();
}

export function registerFacet(facet: FilterFacet): () => void {
  facets.set(facet.id, facet);
  publishFacets();
  return () => {
    facets.delete(facet.id);
    publishFacets();
  };
}

export function useRegisteredFacets(): FilterFacet[] {
  return useSyncExternalStore(
    (listener) => {
      facetListeners.add(listener);
      return () => {
        facetListeners.delete(listener);
      };
    },
    () => facetSnapshot,
    () => NO_FACETS
  );
}

export function useRegisterCommands(commands: Command[]): void {
  const key = useId();

  useEffect(() => {
    registrations.set(key, commands);
    publish();
    return () => {
      registrations.delete(key);
      publish();
    };
  }, [key, commands]);
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
