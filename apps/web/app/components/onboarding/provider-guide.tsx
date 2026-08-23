import { Button } from '@buzzkit/ui/components/button';
import { CardContent } from '@buzzkit/ui/components/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { Spinner } from '@buzzkit/ui/components/spinner';
import { TextSwap } from '@buzzkit/ui/components/text-swap';
import NumberFlow from '@number-flow/react';
import { useEffect, useState } from 'react';
import { Link, useFetcher, useNavigate } from 'react-router';
import { FileDrop, type LoadedFile } from '@/app/components/onboarding/file-drop';
import type { GuideDefinition, GuideField } from '@/app/components/onboarding/guides';
import type { OnboardingSlots } from '@/app/components/onboarding/layout';
import { STEP_DURATION_MS } from '@/app/components/onboarding/transition';
import type { Credential } from '@/app/lib/api.server';

type FieldValues = Record<string, string>;
type FileValues = Record<string, LoadedFile | null>;

type StoredGuide = {
  values: FieldValues;
  touched: Record<string, boolean>;
  derived?: Record<string, boolean>;
};

function readStored(key: string): StoredGuide | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredGuide) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, stored: StoredGuide | null) {
  try {
    if (stored) window.sessionStorage.setItem(key, JSON.stringify(stored));
    else window.sessionStorage.removeItem(key);
  } catch {}
}

function publicValues(steps: GuideDefinition['steps'], values: FieldValues): FieldValues {
  const secret = new Set(
    steps.flatMap((step) =>
      (step.fields ?? []).filter((field) => field.kind === 'text' && field.secret).map((field) => field.name)
    )
  );
  return Object.fromEntries(Object.entries(values).filter(([name]) => !secret.has(name)));
}

export type ConnectActionData =
  | { ok: true; credentials: Credential[] }
  | { ok: false; error: string; param?: string };

type GuideState = {
  providerId: string;
  current: number;
  values: FieldValues;
  files: FileValues;
  touched: Record<string, boolean>;
  derived: Record<string, boolean>;
};

