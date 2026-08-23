import { Button } from '@buzzkit/ui/components/button';
import { Icon } from '@buzzkit/ui/components/icon';
import { Separator } from '@buzzkit/ui/components/separator';

export function OAuthProviders({
  github,
  onGithub,
  pending,
}: {
  github: boolean;
  onGithub: () => void;
  pending?: boolean;
}) {
  if (!github) return null;
  return (
    <div className='flex flex-col gap-4'>
      <Button type='button' variant='elevated' className='w-full' disabled={pending} onClick={onGithub}>
        <Icon name='IconGithub' className='opacity-100' />
        Continue with GitHub
      </Button>
      <div className='flex items-center gap-3'>
        <Separator className='flex-1' />
        <span className='text-fg-2 text-xs'>or</span>
        <Separator className='flex-1' />
      </div>
    </div>
  );
}
