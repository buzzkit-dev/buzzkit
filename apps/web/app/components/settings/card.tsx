import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@buzzkit/ui/components/card';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import type { IconName } from '@buzzkit/ui/components/icon';

export function SettingsCard({
  title,
  description,
  footer,
  action,
  headerAction,
  children,
  className,
}: {
  title: string;
  description: string;
  footer?: React.ReactNode;
  action?: React.ReactNode;
  headerAction?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {headerAction && <CardAction>{headerAction}</CardAction>}
      </CardHeader>
      {children && <CardContent className={className}>{children}</CardContent>}
      {(footer || action) && (
        <CardFooter>
          <span className='text-pretty text-fg-2 text-xs'>{footer}</span>
          {action}
        </CardFooter>
      )}
    </Card>
  );
}

export function SettingsRows({ children }: { children: React.ReactNode }) {
  return <ul className='-mx-4 -mb-2 flex flex-col divide-y divide-bg-3'>{children}</ul>;
}

export function SettingsRow({
  start,
  title,
  subtitle,
  end,
}: {
  start?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  end?: React.ReactNode;
}) {
  return (
    <li className='flex min-h-11 items-center gap-3 px-4 py-2'>
      {start}
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='truncate font-medium text-fg-4 text-sm'>{title}</span>
        {subtitle && <span className='truncate text-fg-2 text-xs'>{subtitle}</span>}
      </span>
      {end && <span className='flex shrink-0 items-center gap-3'>{end}</span>}
    </li>
  );
}

export function SettingsEmpty(props: { icon: IconName; title: string; description?: string }) {
  return <EmptyState {...props} />;
}
