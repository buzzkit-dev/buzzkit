import { env } from 'cloudflare:workers';
import { describeError } from './error';
import { trace } from './telemetry';

export async function sendTextEmail(input: { to: string; subject: string; text: string }): Promise<boolean> {
  return await trace('email.send', async (t) => {
    t.set('email.subject', input.subject);
    try {
      await env.EMAIL.send({
        to: input.to,
        from: { email: 'mail@tm.buzzkit.dev', name: 'BuzzKit' },
        subject: input.subject,
        text: input.text,
      });
      return true;
    } catch (error) {
      t.set('email.error', describeError(error));
      return false;
    }
  });
}