const counterTiming = { duration: STEP_DURATION_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' } as const;

const CONNECT_FORM = 'connect-provider';

function initialState(providerId: string, current = 0): GuideState {
  return { providerId, current, values: {}, files: {}, touched: {}, derived: {} };
}

function fieldValid(field: GuideField, values: FieldValues, files: FileValues): boolean {
  switch (field.kind) {
    case 'file': {
      const file = files[field.name];
      return Boolean(file) && field.parse(file?.text ?? '').ok;
    }
    case 'text': {
      const value = (values[field.name] ?? '').trim();
      if (!value) return false;
      if (field.pattern) return field.pattern.test(field.uppercase ? value.toUpperCase() : value);
      return true;
    }
  }
}

function hiddenValue(field: GuideField, values: FieldValues, files: FileValues): string {
  if (field.kind === 'file') return files[field.name]?.text ?? '';
  const value = values[field.name] ?? '';
  return field.uppercase ? value.toUpperCase() : value;
}

export function useProviderGuide({
  guide,
  providerId,
  existing,
  backTo,
  initialStep,
  storageKey,
}: {
  guide: GuideDefinition | null;
  providerId: string;
  existing: Credential | null;
  backTo: string;
  initialStep: number;
  storageKey: string;
}): {
  current: number;
  total: number;
  connected: Credential[] | null;
  fetcher: ReturnType<typeof useFetcher<ConnectActionData>>;
  slots: OnboardingSlots | null;
} {
  const fetcher = useFetcher<ConnectActionData>({ key: `connect:${providerId}` });
  const pending = fetcher.state !== 'idle';

  const navigate = useNavigate();
  const [state, setState] = useState<GuideState>(() => initialState(providerId, initialStep));
  if (state.providerId !== providerId) setState(initialState(providerId, initialStep));
  const { current, values, files, touched, derived } = state;
  const patch = (next: Partial<GuideState>) => setState((previous) => ({ ...previous, ...next }));

  const steps = (guide?.steps ?? []).filter(
    (entry) => !(entry.skipWhenDerived && (entry.fields ?? []).every((field) => derived[field.name]))
  );
  const total = steps.length;
  const step = steps[current];
  const last = current === total - 1;

  const stepValid = (index: number) =>
    (steps[index]?.fields ?? []).every((field) => fieldValid(field, values, files));
  const allValid = steps.every((_, index) => stepValid(index));
  const canContinue = stepValid(current);

  const serverError = fetcher.data && !fetcher.data.ok ? fetcher.data : null;
  const connected = fetcher.data?.ok ? fetcher.data.credentials : null;

  useEffect(() => {
    if (!guide) return;
    const stored = readStored(storageKey);
    setState((previous) => {
      const restoredValues = { ...(stored?.values ?? {}), ...previous.values };
      const firstIncomplete = guide.steps.findIndex(
        (entry) => !(entry.fields ?? []).every((field) => fieldValid(field, restoredValues, previous.files))
      );
      const ceiling = firstIncomplete === -1 ? guide.steps.length - 1 : firstIncomplete;
      return {
        ...previous,
        values: restoredValues,
        touched: { ...(stored?.touched ?? {}), ...previous.touched },
        derived: { ...(stored?.derived ?? {}), ...previous.derived },
        current: Math.min(previous.current, ceiling),
      };
    });
  }, [guide, storageKey]);

  useEffect(() => {
    if (!guide) return;
    writeStored(
      storageKey,
      connected ? null : { values: publicValues(guide.steps, values), touched, derived }
    );
  }, [guide, storageKey, values, touched, derived, connected]);

  useEffect(() => {
    if (!guide) return;
    const url = new URL(window.location.href);
    const stepParam = current === 0 ? null : String(current + 1);
    if (url.searchParams.get('step') === stepParam) return;
    if (stepParam) url.searchParams.set('step', stepParam);
    else url.searchParams.delete('step');
    navigate(`${url.pathname}${url.search}`, { replace: true, preventScrollReset: true });
  }, [guide, current, navigate]);

  const errorField = serverError?.param
    ? (guide?.steps ?? [])
        .flatMap((entry) => entry.fields ?? [])
        .find((field) => field.name === serverError.param)
    : undefined;

  useEffect(() => {
    if (!guide || !errorField) return;
    setState((previous) => {
      const unskipped = { ...previous.derived, [errorField.name]: false };
      const visible = guide.steps.filter(
        (entry) => !(entry.skipWhenDerived && (entry.fields ?? []).every((field) => unskipped[field.name]))
      );
      const index = visible.findIndex((entry) =>
        entry.fields?.some((field) => field.name === errorField.name)
      );
      return { ...previous, derived: unskipped, current: index >= 0 ? index : previous.current };
    });
  }, [guide, errorField]);

  const go = (index: number) => patch({ current: Math.max(0, Math.min(index, total - 1)) });
  const next = () => {
    if (!canContinue || last) return;
    go(current + 1);
  };
  const submit = () => {
    if (!allValid || pending) return;
    (document.getElementById(CONNECT_FORM) as HTMLFormElement | null)?.requestSubmit();
  };

  if (!guide || !step) return { current, total, connected, fetcher, slots: null };

  const primaryLabel = last ? (pending ? 'Checking' : guide.connectLabel) : 'Next';

  const slots: OnboardingSlots = {
    title: (
      <>
        {step.title}
        <span className='sr-only'>
          , step {current + 1} of {total}
        </span>
      </>
    ),
    description: step.description,
    content: (
      <fetcher.Form method='post' id={CONNECT_FORM}>
        <input type='hidden' name='intent' value='connect' />
        {guide.steps.flatMap((entry) =>
          (entry.fields ?? []).map((field) => (
            <input
              key={field.name}
              type='hidden'
              name={field.name}
              value={hiddenValue(field, values, files)}
            />
          ))
        )}
        <CardContent className='gap-4'>
          <div className='corner-superellipse/1.125 w-full rounded-xl bg-bg-2 p-3'>
            <step.illustration />
          </div>

          {step.link && (
            <div className='flex'>
              <Button
                variant='elevated'
                size='sm'
                nativeButton={false}
                icon={{ name: 'IconArrowUpRight', position: 'inline-end' }}
                render={<a href={step.link.href} target='_blank' rel='noreferrer' />}
              >
                {step.link.label}
              </Button>
            </div>
          )}

          {step.fields?.map((field) => (
            <GuideFieldControl
              key={field.name}
              field={field}
              value={values[field.name] ?? ''}
              file={files[field.name] ?? null}
              touched={Boolean(touched[field.name])}
              serverError={serverError?.param === field.name ? serverError.error : null}
              onChange={(value) =>
                patch({
                  values: { ...values, [field.name]: value },
                  touched: { ...touched, [field.name]: false },
                })
              }
              onFile={(file) => {
                const extracted = file && field.kind === 'file' && field.derive ? field.derive(file) : {};
                const cleared = Object.fromEntries(Object.keys(derived).map((name) => [name, '']));
                patch({
                  files: { ...files, [field.name]: file },
                  touched: { ...touched, [field.name]: true },
                  values: { ...values, ...cleared, ...extracted },
                  derived: Object.fromEntries(Object.keys(extracted).map((name) => [name, true])),
                });
              }}
              onBlur={() => patch({ touched: { ...touched, [field.name]: true } })}
              onSubmit={() => {
                patch({ touched: { ...touched, [field.name]: true } });
                next();
              }}
            />
          ))}

          {step.note && <p className='text-pretty text-fg-2 text-xs'>{step.note}</p>}
          {existing && last && (
            <p className='text-pretty text-fg-2 text-xs'>Connecting again replaces the current key.</p>
          )}
          {serverError && !errorField && last && <FieldError>{serverError.error}</FieldError>}
        </CardContent>
      </fetcher.Form>
    ),
    footer: (
      <>
        {current === 0 ? (
          <Button
            variant='ghost'
            size='xs'
            className='-ml-2'
            nativeButton={false}
            render={<Link to={backTo} />}
          >
            Back
          </Button>
        ) : (
          <Button variant='ghost' size='xs' className='-ml-2' onClick={() => go(current - 1)}>
            Back
          </Button>
        )}
        <NumberFlow
          className='-translate-x-1/2 absolute left-1/2 text-fg-2 text-xs tabular-nums'
          value={current + 1}
          suffix={` of ${total}`}
          transformTiming={counterTiming}
          spinTiming={counterTiming}
          opacityTiming={counterTiming}
        />
        <Button
          type='button'
          size='xs'
          aria-label={primaryLabel}
          disabled={last ? !allValid || pending : !canContinue}
          onClick={last ? submit : next}
        >
          {pending && <Spinner />}
          <TextSwap>{primaryLabel}</TextSwap>
        </Button>
      </>
    ),
  };

  return { current, total, connected, fetcher, slots };
}

function GuideFieldControl({
  field,
  value,
  file,
  touched,
  serverError,
  onChange,
  onFile,
  onBlur,
  onSubmit,
}: {
  field: GuideField;
  value: string;
  file: LoadedFile | null;
  touched: boolean;
  serverError: string | null;
  onChange: (value: string) => void;
  onFile: (file: LoadedFile | null) => void;
  onBlur: () => void;
  onSubmit: () => void;
}) {
  if (field.kind === 'file') {
    const parsed = file ? field.parse(file.text) : null;
    const error = serverError ?? (parsed && !parsed.ok ? parsed.error : null);
    return (
      <FileDrop
        label={field.label}
        accept={field.accept}
        prompt={field.prompt}
        hint={field.hint}
        value={file}
        error={error}
        summary={parsed?.ok ? parsed.summary : null}
        onChange={onFile}
      />
    );
  }

  const normalized = field.uppercase ? value.toUpperCase() : value;
  const empty = normalized.trim().length === 0;
  const invalid = !empty && field.pattern ? !field.pattern.test(normalized.trim()) : false;
  const showError = serverError ?? (touched && invalid ? field.invalidMessage : null);
  const id = `field-${field.name}`;

  return (
    <Field data-invalid={showError ? true : undefined}>
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      <Input
        id={id}
        type={field.secret ? 'password' : 'text'}
        value={normalized}
        placeholder={field.placeholder}
        autoComplete='off'
        spellCheck={false}
        maxLength={field.length}
        aria-invalid={showError ? true : undefined}
        aria-describedby={showError ? `${id}-error` : field.hint ? `${id}-hint` : undefined}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      {showError ? (
        <FieldError id={`${id}-error`}>{showError}</FieldError>
      ) : field.hint ? (
        <FieldDescription id={`${id}-hint`} className='text-xs'>
          {field.hint}
        </FieldDescription>
      ) : null}
    </Field>
  );
}
