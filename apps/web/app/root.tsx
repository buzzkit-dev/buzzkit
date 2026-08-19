import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
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
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
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

  return (
    <main className='flex min-h-svh flex-col items-center justify-center gap-2 p-8'>
      <h1 className='font-semibold text-lg'>{title}</h1>
      <p className='text-neutral-500 text-sm'>{details}</p>
      {stack && (
        <pre className='max-w-full overflow-x-auto rounded-md bg-neutral-100 p-4 text-xs'>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
