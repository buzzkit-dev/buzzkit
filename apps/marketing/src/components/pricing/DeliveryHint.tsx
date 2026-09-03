import { Icon } from '@buzzkit/ui/components/icon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';

export function DeliveryHint({ text, rows }: { text: string; rows: { action: string; count: string }[] }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className='inline-flex cursor-default text-fg-1 transition-colors duration-150 hover:text-fg-3' />
          }
          aria-label='What counts as a delivery'
        >
          <Icon name='IconCircleInfo' className='size-3.5 opacity-100' />
        </TooltipTrigger>
        <TooltipContent className='max-w-64 py-2 font-normal'>
          <span className='flex flex-col gap-2'>
            <span className='text-pretty leading-snug'>{text}</span>
            <span className='flex flex-col gap-0.5 border-background/15 border-t pt-1.5'>
              {rows.map((row) => (
                <span key={row.action} className='flex items-baseline justify-between gap-4'>
                  <span className='text-background/70'>{row.action}</span>
                  <span className='font-medium tabular-nums'>{row.count}</span>
                </span>
              ))}
            </span>
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
