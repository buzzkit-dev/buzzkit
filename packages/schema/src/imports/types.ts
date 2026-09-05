import type {
  ANONYMOUS_POLICIES,
  AVAILABLE_CHANNELS,
  IMPORT_CHANNELS,
  IMPORT_ENVIRONMENTS,
  IMPORT_PROVIDERS,
  IMPORT_TARGETS,
  SKIP_REASONS,
  UNSUBSCRIBED_POLICIES,
} from './constants';

export type ImportProvider = (typeof IMPORT_PROVIDERS)[number];

export type ImportChannel = (typeof IMPORT_CHANNELS)[number];

export type AvailableChannel = (typeof AVAILABLE_CHANNELS)[number];

export type ImportPlatform = 'ios' | 'android';

export type ImportTargetEntry = (typeof IMPORT_TARGETS)[number];

export type ImportTarget = ImportTargetEntry['id'];

export type ImportEnvironment = (typeof IMPORT_ENVIRONMENTS)[number];

export type SkipReason = (typeof SKIP_REASONS)[number];

export type AnonymousPolicy = (typeof ANONYMOUS_POLICIES)[number];

export type UnsubscribedPolicy = (typeof UNSUBSCRIBED_POLICIES)[number];

export type ImportDevice = {
  appVersion?: string;
  osVersion?: string;
  model?: string;
};

export type ImportRow = {
  externalId: string;
  channel?: AvailableChannel;
  platform?: ImportPlatform;
  environment?: ImportEnvironment;
  token?: string;
  address?: string;
  attributes?: Record<string, unknown>;
  timezone?: string;
  language?: string;
  country?: string;
  device?: ImportDevice;
  lastSeenAt?: string;
  enabled?: boolean;
};

export type TargetRule = { column: string; values: Record<string, ImportTarget> } | { value: ImportTarget };

export type ImportMapping = {
  externalId: string;
  id?: string;
  endpoint?: string;
  target: TargetRule;
  unsubscribed?: { column: string };
  timezone?: string;
  language?: string;
  country?: string;
  lastSeenAt?: string;
  appVersion?: string;
  osVersion?: string;
  model?: string;
  attributes?: { columns?: string[]; json?: string };
};

export type ImportPreset = {
  provider: ImportProvider;
  label: string;
  signature: string[];
  idPrefix: string;
  mapping: ImportMapping;
};

export type ImportOptions = {
  environment: ImportEnvironment;
  anonymous: AnonymousPolicy;
  unsubscribed: UnsubscribedPolicy;
  idPrefix: string;
  connectedChannels: AvailableChannel[];
};

export type ImportRecord = Record<string, string>;

export type ParsedCsv = { headers: string[]; records: ImportRecord[] };

export type MappedRow =
  | { outcome: 'row'; row: ImportRow; anonymous: boolean; profileEmail?: true }
  | { outcome: 'skipped'; reason: SkipReason; detail: string };

export type ImportPlan = {
  rows: ImportRow[];
  skipped: Array<{ index: number; reason: SkipReason; detail: string }>;
  counts: {
    records: number;
    rows: number;
    anonymous: number;
    muted: number;
    profileEmails: number;
    byTarget: Record<ImportTarget, number>;
    byChannel: Record<ImportChannel, number>;
    byReason: Record<SkipReason, number>;
  };
};
