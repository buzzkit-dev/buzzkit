export type Visual =
  | { kind: 'notifications' }
  | { kind: 'actions' }
  | { kind: 'liveActivity' }
  | { kind: 'agents' }
  | { kind: 'workflow' }
  | { kind: 'segment' }
  | { kind: 'preferences' }
  | { kind: 'ledger' }
  | { kind: 'schedule' }
  | { kind: 'sources' }
  | { kind: 'tenants' }
  | { kind: 'apiKey' }
  | { kind: 'dashboard' }
  | { kind: 'phone' };
