import type { Route } from './+types/index';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'buzzkit' }, { name: 'description', content: 'Code-first push notification framework.' }];
}

export default function Index() {
  return (
    <main className='flex min-h-svh flex-col items-center justify-center gap-2'>
      <h1 className='font-semibold text-2xl'>buzzkit</h1>
      <p className='text-neutral-500 text-sm'>Code-first push notification framework.</p>
    </main>
  );
}
