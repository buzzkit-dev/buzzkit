import { createContext, useContext } from 'react';
import type { Channel } from '@/app/lib/channels';

export type QuickStartHint = { quickstart: boolean; connected: Channel[] };

const QuickStartContext = createContext<QuickStartHint>({ quickstart: false, connected: [] });

export function QuickStartProvider({ hint, children }: { hint: QuickStartHint; children: React.ReactNode }) {
  return <QuickStartContext.Provider value={hint}>{children}</QuickStartContext.Provider>;
}

export function useQuickStart(): QuickStartHint {
  return useContext(QuickStartContext);
}
