import { Button } from '@buzzkit/ui/components/button';
import { Icon } from '@buzzkit/ui/components/icon';
import { Input } from '@buzzkit/ui/components/input';
import { cn } from '@buzzkit/ui/lib/utils';
import { useState } from 'react';

export function PasswordInput({
  className,
  wrapperClassName,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'type'> & { wrapperClassName?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn('relative', wrapperClassName)}>
      <Input type={visible ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
      <Button
        type='button'
        variant='ghost'
        size='icon-xs'
        className='absolute top-1/2 right-1 -translate-y-1/2'
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <Icon name='IconEyeClosed' className='size-4 text-fg-2' />
        ) : (
          <Icon name='IconEyeOpen' className='size-4 text-fg-2' />
        )}
      </Button>
    </div>
  );
}
