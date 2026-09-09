import { Button } from '@buzzkit/ui/components/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { SizeAnimator } from '@buzzkit/ui/components/size-animator';
import { cn } from '@buzzkit/ui/lib/utils';
import { Form, useNavigation } from 'react-router';
import { OnboardingProgress } from '@/app/components/onboarding/progress';
import { STEP_DURATION_MS, type StepMotion, StepTransition } from '@/app/components/onboarding/transition';

const ONBOARDING_STEPS = ['Workspace', 'Channel', 'Provider', 'Connect', 'Import'] as const;

export type OnboardingSlots = {
  title: React.ReactNode;
  description?: React.ReactNode;
  content: React.ReactNode;
  footer?: React.ReactNode;
};

function SignedInAs({ email }: { email: string }) {
  const navigation = useNavigation();
  const signingOut = navigation.formData?.get('intent') === 'sign-out';

  return (
    <div className='flex w-full min-w-0 items-center justify-between gap-2'>
      <span className='min-w-0 truncate text-fg-2 text-sm'>
        Signed in as <span className='text-fg-4'>{email}</span>
      </span>
      <Form method='post' className='-mr-2 shrink-0'>
        <input type='hidden' name='intent' value='sign-out' />
        <Button type='submit' variant='ghost' size='sm' loading={signingOut}>
          Sign out
        </Button>
      </Form>
    </div>
  );
}

export function OnboardingLayout({
  progress,
  transitionKey,
  motion,
  slots,
  email,
}: {
  progress: number[];
  transitionKey: string;
  motion: StepMotion;
  slots: OnboardingSlots;
  email: string;
}) {
  return (
    <main className='flex min-h-svh flex-col p-4 sm:p-6'>
      <header className='flex shrink-0 pb-4'>
        <SignedInAs email={email} />
      </header>
      <div className='flex flex-1 items-center justify-center'>
        <div className='flex w-full max-w-md flex-col gap-4'>
          <OnboardingProgress values={progress} labels={[...ONBOARDING_STEPS]} className='px-1' />
          <Card>
            <GuideCardBody transitionKey={transitionKey} motion={motion} slots={slots} />
          </Card>
        </div>
      </div>
    </main>
  );
}

export function GuideCardBody({
  transitionKey,
  motion,
  slots,
  Title = CardTitle,
  Description = CardDescription,
}: {
  transitionKey: string;
  motion: StepMotion;
  slots: OnboardingSlots;
  Title?: React.ComponentType<{ children: React.ReactNode }>;
  Description?: React.ComponentType<{ children: React.ReactNode }>;
}) {
  return (
    <>
      <SizeAnimator duration={STEP_DURATION_MS}>
        <OnboardingCardHeader>
          <Title>{slots.title}</Title>
          {slots.description && <Description>{slots.description}</Description>}
        </OnboardingCardHeader>
      </SizeAnimator>
      <StepTransition id={transitionKey} motion={motion}>
        {slots.content}
      </StepTransition>
      {slots.footer && <CardFooter className='relative'>{slots.footer}</CardFooter>}
    </>
  );
}

export function OnboardingCardHeader({ className, ...props }: React.ComponentProps<typeof CardHeader>) {
  return (
    <CardHeader className={cn('group-has-data-[slot=card-content]/card:pb-2.5', className)} {...props} />
  );
}
