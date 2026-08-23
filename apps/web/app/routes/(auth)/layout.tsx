import { Button } from '@buzzkit/ui/components/button';
import { Card, CardDescription, CardFooter, CardTitle } from '@buzzkit/ui/components/card';
import { Link, Outlet, useLocation, useMatches } from 'react-router';
import { AuthForm, type AuthMode, type LoginProviders } from '@/app/components/auth/form';
import { OnboardingCardHeader } from '@/app/components/onboarding/layout';

export type AuthHandle = {
  auth: {
    mode: AuthMode;
    title: string;
    description: string;
    footer?: { text: string; label: string; to: string };
  };
};

function isAuthHandle(handle: unknown): handle is AuthHandle {
  return typeof handle === 'object' && handle !== null && 'auth' in handle;
}

export default function AuthLayout() {
  const { search } = useLocation();
  const match = [...useMatches()].reverse().find((entry) => isAuthHandle(entry.handle));
  const auth = match && isAuthHandle(match.handle) ? match.handle.auth : null;
  const data = match?.loaderData as
    | { apiUrl: string; providers: LoginProviders; redirectTo: string; error: 'github' | null }
    | undefined;

  if (!auth || !data) return <Outlet />;

  return (
    <main className='flex min-h-svh items-center justify-center p-6'>
      <Card className='max-w-md'>
        <OnboardingCardHeader>
          <CardTitle>
            <h1>{auth.title}</h1>
          </CardTitle>
          <CardDescription>{auth.description}</CardDescription>
        </OnboardingCardHeader>
        <AuthForm
          mode={auth.mode}
          apiUrl={data.apiUrl}
          providers={data.providers}
          redirectTo={data.redirectTo}
          error={data.error}
        />
        {auth.footer && (
          <CardFooter className='justify-start gap-1 text-fg-2 text-sm'>
            {auth.footer.text}
            <Button
              variant='link'
              nativeButton={false}
              render={<Link to={{ pathname: auth.footer.to, search }} />}
            >
              {auth.footer.label}
            </Button>
          </CardFooter>
        )}
      </Card>
    </main>
  );
}
