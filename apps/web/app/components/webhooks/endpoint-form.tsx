import { Field, FieldDescription, FieldError, FieldLabel } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { ScopePicker } from '@buzzkit/ui/components/scope-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buzzkit/ui/components/select';
import { useState } from 'react';
import type { WebhookCatalog } from '@/app/lib/api.server';

type Preset = 'all' | 'custom';

export const ALL_TENANTS = '*';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'all', label: 'Every event' },
  { value: 'custom', label: 'Pick events' },
];

type EndpointFormValues = {
  url: string;
  description: string;
  tenant: string;
  events: string[];
};

type EndpointFormState = ReturnType<typeof useEndpointForm>;

function describeUrlProblem(value: string): string | null {
  if (value.trim().length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return 'Enter a full URL, starting with https://';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return 'The URL must start with https://';
  if (parsed.username || parsed.password) return 'The URL cannot contain a username or password';
  return null;
}

function parseCustomEvents(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function splitEvents(events: string[], catalog: WebhookCatalog): { picked: string[]; custom: string } {
  const known = new Set(
    catalog.groups.flatMap((group) => [...group.options, ...(group.wildcard ? [group.wildcard] : [])])
  );
  return {
    picked: events.filter((event) => known.has(event)),
    custom: events.filter((event) => !known.has(event)).join(', '),
  };
}

export function useEndpointForm(initial: Partial<EndpointFormValues>, catalog: WebhookCatalog) {
  const initialEvents = initial.events ?? [];
  const initialSplit = splitEvents(initialEvents, catalog);
  const [url, setUrl] = useState(initial.url ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [tenant, setTenant] = useState(initial.tenant ?? ALL_TENANTS);
  const [preset, setPreset] = useState<Preset>(
    initialEvents.length === 0 || initialEvents.includes('*') ? 'all' : 'custom'
  );
  const [picked, setPicked] = useState<string[]>(initialSplit.picked);
  const [custom, setCustom] = useState(initialSplit.custom);

  const events = preset === 'all' ? [] : [...picked, ...parseCustomEvents(custom)];
  const urlProblem = describeUrlProblem(url);
  const valid = url.trim().length > 0 && urlProblem === null && (preset === 'all' || events.length > 0);

  return {
    url,
    setUrl,
    description,
    setDescription,
    tenant,
    setTenant,
    preset,
    setPreset,
    picked,
    setPicked,
    custom,
    setCustom,
    urlProblem,
    valid,
    values: {
      url: url.trim(),
      description: description.trim(),
      tenant: tenant === ALL_TENANTS ? '' : tenant,
      events,
    } satisfies EndpointFormValues,
  };
}

export function EndpointFields({
  form,
  catalog,
  tenants,
  idPrefix,
}: {
  form: EndpointFormState;
  catalog: WebhookCatalog;
  tenants: { id: string; name: string; slug: string }[];
  idPrefix: string;
}) {
  return (
    <>
      <Field data-invalid={form.urlProblem ? true : undefined}>
        <FieldLabel htmlFor={`${idPrefix}-url`}>URL</FieldLabel>
        <Input
          id={`${idPrefix}-url`}
          value={form.url}
          onChange={(event) => form.setUrl(event.target.value)}
          placeholder='https://api.acme.com/webhooks/buzzkit'
          autoComplete='off'
          spellCheck={false}
          aria-invalid={form.urlProblem ? true : undefined}
          aria-describedby={form.urlProblem ? `${idPrefix}-url-error` : undefined}
        />
        {form.urlProblem ? (
          <FieldError id={`${idPrefix}-url-error`}>{form.urlProblem}</FieldError>
        ) : (
          <FieldDescription>Signed JSON is posted here for every matching event.</FieldDescription>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-description`}>Description</FieldLabel>
        <Input
          id={`${idPrefix}-description`}
          value={form.description}
          onChange={(event) => form.setDescription(event.target.value)}
          placeholder='CRM sync'
          maxLength={500}
        />
      </Field>
      {tenants.length > 1 && (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-tenant`}>Tenant</FieldLabel>
          <Select
            items={[
              { value: ALL_TENANTS, label: 'All tenants' },
              ...tenants.map((entry) => ({ value: entry.slug, label: entry.name })),
            ]}
            value={form.tenant}
            onValueChange={(value) => form.setTenant(String(value))}
          >
            <SelectTrigger id={`${idPrefix}-tenant`} className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TENANTS}>All tenants</SelectItem>
              {tenants.map((entry) => (
                <SelectItem key={entry.id} value={entry.slug}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>Only events from this tenant are delivered when one is picked.</FieldDescription>
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-preset`}>Events</FieldLabel>
        <Select
          items={PRESETS}
          value={form.preset}
          onValueChange={(value) => form.setPreset(value as Preset)}
        >
          <SelectTrigger id={`${idPrefix}-preset`} className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          {form.preset === 'all'
            ? 'Every workspace, subscriber and tracked event, including names added later.'
            : 'Exactly the events this endpoint should receive.'}
        </FieldDescription>
      </Field>
      {form.preset === 'custom' && (
        <>
          <Field>
            <FieldLabel>BuzzKit events</FieldLabel>
            <ScopePicker
              groups={catalog.groups}
              selected={form.picked}
              onChange={form.setPicked}
              searchPlaceholder='Search events'
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-custom`}>Your events</FieldLabel>
            <Input
              id={`${idPrefix}-custom`}
              value={form.custom}
              onChange={(event) => form.setCustom(event.target.value)}
              placeholder='order.completed, order.*'
              autoComplete='off'
              spellCheck={false}
            />
            <FieldDescription>
              Names you track with the API or the SDK, comma separated. End one with .* to match a prefix.
            </FieldDescription>
          </Field>
        </>
      )}
    </>
  );
}
