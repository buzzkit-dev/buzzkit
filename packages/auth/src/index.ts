import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { type DB, drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, haveIBeenPwned, openAPI } from 'better-auth/plugins';
import { COOKIE_PREFIX, sharedCookieDomain } from './cookies';

interface Env {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  DASHBOARD_URL: string;
  ENVIRONMENT: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

export function githubAuthEnabled(
  env: Pick<Env, 'ENVIRONMENT' | 'GITHUB_CLIENT_ID' | 'GITHUB_CLIENT_SECRET'>
): boolean {
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

export const createBetterAuth = ({
  db,
  env,
  schema,
}: {
  db: DB;
  env: Env;
  schema: Record<string, unknown>;
}) => {
  return betterAuth({
    ...createBetterAuthConfig(env),
    database: drizzleAdapter(db, { provider: 'pg', schema }),
  });
};

export function createBetterAuthConfig(env: Env) {
  return {
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/',
    trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin, env.DASHBOARD_URL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    socialProviders: githubAuthEnabled(env)
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID as string,
            clientSecret: env.GITHUB_CLIENT_SECRET as string,
          },
        }
      : {},
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      disableCSRFCheck: env.ENVIRONMENT === 'development',
      ...(() => {
        const domain = sharedCookieDomain(env.BETTER_AUTH_URL, env.DASHBOARD_URL);
        return domain ? { crossSubDomainCookies: { enabled: true, domain } } : {};
      })(),
    },
    secret: env.BETTER_AUTH_SECRET,
    plugins: [
      bearer(),
      haveIBeenPwned(),
      openAPI({
        path: '/reference',
        disableDefaultReference: env.ENVIRONMENT !== 'development',
      }),
    ],
  } satisfies BetterAuthOptions;
}
