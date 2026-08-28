import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { TIME_TOOLTIP_DELAY } from '@/app/hooks/use-time-ago';

export function Recipients({ list, children }: { list: string[] | null; children: React.ReactElement }) {
  if (!list) return children;
  return (
    <TooltipProvider delay={TIME_TOOLTIP_DELAY}>
      <Tooltip>
        <TooltipTrigger render={children} />
        <TooltipContent className='max-h-64 overflow-y-auto whitespace-pre-line text-left'>
          {list.join('\n')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
