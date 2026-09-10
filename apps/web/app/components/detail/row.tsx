import { CopyButton } from '@/app/components/copy/button';

export function DetailRow({
  label,
  copy,
  children,
}: {
  label: string;
  copy?: string;
  children: React.ReactNode;
}) {
  return (
    <div className='flex min-h-10 items-center gap-6 border-bg-3 border-b px-4 last:border-b-0'>
      <dt className='w-28 shrink-0 text-fg-2 text-sm sm:w-36'>{label}</dt>
      <dd className='flex min-w-0 flex-1 items-center text-fg-4 text-sm'>
        {copy ? (
          <CopyButton value={copy} label={`Copy ${label.toLowerCase()}`}>
            {children}
          </CopyButton>
        ) : (
          <span className='flex min-w-0 items-center gap-1.5'>{children}</span>
        )}
      </dd>
    </div>
  );
}
