import { toast } from '@buzzkit/ui/components/sonner';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';

export type BackgroundJobActionData = {
  error?: string;
  description?: string;
  [key: string]: unknown;
};

export type BackgroundJobStep = {
  action: string;
  data: Record<string, string>;
  units: number;
  method?: 'post' | 'put' | 'patch' | 'delete';
};

type ToastCopy = { title: string; description?: string };

export type BackgroundJobDefinition<State> = {
  id: string;
  title: string;
  failureTitle: string;
  unit: string;
  total: number;
  steps: BackgroundJobStep[];
  initialState: State;
  reduce: (state: State, response: BackgroundJobActionData) => State;
  success: (state: State) => ToastCopy;
};

type ErasedJobDefinition = BackgroundJobDefinition<unknown>;

type ActiveJob = {
  definition: ErasedJobDefinition;
  step: number;
  completed: number;
  state: unknown;
  toastId: string | number;
};

type BackgroundJobContextValue = {
  activeJobId: string | null;
  start: <State>(definition: BackgroundJobDefinition<State>) => boolean;
};

const BackgroundJobContext = createContext<BackgroundJobContextValue | null>(null);

function progressLabel(completed: number, total: number, unit: string): string {
  return `${completed.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} ${unit}`;
}

export function BackgroundJobProvider({ children }: { children: React.ReactNode }) {
  const fetcher = useFetcher<BackgroundJobActionData>({ key: 'background-job' });
  const [job, setJob] = useState<ActiveJob | null>(null);
  const active = useRef(false);
  const handled = useRef<BackgroundJobActionData | null>(null);

  const submit = (step: BackgroundJobStep) => {
    void fetcher.submit(step.data, { method: step.method ?? 'post', action: step.action });
  };

  const start = <State,>(definition: BackgroundJobDefinition<State>): boolean => {
    if (active.current || definition.steps.length === 0 || definition.total <= 0) return false;
    const toastId = toast.loading(definition.title, {
      description: progressLabel(0, definition.total, definition.unit),
      duration: Number.POSITIVE_INFINITY,
    });
    active.current = true;
    handled.current = fetcher.data ?? null;
    setJob({
      definition: definition as unknown as ErasedJobDefinition,
      step: 0,
      completed: 0,
      state: definition.initialState,
      toastId,
    });
    submit(definition.steps[0]!);
    return true;
  };

  useEffect(() => {
    if (!job || fetcher.state !== 'idle' || !fetcher.data || handled.current === fetcher.data) return;
    handled.current = fetcher.data;
    const { definition } = job;

    const fail = (detail?: string) => {
      const progress = progressLabel(job.completed, definition.total, definition.unit);
      toast.loading(definition.title, {
        id: job.toastId,
        description: `${progress} completed before the job stopped.${detail ? ` ${detail}` : ''}`,
        duration: Number.POSITIVE_INFINITY,
      });
      toast.error(definition.failureTitle, { id: job.toastId });
      active.current = false;
      setJob(null);
    };

    if (fetcher.data.error) {
      fail(fetcher.data.description ?? fetcher.data.error);
      return;
    }

    let state: unknown;
    try {
      state = definition.reduce(job.state, fetcher.data);
    } catch (error) {
      fail(error instanceof Error ? error.message : undefined);
      return;
    }

    const completed = job.completed + definition.steps[job.step]!.units;
    const next = job.step + 1;
    if (next < definition.steps.length) {
      toast.loading(definition.title, {
        id: job.toastId,
        description: progressLabel(completed, definition.total, definition.unit),
        duration: Number.POSITIVE_INFINITY,
      });
      setJob({ ...job, step: next, completed, state });
      submit(definition.steps[next]!);
      return;
    }

    const success = definition.success(state);
    toast.loading(definition.title, {
      id: job.toastId,
      description: success.description,
      duration: Number.POSITIVE_INFINITY,
    });
    toast.success(success.title, { id: job.toastId });
    active.current = false;
    setJob(null);
  }, [fetcher.data, fetcher.state, job]);

  return (
    <BackgroundJobContext.Provider value={{ activeJobId: job?.definition.id ?? null, start }}>
      {children}
    </BackgroundJobContext.Provider>
  );
}

export function useBackgroundJobs(): BackgroundJobContextValue {
  const context = useContext(BackgroundJobContext);
  if (!context) throw new Error('useBackgroundJobs must be used inside BackgroundJobProvider');
  return context;
}
