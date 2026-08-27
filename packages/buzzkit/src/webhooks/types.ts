export type WebhookHeaders = {
  'webhook-id': string;
  'webhook-timestamp': string;
  'webhook-signature': string;
};

export type HeaderSource = Record<string, string | null | undefined> | Headers;

export type VerifyOptions = {
  toleranceSeconds?: number;
  now?: number;
};

export type VerifiedWebhook = {
  id: string;
  timestamp: number;
};

export type WebhookVerificationCode =
  | 'missing_headers'
  | 'invalid_secret'
  | 'timestamp_out_of_tolerance'
  | 'invalid_signature';
