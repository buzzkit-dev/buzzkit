import type { channel as channelEnum, tables } from '@buzzkit/database';

export type Credential = typeof tables.credential.$inferSelect;

export type CredentialProvider = Credential['provider'];

export type CredentialEnvironment = Credential['environment'];

export type CredentialChannel = Credential['channel'];

export type ValidationOutcome = {
  status: 'active' | 'unvalidated';
  lastError: string | null;
};

export type CredentialUpload = {
  provider: CredentialProvider;
  environment: CredentialEnvironment | null;
  secret: string;
  details: Record<string, string>;
};

export type ConnectedChannel = (typeof channelEnum.enumValues)[number];
