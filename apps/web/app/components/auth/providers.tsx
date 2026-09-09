import { Button } from '@buzzkit/ui/components/button';
import { Separator } from '@buzzkit/ui/components/separator';

export function OAuthProviders({
  github,
  onGithub,
  disabled,
  loading,
}: {
  github: boolean;
  onGithub: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  if (!github) return null;
  return (
    <div className='flex flex-col gap-4'>
      <Button
        type='button'
        variant='elevated'
        className='w-full'
        icon={{ name: 'IconGithub', className: 'opacity-100' }}
        disabled={disabled}
        loading={loading}
        onClick={onGithub}
      >
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
