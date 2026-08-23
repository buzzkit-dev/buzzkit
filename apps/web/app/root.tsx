import { Toaster } from '@buzzkit/ui/components/sonner';
import { TooltipProvider } from '@buzzkit/ui/components/tooltip';
import { MotionConfig } from 'motion/react';
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import { ThemeProvider } from '@/app/components/layout/theme-provider';
import { ErrorPage } from '@/app/components/system/error';
import { NoAccessPage } from '@/app/components/system/no-access';
import { NotFoundPage } from '@/app/components/system/not-found';
import type { Route } from './+types/root';
import './app.css';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning className='antialiased font-sans'>
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

export default function App() {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion='user'>
        <TooltipProvider>
          <Outlet />
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
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
