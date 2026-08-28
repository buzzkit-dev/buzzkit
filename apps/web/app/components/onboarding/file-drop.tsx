import { Button } from '@buzzkit/ui/components/button';
import type { IconName } from '@buzzkit/ui/components/icon';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { cn } from '@buzzkit/ui/lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type LoadedFile = { name: string; text: string };

type DragState = { active: boolean; valid: boolean };

function acceptedTypes(accept: string) {
  const entries = accept.split(',').map((entry) => entry.trim().toLowerCase());
  return {
    extensions: entries.filter((entry) => entry.startsWith('.')),
    mimes: entries.filter((entry) => !entry.startsWith('.')),
  };
}

function dragLooksValid(transfer: DataTransfer | null, accept: string): boolean {
  if (!transfer) return true;
  const { mimes } = acceptedTypes(accept);
  const files = Array.from(transfer.items ?? []).filter((item) => item.kind === 'file');
  if (files.length !== 1) return files.length === 0;
  const type = files[0]!.type.toLowerCase();
  if (!type) return true;
  return mimes.includes(type) || type === 'application/octet-stream';
}

function fileMatches(file: File, accept: string): boolean {
  const { extensions, mimes } = acceptedTypes(accept);
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return extensions.some((extension) => name.endsWith(extension)) || (type !== '' && mimes.includes(type));
}

function useWindowDrop(accept: string, onDrop: (file: File | null) => void): DragState {
  const [state, setState] = useState<DragState>({ active: false, valid: true });
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setState({ active: true, valid: dragLooksValid(event.dataTransfer, accept) });
    };
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setState({ active: false, valid: true });
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setState({ active: false, valid: true });
      onDrop(event.dataTransfer?.files?.[0] ?? null);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [accept, onDrop]);

  return state;
}

const overlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15, ease: 'easeOut' },
} as const;

const panelMotion = {
  initial: { scale: 0.96 },
  animate: { scale: 1 },
  exit: { scale: 0.96 },
  transition: { type: 'spring', duration: 0.3, bounce: 0 },
} as const;

function DropOverlay({
  state,
  icon,
  prompt,
  rejectMessage,
}: {
  state: DragState;
  icon: IconName;
  prompt: string;
  rejectMessage: string;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {state.active && (
        <motion.div
          key='drop-overlay'
          aria-live='polite'
          className='pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm'
          {...overlayMotion}
        >
          <motion.div
            className={cn(
              'corner-superellipse/1.125 flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-10 text-center',
              state.valid ? 'border-primary-3 bg-bg-1' : 'border-red-3 bg-red-1'
            )}
            {...panelMotion}
          >
            <IconTile
              icon={state.valid ? icon : 'IconExclamationTriangle'}
              size='lg'
              tone={state.valid ? 'default' : 'red'}
            />
            <div className='flex flex-col gap-0.5'>
              <p
                className={cn(
                  'text-balance font-medium text-base leading-tighter',
                  state.valid ? 'text-fg-4' : 'text-red-text'
                )}
              >
                {state.valid ? prompt : rejectMessage}
              </p>
              <p className={cn('text-pretty text-sm', state.valid ? 'text-fg-2' : 'text-red-text')}>
                {state.valid ? 'Release anywhere on the page.' : 'Only that file type is accepted here.'}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function FileDrop({
  label,
  accept,
  icon = 'IconFileTextFilled',
  prompt,
  hint,
  value,
  error,
  summary,
  onChange,
}: {
  label: string;
  accept: string;
  icon?: IconName;
  prompt: string;
  hint?: string;
  value: LoadedFile | null;
  error?: string | null;
  summary?: string | null;
  onChange: (file: LoadedFile | null) => void;
}) {
  const id = useId();
  const [rejected, setRejected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rejectLabel = accept
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('.'))
    .map((entry) => `a ${entry} file`)
    .join(' or ');

  const read = async (file: File | undefined | null) => {
    if (!file) return;
    if (!fileMatches(file, accept)) {
      setRejected(`${file.name} is not ${rejectLabel}.`);
      onChange(null);
      return;
    }
    setRejected(null);
    onChange({ name: file.name, text: await file.text() });
  };

  const dragState = useWindowDrop(accept, read);

  const shownError = error ?? rejected;
  const invalid = Boolean(shownError);
  const overlay = (
    <DropOverlay state={dragState} icon={icon} prompt={prompt} rejectMessage={`Drop ${rejectLabel}.`} />
  );

  if (value && !invalid) {
    return (
      <div
        className={cn(
          'corner-superellipse/1.125 flex w-full items-center gap-3 rounded-xl border border-green-3 bg-green-1/40 px-3.5 py-3',
          'transition-[border-color,background-color] duration-150'
        )}
      >
        <IconTile icon={icon} tone='green' />
        <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
          <span className='truncate font-medium text-fg-4 text-xs'>{value.name}</span>
          {summary && <span className='truncate text-fg-2 text-xs'>{summary}</span>}
        </span>
        <Button
          variant='ghost'
          size='icon-xs'
          className='-mr-0.75'
          icon='IconCrossMedium'
          aria-label='Remove file'
          onClick={() => onChange(null)}
        />
        {overlay}
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-1.5'>
      <input
        ref={inputRef}
        id={id}
        type='file'
        accept={accept}
        className='sr-only'
        aria-label={label}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void read(file);
        }}
      />
      <button
        type='button'
        aria-describedby={shownError ? `${id}-error` : undefined}
        aria-invalid={invalid || undefined}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'corner-superellipse/1.125 flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3.5 py-3 text-left outline-none',
          'transition-[border-color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-primary-2',
          invalid
            ? 'border-red-3 bg-red-1/40'
            : dragState.active
              ? 'border-primary-3 bg-bg-2'
              : 'border-bg-4 bg-bg-1 hover:bg-bg-2/60 active:bg-bg-2/60'
        )}
      >
        {value ? (
          <IconTile icon={icon} tone={invalid ? 'red' : 'default'} />
        ) : (
          <IconTile icon='IconCloudUploadFilled' tone={invalid ? 'red' : 'default'} />
        )}
        <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
          <span className='truncate font-medium text-fg-4 text-sm'>{value ? value.name : prompt}</span>
          {hint && !value && <span className='text-pretty text-fg-2 text-xs'>{hint}</span>}
          {value && <span className='text-fg-2 text-xs'>Choose a different file</span>}
        </span>
      </button>
      {shownError && (
        <span id={`${id}-error`} role='alert' className='text-red-text text-xs'>
          {shownError}
        </span>
      )}
      {overlay}
    </div>
  );
}
