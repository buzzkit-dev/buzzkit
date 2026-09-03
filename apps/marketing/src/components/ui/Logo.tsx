import { logo } from '../../lib/logo';

export function Logo({ className }: { className?: string }) {
  return <img src={logo.src} alt='' className={`${logo.className} ${className ?? ''}`} />;
}
