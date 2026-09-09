import { cn } from '@buzzkit/ui/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  titleClassName,
}: {
  title: React.ReactNode;
  description: React.ReactNode;
  actions?: React.ReactNode;
  titleClassName?: string;
}) {
  return (
    <header className='flex shrink-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4'>
      <div className='flex min-w-0 flex-col gap-0.5'>
        <h1
          className={cn(
            'text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight',
            titleClassName
          )}
        >
          {title}
        </h1>
        <p className='text-pretty text-base text-fg-2 leading-tighter'>{description}</p>
      </div>
      {actions && <div className='flex w-full shrink-0 items-center gap-2 sm:w-auto'>{actions}</div>}
    </header>
  );
}
