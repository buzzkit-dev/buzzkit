import { Button } from '@buzzkit/ui/components/button';
import { CardContent } from '@buzzkit/ui/components/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { toast } from '@buzzkit/ui/components/sonner';
import { Spinner } from '@buzzkit/ui/components/spinner';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { PasswordInput } from '@/app/components/auth/password-input';
import { OAuthProviders } from '@/app/components/auth/providers';
import { type FormErrors, useFocusFirstError } from '@/app/hooks/use-focus-first-error';
import { type AuthFailure, authClient } from '@/app/lib/auth.client';

export type AuthMode = 'login' | 'signup';
export type LoginProviders = { github: boolean };

const nameSpring = { type: 'spring', duration: 0.4, bounce: 0 } as const;
const nameHidden = { gridTemplateRows: '0fr', opacity: 0, y: 24, scale: 0.92 };
const nameShown = { gridTemplateRows: '1fr', opacity: 1, y: 0, scale: 1 };
const hintHidden = { gridTemplateRows: '0fr', opacity: 0, y: -24, scale: 0.92 };
const hintShown = { gridTemplateRows: '1fr', opacity: 1, y: 0, scale: 1 };

type AuthToast = { title: string; description?: string };
type AuthFailureResult = { fields?: Record<string, string>; toast?: AuthToast };

function failureErrors(mode: AuthMode, failure: AuthFailure): AuthFailureResult {
  if (failure?.code === 'INVALID_EMAIL') return { fields: { email: 'Enter a valid email address.' } };
  if (failure?.code === 'INVALID_EMAIL_OR_PASSWORD') {
    return {
      toast: {
        title: 'Email or password is incorrect',
        description: 'Double-check your details or create an account.',
      },
    };
  }
  if (failure?.code?.startsWith('USER_ALREADY_EXISTS')) {
    return { fields: { email: 'An account with this email already exists. Sign in instead.' } };
  }
  if (failure?.code === 'PASSWORD_TOO_SHORT')
    return { fields: { password: 'Must be at least 8 characters.' } };
  if (failure?.code === 'PASSWORD_COMPROMISED') {
    return { fields: { password: 'This password has appeared in a data breach. Choose a different one.' } };
  }
  return {
    toast: {
      title: mode === 'login' ? 'Unable to sign in' : 'Unable to create your account',
      description: failure?.message ?? 'Try again in a moment.',
    },
  };
}

export function AuthForm({
  mode,
  apiUrl,
  providers,
  redirectTo,
  error,
}: {
  mode: AuthMode;
  apiUrl: string;
  providers: LoginProviders;
  redirectTo: string;
  error: 'github' | null;
}) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const busy = submitting || redirecting;
  const [errors, setErrors] = useState<FormErrors | undefined>();
  const nameError = errors?.fields?.name;
  const emailError = errors?.fields?.email;
  const passwordError = errors?.fields?.password;
  useFocusFirstError(errors);

  useEffect(() => {
    setErrors(undefined);
    setSubmitting(false);
    setRedirecting(false);
    if (error === 'github') toast.error('GitHub sign-in did not complete', { description: 'Try again.' });
  }, [error]);

  const submit = async (form: FormData) => {
    const name = String(form.get('name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const fields: Record<string, string> = {};
    if (mode === 'signup' && !name) fields.name = 'Enter your name.';
    if (!email) fields.email = 'Enter your email.';
    if (!password) fields.password = mode === 'login' ? 'Enter your password.' : 'Enter a password.';
    else if (mode === 'signup' && password.length < 8) fields.password = 'Must be at least 8 characters.';
    if (Object.keys(fields).length > 0) return setErrors({ fields });

    setSubmitting(true);
    const { error: failure } =
      mode === 'login'
        ? await authClient(apiUrl).signIn.email({ email, password })
        : await authClient(apiUrl).signUp.email({ name, email, password });
    if (failure) {
      setSubmitting(false);
      const next = failureErrors(mode, failure);
      if (next.toast) toast.error(next.toast.title, { description: next.toast.description });
      return setErrors(next.fields ? { fields: next.fields } : undefined);
    }
    navigate(redirectTo, { replace: true });
  };

  const github = () => {
    setRedirecting(true);
    authClient(apiUrl).signIn.social({
      provider: 'github',
      callbackURL: new URL(redirectTo, window.location.origin).toString(),
      errorCallbackURL: new URL(`/${mode}?error=github`, window.location.origin).toString(),
    });
  };

  return (
    <CardContent className='gap-4 pt-1'>
      <OAuthProviders github={providers.github} onGithub={github} pending={busy} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(new FormData(event.currentTarget));
        }}
      >
        <FieldGroup className='gap-0'>
          <AnimatePresence initial={false}>
            {mode === 'signup' && (
              <motion.div
                key='name'
                className='relative z-0 grid'
                initial={nameHidden}
                animate={nameShown}
                exit={nameHidden}
                transition={nameSpring}
              >
                <div className='min-h-0'>
                  <Field className='pb-5' data-invalid={nameError ? true : undefined}>
                    <FieldLabel htmlFor='name'>Name</FieldLabel>
                    <Input
                      id='name'
                      name='name'
                      autoComplete='name'
                      maxLength={255}
                      aria-invalid={nameError ? true : undefined}
                      aria-describedby={nameError ? 'name-error' : undefined}
                    />
                    {nameError && <FieldError id='name-error'>{nameError}</FieldError>}
                  </Field>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className='relative z-10 flex flex-col gap-5 bg-card'>
            <Field data-invalid={emailError ? true : undefined}>
              <FieldLabel htmlFor='email'>Email</FieldLabel>
              <Input
                id='email'
                name='email'
                type='email'
                autoComplete='email'
                required
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? 'email-error' : undefined}
              />
              {emailError && <FieldError id='email-error'>{emailError}</FieldError>}
            </Field>
            <Field data-invalid={passwordError ? true : undefined}>
              <FieldLabel htmlFor='password'>Password</FieldLabel>
              <PasswordInput
                id='password'
                name='password'
                wrapperClassName='relative z-10'
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'signup' ? 8 : undefined}
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={
                  passwordError ? 'password-error' : mode === 'signup' ? 'password-description' : undefined
                }
              />
              {passwordError && <FieldError id='password-error'>{passwordError}</FieldError>}
              <AnimatePresence initial={false}>
                {!passwordError && mode === 'signup' && (
                  <motion.div
                    key='hint'
                    className='-mt-2 relative z-0 grid'
                    initial={hintHidden}
                    animate={hintShown}
                    exit={hintHidden}
                    transition={nameSpring}
                  >
                    <div className='min-h-0'>
                      <FieldDescription id='password-description' className='pt-2'>
                        Must be at least 8 characters.
                      </FieldDescription>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Field>
            <Button type='submit' className='w-full' disabled={busy}>
              {submitting && <Spinner aria-label={mode === 'login' ? 'Signing in' : 'Creating account'} />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </CardContent>
  );
}
