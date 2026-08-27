import type { WebhookVerificationCode } from './types';

export class WebhookVerificationError extends Error {
  constructor(
    message: string,
    readonly code: WebhookVerificationCode
  ) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}
