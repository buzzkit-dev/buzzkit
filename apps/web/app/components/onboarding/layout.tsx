import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { cn } from '@buzzkit/ui/lib/utils';
import { OnboardingProgress } from '@/app/components/onboarding/progress';
import { type StepMotion, StepTransition } from '@/app/components/onboarding/transition';

export const ONBOARDING_STEPS = ['Workspace', 'Channel', 'Provider', 'Connect'] as const;

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
          <OnboardingCardHeader>
            <CardTitle>{slots.title}</CardTitle>
            {slots.description && <CardDescription>{slots.description}</CardDescription>}
          </OnboardingCardHeader>
          <StepTransition id={transitionKey} motion={motion}>
            {slots.content}
          </StepTransition>
          {slots.footer && <CardFooter className='relative'>{slots.footer}</CardFooter>}
        </Card>
      </div>
    </main>
  );
}

export function OnboardingCardHeader({ className, ...props }: React.ComponentProps<typeof CardHeader>) {
  return (
    <CardHeader className={cn('group-has-data-[slot=card-content]/card:pb-2.5', className)} {...props} />
  );
}
