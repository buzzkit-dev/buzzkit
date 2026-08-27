import { toast } from '@buzzkit/ui/components/sonner';
import { useEffect, useRef } from 'react';
import { useFetcher } from 'react-router';

export type SettingsActionData = { ok?: boolean; error?: string; description?: string } & Record<
  string,
  unknown
>;

export function useActionFetcher(onDone?: (data: SettingsActionData) => void, options?: { action?: string }) {
  const fetcher = useFetcher<SettingsActionData>();
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const handled = useRef<SettingsActionData | null>(null);

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data || handled.current === fetcher.data) return;
    handled.current = fetcher.data;
    if (fetcher.data.error) toast.error(fetcher.data.error, { description: fetcher.data.description });
    else onDoneRef.current?.(fetcher.data);
  }, [fetcher.state, fetcher.data]);

  const submit = (intent: string, fields: Record<string, string> = {}) =>
    fetcher.submit(
      { intent, ...fields },
      { method: 'post', ...(options?.action ? { action: options.action } : {}) }
    );

  return { fetcher, submit, pending: fetcher.state !== 'idle' };
}
