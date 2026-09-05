import { LinkProvider } from '@buzzkit/ui/components/link';
import { Toaster } from '@buzzkit/ui/components/sonner';
import { TooltipProvider } from '@buzzkit/ui/components/tooltip';
import { MotionConfig } from 'motion/react';
import { isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import { NoAccessPage } from '@/app/components/errors/no-access';
import { NotFoundPage } from '@/app/components/errors/not-found';
import { ErrorPage } from '@/app/components/errors/unexpected';
import { BackgroundJobProvider } from '@/app/components/jobs/provider';
import { ThemeProvider } from '@/app/components/layout/theme-provider';
import type { Route } from './+types/root';
import './app.css';

export const links: Route.LinksFunction = () => [
  { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
  { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
  { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
  { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
  { rel: 'manifest', href: '/site.webmanifest' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning className='font-sans antialiased'>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1' />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (isRouteErrorResponse(error) && error.status === 403) return <NoAccessPage />;

  let title = 'Something broke';
  let details = 'Reload the page. If it keeps happening, contact support.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    title = `Error ${error.status}`;
    details = error.statusText || details;
  } else if (error instanceof Error) {
    details = error.message;
    if (import.meta.env.DEV) stack = error.stack;
  }

  return <ErrorPage title={title} details={details} stack={stack} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <LinkProvider link={Link}>
        <MotionConfig reducedMotion='user'>
          <TooltipProvider>
            <BackgroundJobProvider>
              <Outlet />
            </BackgroundJobProvider>
            <Toaster />
          </TooltipProvider>
        </MotionConfig>
      </LinkProvider>
    </ThemeProvider>
  );
}
