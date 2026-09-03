import { PastelAvatar } from '@buzzkit/ui/components/pastel-avatar';

export type Artifact =
  | { id: string; kind: 'banner'; app: string; title: string; body: string; when: string }
  | { id: string; kind: 'actions'; app: string; title: string; body: string; actions: [string, string] }
  | { id: string; kind: 'activity'; app: string; title: string; detail: string; progress: number };

export function ArtifactCard({ artifact }: { artifact: Artifact }) {
  if (artifact.kind === 'activity') {
    return (
      <div className='selection-inverse flex w-72 flex-col gap-3 rounded-[22px] bg-fg-4 p-3.5 text-background shadow-3'>
        <div className='flex items-center gap-3'>
          <PastelAvatar seed={artifact.app} size={36} className='rounded-[10px] corner-superellipse/1.125' />
          <span className='flex min-w-0 flex-col'>
            <span className='truncate font-medium text-sm'>{artifact.title}</span>
            <span className='truncate text-background/60 text-xs'>{artifact.detail}</span>
          </span>
          <span className='ml-auto text-background/60 text-xs'>{artifact.app}</span>
        </div>
        <div className='h-1.5 w-full overflow-hidden rounded-full bg-background/15'>
          <div
            className='h-full rounded-full bg-background/90'
            style={{ width: `${artifact.progress * 100}%` }}
          />
        </div>
      </div>
    );
  }
  return (
    <div className='flex w-72 flex-col gap-2.5 rounded-[22px] bg-bg-1 p-3 shadow-3'>
      <div className='flex items-start gap-3'>
        <PastelAvatar seed={artifact.app} size={38} className='rounded-[11px] corner-superellipse/1.125' />
        <span className='flex min-w-0 flex-1 flex-col gap-px'>
          <span className='flex items-baseline justify-between gap-2'>
            <span className='truncate font-medium text-fg-4 text-sm'>{artifact.title}</span>
            {artifact.kind === 'banner' && (
              <span className='shrink-0 text-fg-1 text-xs'>{artifact.when}</span>
            )}
          </span>
          <span className='truncate text-fg-2 text-sm'>{artifact.body}</span>
        </span>
      </div>
      {artifact.kind === 'actions' && (
        <div className='flex gap-2'>
          {artifact.actions.map((action) => (
            <span
              key={action}
              className='flex h-7 flex-1 items-center justify-center rounded-[10px] bg-bg-2 font-medium text-fg-3 text-xs'
            >
              {action}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
