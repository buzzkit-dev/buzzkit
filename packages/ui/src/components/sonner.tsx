'use client';

import { Icon } from '@buzzkit/ui/components/icon';
import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';
import { type ExternalToast, Toaster as Sonner, toast as sonnerToast, type ToasterProps } from 'sonner';

/**
 * Watches live toasts for a `data-type` change from loading → result. That
 * transition is how sonner expresses a settled promise; we play the same
 * attention cue used for duplicate fires so the UX stays consistent.
 */
function usePromiseSettleCue() {
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'attributes' || mutation.attributeName !== 'data-type') continue;
        const el = mutation.target as HTMLElement;
        if (!el.matches?.('[data-sonner-toast].bk-toast')) continue;
        const next = el.getAttribute('data-type');
        if (mutation.oldValue === 'loading' && next && next !== 'loading') {
          playAttentionCue(el, isKind(next) ? next : 'default');
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['data-type'],
    });
    return () => observer.disconnect();
  }, []);
}

const Toaster = ({ ...props }: ToasterProps) => {
  usePromiseSettleCue();

  return (
    <Sonner
      // Colors come from our tokens, which already flip with the `.dark` class.
      className='toaster group'
      position='top-center'
      offset={{ top: 54 }}
      gap={12}
      icons={{
        success: <Icon name='IconCheckCircle2' className='size-4.5 text-green-4' />,
        info: <Icon name='IconInfoSimple' className='size-4.5 text-sky-4' />,
        warning: <Icon name='IconExclamationTriangle' className='size-4.5 text-amber-4' />,
        error: <Icon name='IconExclamationCircle' className='size-4.5 text-red-4' />,
        loading: <Icon name='IconLoadingCircle' className='size-4.5 animate-spin text-fg-2' />,
      }}
      style={
        {
          // The real background is set inline below (so alpha survives sonner's
          // own stylesheet); these stay as fallbacks.
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'transparent',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'bk-toast corner-superellipse/1.125 rounded-3xl font-medium !shadow-md',
          // Sonner ships its own button styling; override to our button language.
          actionButton:
            'bk-toast-button corner-superellipse/1.125 !h-7 !rounded-xl !bg-primary !px-2.5 !font-medium !text-primary-foreground !text-xs',
          cancelButton:
            'bk-toast-button corner-superellipse/1.125 !h-7 !rounded-xl !bg-bg-a2 !px-2.5 !font-medium !text-fg-3 !text-xs',
          closeButton: 'bk-toast-button corner-superellipse/1.125 !rounded-lg !bg-bg-2 !text-fg-3',
        },
        // Inline style beats sonner's injected stylesheet — the reliable place
        // for translucency + blur.
        style: {
          fontSize: '14px',
          backgroundColor: 'oklch(from var(--popover) l c h / 0.72)',
          backdropFilter: 'blur(24px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
          userSelect: 'none',
        } as React.CSSProperties,
      }}
      {...props}
    />
  );
};

/* ── Deduped fire helpers ─────────────────────────────────────────────────
 * If a toast with the same kind+message is already on screen we don't spawn a
 * duplicate — we ping the existing one instead:
 *   error / warning → shake (grab attention)
 *   default / success / info → bump (subtle acknowledgement)
 * Dedup key is kind+message, tracked in `sigToActive`, drained on dismiss.
 * Cues animate `translate` / `scale` so they compose with sonner's own
 * transform-driven stack positioning.
 * ────────────────────────────────────────────────────────────────────── */

type Kind = 'default' | 'success' | 'info' | 'warning' | 'error';

function isKind(value: string): value is Kind {
  return (
    value === 'default' || value === 'success' || value === 'info' || value === 'warning' || value === 'error'
  );
}

type Active = { sonnerId: string; instance: number };
const sigToActive = new Map<string, Active>();
let instanceCounter = 0;

function hashKey(kind: Kind, message: unknown): string {
  const raw = typeof message === 'string' ? message : JSON.stringify(message);
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  return `${kind}-${Math.abs(hash).toString(36)}`;
}

function instanceClass(n: number) {
  return `bk-toast-i-${n}`;
}

function pingInstance(n: number, kind: Kind) {
  if (typeof document === 'undefined') return;
  const el = document.querySelector<HTMLElement>(`[data-sonner-toast].${instanceClass(n)}`);
  if (el) playAttentionCue(el, kind);
}

function playAttentionCue(el: HTMLElement, kind: Kind) {
  const animation = kind === 'error' || kind === 'warning' ? 'bk-toast-shake' : 'bk-toast-bump';
  el.classList.remove('bk-toast-shake', 'bk-toast-bump');
  void el.offsetWidth;
  el.classList.add(animation);
}

function isInstanceAtTop(n: number): boolean {
  if (typeof document === 'undefined') return false;
  const list = document.querySelector('[data-sonner-toaster]');
  if (!list) return false;
  const first = list.querySelector<HTMLElement>('[data-sonner-toast]:not([data-removed="true"])');
  return !!first && first.classList.contains(instanceClass(n));
}

