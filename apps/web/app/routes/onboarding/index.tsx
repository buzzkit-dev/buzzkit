import { CardContent } from '@buzzkit/ui/components/card';
import { Form, redirect, useNavigation } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { OnboardingLayout } from '@/app/components/onboarding/layout';
import { WorkspaceFields } from '@/app/components/workspace/fields';
import { onboardingAction } from '@/app/lib/actions/onboarding.server';
import { listWorkspaces } from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Create a workspace · BuzzKit' }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const workspaces = await listWorkspaces({ request, env }, token);
  if (workspaces.length > 0) throw redirect('/dashboard');
  return null;
}

export const action = onboardingAction;

export default function CreateWorkspaceRoute({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== 'idle' && navigation.formMethod != null;
  return (
    <OnboardingLayout
      progress={[0.08, 0, 0, 0]}
      transitionKey='workspace'
      motion={{ direction: 1, from: 'rows', to: 'rows' }}
      slots={{
        title: 'Create a workspace',
        description: 'A workspace holds your apps, their provider keys and everyone you notify.',
        content: (
          <CardContent className='gap-4 pt-1'>
            <Form method='post'>
              <WorkspaceFields errors={actionData?.errors} pending={pending} submitLabel='Continue' />
            </Form>
          </CardContent>
        ),
      }}
    />
  );
}
