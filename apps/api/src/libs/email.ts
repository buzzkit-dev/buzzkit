import { env } from 'cloudflare:workers';
import { trace } from './telemetry';

export async function sendTextEmail(input: { to: string; subject: string; text: string }): Promise<boolean> {
  return await trace('email.send', async (t) => {
    t.set('email.subject', input.subject);
    try {
      await env.EMAIL.send({
        to: input.to,
        from: { email: env.EMAIL_FROM, name: 'buzzkit' },
        subject: input.subject,
        text: input.text,
      });
      return true;
    } catch (error) {
      t.set('email.error', error instanceof Error ? error.message : String(error));
      return false;
    }
  });
}