/**
 * Loading toasts are sonner `promise` toasts under the hood, which buys us
 * sonner's native loader → result cross-fade when the caller later transitions
 * via `toast.success(msg, { id })`. This map holds the promise's settle
 * handlers until that happens.
 */
type LoadingHandle = {
  resolve: (value: { kind: Kind; message: React.ReactNode }) => void;
  reject: (value: { kind: Kind; message: React.ReactNode }) => void;
};
const pendingLoadings = new Map<string | number, LoadingHandle>();

function fire(kind: Kind, message: string | React.ReactNode, options: ExternalToast = {}): string | number {
  // Caller-provided id matching a pending loading toast: settle the underlying
  // promise so sonner plays its built-in cross-fade instead of an icon swap.
  if (options.id != null && pendingLoadings.has(options.id)) {
    const handle = pendingLoadings.get(options.id);
    pendingLoadings.delete(options.id);
    if (handle) {
      if (kind === 'error' || kind === 'warning') handle.reject({ kind, message });
      else handle.resolve({ kind, message });
    }
    return options.id;
  }

  // An explicit id means the caller manages identity — skip dedup entirely.
  if (options.id != null) return callSonner(kind, message, options);

  const signature = hashKey(kind, message);
  const previous = sigToActive.get(signature);

  // Duplicate already on top: update in place (resets the auto-close timer)
  // and play the cue. No reorder.
  if (previous && isInstanceAtTop(previous.instance)) {
    const updated = callSonner(kind, message, {
      ...options,
      id: previous.sonnerId,
      className: cn(instanceClass(previous.instance), options.className),
    });
    requestAnimationFrame(() => pingInstance(previous.instance, kind));
    return updated;
  }

  // Duplicate buried under newer toasts: drop the old one so this lands on top.
  if (previous) sonnerToast.dismiss(previous.sonnerId);

  const instance = ++instanceCounter;
  const sonnerId = `${signature}-${instance}`;
  sigToActive.set(signature, { sonnerId, instance });

  const forget = () => {
    if (sigToActive.get(signature)?.sonnerId === sonnerId) sigToActive.delete(signature);
  };

  const returned = callSonner(kind, message, {
    ...options,
    id: sonnerId,
    className: cn(instanceClass(instance), options.className),
    onDismiss: (t) => {
      forget();
      options.onDismiss?.(t);
    },
    onAutoClose: (t) => {
      forget();
      options.onAutoClose?.(t);
    },
  });

  if (previous) requestAnimationFrame(() => pingInstance(instance, kind));
  return returned;
}

function callSonner(kind: Kind, message: string | React.ReactNode, options: ExternalToast): string | number {
  switch (kind) {
    case 'success':
      return sonnerToast.success(message, options);
    case 'error':
      return sonnerToast.error(message, options);
    case 'warning':
      return sonnerToast.warning(message, options);
    case 'info':
      return sonnerToast.info(message, options);
    default:
      return sonnerToast(message, options);
  }
}

type MessageArg = string | React.ReactNode;
type ToastId = string | number;

// Sonner's passthrough methods are wrapped explicitly so emitted types don't
// reference sonner internals.
const toast = Object.assign(
  (message: MessageArg, options?: ExternalToast): ToastId => fire('default', message, options),
  {
    success: (message: MessageArg, options?: ExternalToast): ToastId => fire('success', message, options),
    error: (message: MessageArg, options?: ExternalToast): ToastId => fire('error', message, options),
    warning: (message: MessageArg, options?: ExternalToast): ToastId => fire('warning', message, options),
    info: (message: MessageArg, options?: ExternalToast): ToastId => fire('info', message, options),
    loading: (message: MessageArg, options?: ExternalToast): ToastId => {
      let resolve!: LoadingHandle['resolve'];
      let reject!: LoadingHandle['reject'];
      const settled = new Promise<{ kind: Kind; message: React.ReactNode }>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      const render = (result: { message: React.ReactNode }) => result.message;
      const id = sonnerToast.promise(settled, {
        ...options,
        loading: message,
        success: render,
        error: render,
      }) as ToastId;
      pendingLoadings.set(id, { resolve, reject });
      return id;
    },
    promise: <T,>(
      promise: Promise<T> | (() => Promise<T>),
      options: Parameters<typeof sonnerToast.promise<T>>[1]
    ): ToastId => sonnerToast.promise(promise, options) as unknown as ToastId,
    dismiss: (id?: ToastId): ToastId | undefined => sonnerToast.dismiss(id) ?? undefined,
    custom: (jsx: (id: ToastId) => React.ReactElement, options?: ExternalToast): ToastId =>
      sonnerToast.custom(jsx, options),
    message: (message: MessageArg, options?: ExternalToast): ToastId => sonnerToast.message(message, options),
  }
);

export { Toaster, toast };
