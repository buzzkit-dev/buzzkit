import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { SizeAnimator } from '@buzzkit/ui/components/size-animator';
import { cn } from '@buzzkit/ui/lib/utils';
import { OnboardingProgress } from '@/app/components/onboarding/progress';
import { STEP_DURATION_MS, type StepMotion, StepTransition } from '@/app/components/onboarding/transition';

const ONBOARDING_STEPS = ['Workspace', 'Channel', 'Provider', 'Connect', 'Import'] as const;

export type OnboardingSlots = {
  title: React.ReactNode;
  description?: React.ReactNode;
  content: React.ReactNode;
  footer?: React.ReactNode;
};

export function OnboardingLayout({
  progress,
  transitionKey,
  motion,
  slots,
}: {
  progress: number[];
  transitionKey: string;
  motion: StepMotion;
  slots: OnboardingSlots;
}) {
  return (
    <main className='flex min-h-svh items-center justify-center p-6'>
      <div className='flex w-full max-w-md flex-col gap-4'>
        <OnboardingProgress values={progress} labels={[...ONBOARDING_STEPS]} className='px-1' />
        <Card>
          <GuideCardBody transitionKey={transitionKey} motion={motion} slots={slots} />
        </Card>
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
