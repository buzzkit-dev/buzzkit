import { env } from 'cloudflare:workers';
import { BuzzKit } from 'buzzkit';

let client: BuzzKit | undefined;

export function buzzkit(): BuzzKit {
  if (!client) {
    client = new BuzzKit({ apiKey: env.BUZZKIT_API_KEY, baseUrl: env.BUZZKIT_API_URL });
  }
  return client;
}
