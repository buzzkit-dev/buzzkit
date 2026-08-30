import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@buzzkit/ui/components/alert-dialog';
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarImage } from '@buzzkit/ui/components/avatar';
import { Badge } from '@buzzkit/ui/components/badge';
import { Button } from '@buzzkit/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@buzzkit/ui/components/card';
import { Area, AreaChart } from '@buzzkit/ui/components/charts/area-chart';
import { Checkbox } from '@buzzkit/ui/components/checkbox';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem } from '@buzzkit/ui/components/combobox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@buzzkit/ui/components/dialog';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@buzzkit/ui/components/drawer';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from '@buzzkit/ui/components/field';
import {
  FilterBar,
  FilterClear,
  FilterRange,
  FilterSearch,
  FilterSelect,
} from '@buzzkit/ui/components/filter-bar';
import { GuideStep } from '@buzzkit/ui/components/guide-step';
import { useAnimatedIndicator } from '@buzzkit/ui/components/highlight-list';
import { ICON_NAMES, Icon } from '@buzzkit/ui/components/icon';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { Input } from '@buzzkit/ui/components/input';
import { Kbd, KbdGroup } from '@buzzkit/ui/components/kbd';
import { Label } from '@buzzkit/ui/components/label';
import { LivePing } from '@buzzkit/ui/components/live-ping';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { PastelAvatar } from '@buzzkit/ui/components/pastel-avatar';
import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@buzzkit/ui/components/popover';
import { RadioGroup, RadioGroupItem } from '@buzzkit/ui/components/radio-group';
import { ScopePicker } from '@buzzkit/ui/components/scope-picker';
import { ScrollArea } from '@buzzkit/ui/components/scroll-area';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@buzzkit/ui/components/select';
import { Separator } from '@buzzkit/ui/components/separator';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@buzzkit/ui/components/sheet';
import { SizeAnimator } from '@buzzkit/ui/components/size-animator';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { toast } from '@buzzkit/ui/components/sonner';
import { Spinner } from '@buzzkit/ui/components/spinner';
import { Switch } from '@buzzkit/ui/components/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableDetail,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from '@buzzkit/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@buzzkit/ui/components/tabs';
import { TextSwap } from '@buzzkit/ui/components/text-swap';
import { Textarea } from '@buzzkit/ui/components/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { cn } from '@buzzkit/ui/lib/utils';
import { Fragment, useEffect, useRef, useState } from 'react';
import { OAuthProviders } from '@/app/components/auth/providers';
import { Sidebar } from '@/app/components/layout/sidebar';
import { useTheme } from '@/app/components/layout/theme-provider';
import { ChoiceRow, ChoiceRows } from '@/app/components/onboarding/choice-row';
import { FileDrop, type LoadedFile } from '@/app/components/onboarding/file-drop';
import { apnsGuide } from '@/app/components/onboarding/guides/apns';
import { OnboardingProgress } from '@/app/components/onboarding/progress';

const SECTIONS = [
  { id: 'colors', label: 'Colors' },
  { id: 'typography', label: 'Typography' },
  { id: 'shadows', label: 'Shadows' },
  { id: 'icons', label: 'Icons' },
  { id: 'button', label: 'Button' },
  { id: 'badge', label: 'Badge' },
  { id: 'pastel-avatar', label: 'PastelAvatar' },
  { id: 'truncate', label: 'Truncate' },
  { id: 'filter-bar', label: 'FilterBar' },
  { id: 'charts', label: 'Charts' },
  { id: 'selection', label: 'Selection' },
  { id: 'input', label: 'Input & Textarea' },
  { id: 'field', label: 'Field' },
  { id: 'select', label: 'Select' },
  { id: 'combobox', label: 'Combobox' },
  { id: 'scope-picker', label: 'ScopePicker' },
  { id: 'controls', label: 'Checkbox, Radio, Switch' },
  { id: 'tabs', label: 'Tabs' },
  { id: 'pill-tabs', label: 'Pill tabs' },
  { id: 'dropdown', label: 'Dropdown menu' },
  { id: 'popover', label: 'Popover' },
  { id: 'tooltip', label: 'Tooltip' },
  { id: 'dialog', label: 'Dialog' },
  { id: 'alert-dialog', label: 'Alert dialog' },
  { id: 'sheet', label: 'Sheet' },
  { id: 'drawer', label: 'Drawer' },
  { id: 'toast', label: 'Toast' },
  { id: 'card', label: 'Card' },
  { id: 'table', label: 'Table' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'code-block', label: 'Code block' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'kbd', label: 'Kbd & Separator' },
  { id: 'loading', label: 'Loading & waiting' },
  { id: 'empty-state', label: 'Empty state' },
  { id: 'scroll', label: 'Scrolling' },
  { id: 'motion', label: 'Size animator' },
];

const DEMO_SCOPES = [
  { label: 'subscribers', wildcard: 'subscribers:*', options: ['subscribers:read', 'subscribers:write'] },
  { label: 'topics', wildcard: 'topics:*', options: ['topics:read', 'topics:write'] },
  { label: 'messages', wildcard: 'messages:*', options: ['messages:read', 'messages:send'] },
  { label: 'events', wildcard: 'events:*', options: ['events:read'] },
];

const MOCK_WORKSPACE = {
  id: 'ws_1',
  name: 'Acme',
  slug: 'acme',
  avatarUrl: null,
  role: 'owner' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const CHART_DAYS = Array.from({ length: 7 }, (_, index) => new Date(Date.UTC(2026, 7, 19 + index)));

const MOCK_TENANTS = [
  {
    id: 'tnt_default',
    name: 'Default',
    slug: 'default',
    isDefault: true,
    metadata: {},
    settings: {
      channels: { email: { enabled: true }, push: { enabled: true } },
      identity: { requireVerification: false },
    },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'tnt_acme',
    name: 'Acme Corp',
    slug: 'acme-corp',
    isDefault: false,
    metadata: {},
    settings: {
      channels: { email: { enabled: true }, push: { enabled: true } },
      identity: { requireVerification: false },
    },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
];

const MOCK_PROFILE = {
  id: 'usr_1',
  name: 'Ada Lovelace',
  email: 'ada@acme.dev',
  image: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const SURFACES = [
  { name: 'bg-1', cls: 'bg-bg-1' },
  { name: 'bg-2', cls: 'bg-bg-2' },
  { name: 'bg-3', cls: 'bg-bg-3' },
  { name: 'bg-4', cls: 'bg-bg-4' },
];
const FOREGROUNDS = [
  { name: 'fg-1', cls: 'bg-fg-1' },
  { name: 'fg-2', cls: 'bg-fg-2' },
  { name: 'fg-3', cls: 'bg-fg-3' },
  { name: 'fg-4', cls: 'bg-fg-4' },
];
const ALPHAS = [
  { name: 'bg-a1', cls: 'bg-bg-a1' },
  { name: 'bg-a2', cls: 'bg-bg-a2' },
  { name: 'bg-a3', cls: 'bg-bg-a3' },
  { name: 'bg-a4', cls: 'bg-bg-a4' },
  { name: 'fg-a1', cls: 'bg-fg-a1' },
  { name: 'fg-a2', cls: 'bg-fg-a2' },
  { name: 'fg-a3', cls: 'bg-fg-a3' },
  { name: 'fg-a4', cls: 'bg-fg-a4' },
];
const RAMPS = [
  {
    name: 'primary, an alias, currently neutral',
    steps: ['bg-primary-1', 'bg-primary-2', 'bg-primary-3', 'bg-primary-4'],
    chip: null,
  },
  {
    name: 'purple',
    steps: ['bg-purple-1', 'bg-purple-2', 'bg-purple-3', 'bg-purple-4'],
    chip: 'bg-purple-1 text-purple-text',
  },
  { name: 'sky', steps: ['bg-sky-1', 'bg-sky-2', 'bg-sky-3', 'bg-sky-4'], chip: 'bg-sky-1 text-sky-text' },
  {
    name: 'blue',
    steps: ['bg-blue-1', 'bg-blue-2', 'bg-blue-3', 'bg-blue-4'],
    chip: 'bg-blue-1 text-blue-text',
  },
  {
    name: 'green',
    steps: ['bg-green-1', 'bg-green-2', 'bg-green-3', 'bg-green-4'],
    chip: 'bg-green-1 text-green-text',
  },
  {
    name: 'amber',
    steps: ['bg-amber-1', 'bg-amber-2', 'bg-amber-3', 'bg-amber-4'],
    chip: 'bg-amber-1 text-amber-text',
  },
  {
    name: 'orange',
    steps: ['bg-orange-1', 'bg-orange-2', 'bg-orange-3', 'bg-orange-4'],
    chip: 'bg-orange-1 text-orange-text',
  },
  { name: 'red', steps: ['bg-red-1', 'bg-red-2', 'bg-red-3', 'bg-red-4'], chip: 'bg-red-1 text-red-text' },
  {
    name: 'pink',
    steps: ['bg-pink-1', 'bg-pink-2', 'bg-pink-3', 'bg-pink-4'],
    chip: 'bg-pink-1 text-pink-text',
  },
  {
    name: 'yellow',
    steps: ['bg-yellow-1', 'bg-yellow-2', 'bg-yellow-3', 'bg-yellow-4'],
    chip: 'bg-yellow-1 text-yellow-text',
  },
];
const SHADOWS = ['shadow-1', 'shadow-2', 'shadow-3', 'shadow-4'];
const BADGE_VARIANTS = [
  'default',
  'purple',
  'sky',
  'blue',
  'green',
  'amber',
  'orange',
  'red',
  'pink',
  'solid',
] as const;

const EVENT_NAMES = [
  'workout.completed',
  'order.completed',
  'order.shipped',
  'cart.item_added',
  'checkout.started',
  '$app.opened',
  '$notification.opened',
];

const STATUS_ITEMS = [
  { label: 'Queued', value: 'queued', icon: 'IconInboxEmpty' },
  { label: 'Processing', value: 'processing', icon: 'IconBell' },
  { label: 'Completed', value: 'completed', icon: 'IconCheckCircle2' },
] as const;

const CHANNEL_ITEMS = [
  { label: 'Push', value: 'push' },
  { label: 'Email', value: 'email' },
  { label: 'SMS', value: 'sms' },
];

const ACTIVITY_ROWS = Array.from({ length: 12 }, (_, i) => ({
  id: `activity-${i + 1}`,
  initial: String.fromCharCode(97 + i),
  title: `Delivery ${i + 1}`,
}));
const SCROLL_ROWS = Array.from({ length: 16 }, (_, i) => ({
  id: `row-${i + 1}`,
  label: `Message #${i + 1}`,
}));
const FADE_ROWS = Array.from({ length: 16 }, (_, i) => ({
  id: `fade-${i + 1}`,
  label: `Plain container #${i + 1}`,
}));

export function meta() {
  return [{ title: 'Design System · BuzzKit' }];
}

function SectionNav() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [activeId, setActiveId] = useState(SECTIONS[0]?.id ?? '');
  const rootRef = useRef<HTMLElement>(null);
  const indicatorRef = useAnimatedIndicator(rootRef);

  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const current = SECTIONS.find((s) => visible.has(s.id));
        if (current) setActiveId(current.id);
      },
      { rootMargin: '0px 0px -55% 0px' }
    );
    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      ref={rootRef}
      className='sticky top-8 isolate hidden h-fit w-44 shrink-0 flex-col gap-0.5 lg:flex'
      onPointerLeave={() => setHovered(null)}
    >
      <div
        ref={indicatorRef}
        aria-hidden
        className='pointer-events-none absolute top-0 left-0 -z-10 rounded-lg bg-bg-a2 opacity-0'
        style={{ willChange: 'transform, opacity', contain: 'layout paint', transformOrigin: 'center' }}
      />
      {SECTIONS.map((s) => {
        const active = activeId === s.id;
        const highlighted = hovered ? hovered === s.id : active;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={active ? 'true' : undefined}
            data-highlighted={highlighted ? '' : undefined}
            onPointerEnter={() => setHovered(s.id)}
            className={cn(
              'rounded-lg px-2 py-1 font-medium text-sm transition-colors duration-200 data-indicator-here:text-fg-4',
              active ? 'text-fg-4' : 'text-fg-2'
            )}
          >
            {s.label}
          </a>
        );
      })}
    </nav>
  );
}

function TableDemo() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = [
    ['Production backend', 'bk_ws_QkqhGT…clVF', 'Workspace', 'blue', 'Aug 24, 2026'],
    ['Acme server', 'bk_tn_tbaAGQ…28cw', 'Tenant', 'purple', 'Aug 24, 2026'],
    ['iOS app', 'bk_pk_vQub1z…msXq', 'Client', 'green', 'Never'],
  ];
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Last used</TableHead>
            <TableHead className='w-12' />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([name = '', key, type, tone, used]) => (
            <Fragment key={name}>
              <TableRow
                onClick={() => setExpanded((current) => (current === name ? null : name))}
                aria-expanded={expanded === name}
                className='cursor-pointer hover:bg-bg-a1 [&_*]:cursor-pointer'
              >
                <TableCell className='font-medium text-fg-4'>{name}</TableCell>
                <TableCell className='font-mono text-xs'>{key}</TableCell>
                <TableCell>
                  <Badge size='sm' variant={tone as 'blue' | 'purple' | 'green'}>
                    {type}
                  </Badge>
                </TableCell>
                <TableCell>{used === 'Never' ? <span className='text-fg-2'>Never</span> : used}</TableCell>
                <TableCell className='w-0 pr-4 text-right'>
                  <Icon
                    name='IconChevronDownMedium'
                    className={cn(
                      'size-4 transition-transform duration-150',
                      expanded === name && 'rotate-180'
                    )}
                  />
                </TableCell>
              </TableRow>
              <TableDetail open={expanded === name} colSpan={5}>
                <div className='flex flex-col gap-1.5 px-4 py-3'>
                  <span className='text-fg-2 text-sm'>Scopes</span>
                  <span className='font-mono text-xs'>
                    subscribers:read · subscribers:write · messages:write
                  </span>
                </div>
              </TableDetail>
            </Fragment>
          ))}
        </TableBody>
        <TablePagination page={2} pageCount={3} total={131} previous='#table' next='#table' />
      </Table>
    </Card>
  );
}

function ScopePickerDemo() {
  const [selected, setSelected] = useState<string[]>(['subscribers:*', 'messages:read']);
  return (
    <div className='flex w-full max-w-sm flex-col gap-3'>
      <ScopePicker groups={DEMO_SCOPES} selected={selected} onChange={setSelected} />
      <span className='font-mono text-fg-2 text-xs'>{selected.join(' ') || 'nothing selected'}</span>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className='flex scroll-mt-8 flex-col gap-4'>
      <div className='flex flex-col'>
        <h2 className='font-medium text-fg-4 text-lg'>{title}</h2>
        {description && <p className='max-w-xl text-fg-2 text-sm'>{description}</p>}
      </div>
      <div className={cn('flex flex-wrap items-center gap-3', className)}>{children}</div>
    </section>
  );
}

function PillTabsDemo({
  variant,
  itemClassName,
  values,
}: {
  variant: 'primary' | 'soft';
  itemClassName: string;
  values: string[];
}) {
  const [value, setValue] = useState(values[0] ?? null);
  return (
    <PillTabs
      variant={variant}
      itemClassName={itemClassName}
      gapClassName='gap-1.5'
      items={values.map((entry) => ({ value: entry, label: entry }))}
      value={value}
      onValueChange={setValue}
    />
  );
}

function Specimen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex w-full flex-col items-start gap-2'>
      <span className='text-fg-2 text-xs'>{label}</span>
      <div className='flex w-full flex-wrap items-center gap-3'>{children}</div>
    </div>
  );
}

function FileDropDemo() {
  const [file, setFile] = useState<LoadedFile | null>(null);
  return (
    <div className='w-full max-w-md'>
      <FileDrop
        label='APNs key file'
        accept='.p8'
        prompt='Drop your AuthKey_XXXXXXXXXX.p8 here'
        hint='Or click to choose it.'
        value={file}
        summary={file ? 'PKCS #8 private key' : null}
        onChange={setFile}
      />
    </div>
  );
}

function ProgressDemo() {
  const [current, setCurrent] = useState(1);
  return (
    <div className='flex w-full max-w-md flex-col items-start gap-3'>
      <OnboardingProgress
        className='w-full'
        labels={['Workspace', 'Channel', 'Provider', 'Connect']}
        values={[0, 1, 2, 3].map((index) => (index < current ? 1 : index === current ? 0.08 : 0))}
      />
      <div className='flex gap-2'>
        <Button variant='elevated' size='sm' onClick={() => setCurrent((c) => Math.max(0, c - 1))}>
          Back
        </Button>
        <Button variant='elevated' size='sm' onClick={() => setCurrent((c) => Math.min(3, c + 1))}>
          Next
        </Button>
      </div>
    </div>
  );
}

function StepCounterDemo() {
  const [step, setStep] = useState(1);
  return (
    <div className='flex items-center gap-3'>
      <Button size='xs' variant='ghost' onClick={() => setStep(Math.max(1, step - 1))}>
        Back
      </Button>
      <NumberFlow className='text-fg-2 text-xs tabular-nums' value={step} suffix=' of 3' />
      <Button size='xs' onClick={() => setStep(Math.min(3, step + 1))}>
        Next
      </Button>
    </div>
  );
}

function TextSwapDemo() {
  const [index, setIndex] = useState(0);
  const labels = ['Next', 'Connect Apple', 'Checking'];
  return (
    <Button size='xs' onClick={() => setIndex((index + 1) % labels.length)}>
      <TextSwap>{labels[index] ?? 'Next'}</TextSwap>
    </Button>
  );
}

function IllustrationDemo() {
  const [index, setIndex] = useState(0);
  const step = apnsGuide.steps[index]!;
  return (
    <div className='flex w-full max-w-2xl flex-col gap-3'>
      <div className='corner-superellipse/1.125 w-full max-w-[25rem] rounded-xl bg-bg-2 p-3'>
        <step.illustration />
      </div>
      <PillTabs
        variant='soft'
        itemClassName='h-6.5 px-2.5 text-xs'
        items={apnsGuide.steps.map((_step, i) => ({ value: String(i), label: `${i + 1}` }))}
        value={String(index)}
        onValueChange={(value) => setIndex(Number(value))}
      />
    </div>
  );
}

function ModeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant='elevated' size='icon' aria-label='Toggle theme' />}>
        <Icon name='IconSun' className='size-4 dark:hidden' />
        <Icon name='IconMoon' className='hidden size-4 dark:block' />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-32'>
        <DropdownMenuGroup>
          <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as typeof theme)}>
            <DropdownMenuRadioItem value='light'>Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value='dark'>Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value='system'>System</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function DesignSystem() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className='mx-auto flex w-full max-w-6xl gap-10 px-5 pt-10 pb-24'>
      <a
        href='#content'
        className='corner-superellipse/1.125 sr-only z-50 rounded-xl bg-primary px-3 py-2 font-medium text-primary-foreground text-sm focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4'
      >
        Skip to content
      </a>
      <SectionNav />

      <main id='content' className='flex min-w-0 flex-1 flex-col gap-12'>
        <header className='flex items-start justify-between gap-4'>
          <div className='flex flex-col gap-1'>
            <span className='flex h-6 w-fit items-center rounded-full bg-bg-a1 px-2 font-medium text-fg-2 text-sm'>
              @buzzkit/ui
            </span>
            <h1 className='font-medium text-2xl text-fg-4 tracking-tight'>Design system</h1>
            <p className='max-w-lg text-fg-2 text-sm'>
              Every token, component and state. This page is the visual counterpart to{' '}
              <span className='text-fg-3 text-xs'>docs/design.md</span>. If something is in the library, it is
              on this page.
            </p>
          </div>
          <ModeToggle />
        </header>

        <Section
          id='colors'
          title='Colors'
          description='Neutral surfaces and foregrounds carry the whole UI; accent ramps carry meaning. Alpha variants layer on unknown or colored backgrounds.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='surfaces · bg-1 → bg-4'>
            {SURFACES.map((t) => (
              <div key={t.name} className='flex flex-col items-center gap-1.5'>
                <div className={cn('corner-superellipse/1.125 size-12 rounded-xl shadow-1', t.cls)} />
                <span className='text-fg-2 text-xs'>{t.name}</span>
              </div>
            ))}
          </Specimen>
          <Specimen label='foregrounds · fg-1 → fg-4'>
            {FOREGROUNDS.map((t) => (
              <div key={t.name} className='flex flex-col items-center gap-1.5'>
                <div className={cn('corner-superellipse/1.125 size-12 rounded-xl', t.cls)} />
                <span className='text-fg-2 text-xs'>{t.name}</span>
              </div>
            ))}
          </Specimen>
          <Specimen label='alpha · translucent, so the surface underneath shows through'>
            {ALPHAS.map((t) => (
              <div key={t.name} className='flex flex-col items-center gap-1.5'>
                <div className='corner-superellipse/1.125 flex size-12 overflow-hidden rounded-xl'>
                  <div className='flex-1 bg-bg-1' />
                  <div className='flex-1 bg-bg-4' />
                  <div className='flex-1 bg-purple-4' />
                  <div className={cn('-ml-12 w-12', t.cls)} />
                </div>
                <span className='text-fg-2 text-xs'>{t.name}</span>
              </div>
            ))}
          </Specimen>
          <Specimen label='ramps · 1 (tint) → 4 (solid), plus the -text step shown doing its one job'>
            <div className='flex flex-col gap-2'>
              {RAMPS.map((ramp) => (
                <div key={ramp.name} className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                  {ramp.steps.map((step) => (
                    <div key={step} className={cn('corner-superellipse/1.125 size-9 rounded-lg', step)} />
                  ))}
                  {ramp.chip ? (
                    <span
                      className={cn(
                        'ml-1 inline-flex h-6 shrink-0 items-center rounded-full px-2.5 font-medium text-sm',
                        ramp.chip
                      )}
                    >
                      Aa text
                    </span>
                  ) : null}
                  <span className='text-fg-2 text-xs'>{ramp.name}</span>
                </div>
              ))}
            </div>
          </Specimen>
        </Section>

        <Section
          id='typography'
          title='Typography'
          description='Open Runde. font-medium is the only weight in the UI; the fg ramp does all hierarchy.'
          className='flex-col items-start gap-2'
        >
          <p className='font-medium text-2xl text-fg-4 tracking-tight'>Page title, 2xl · fg-4</p>
          <p className='font-medium text-fg-4 text-xl leading-tighter'>Dialog title, xl · fg-4</p>
          <p className='font-medium text-fg-4'>Section heading, base · fg-4</p>
          <p className='text-fg-3'>Body text, base · fg-3 (the inherited default)</p>
          <p className='text-fg-2 text-sm'>Secondary label, sm · fg-2</p>
          <p className='text-fg-2 text-xs'>Caption, xs · fg-2</p>
          <p className='text-fg-1 text-xs'>Decorative only, never text, xs · fg-1</p>
        </Section>

        <Section
          id='shadows'
          title='Shadows'
          description='Every shadow ends in a hairline ring, which is what replaces borders. In dark mode the ring flips inside and uses bg-3, the same color as every divider.'
        >
          {SHADOWS.map((s) => (
            <div
              key={s}
              className={cn(
                'corner-superellipse/1.125 flex h-20 w-28 items-center justify-center rounded-2xl bg-background text-fg-2 text-xs dark:bg-bg-2',
                s
              )}
            >
              {s}
            </div>
          ))}
        </Section>

        <Section
          id='icons'
          title='Icons'
          description='Central Icons only. Paths are generated from the icon names referenced across the codebase, so every icon currently in the bundle is shown here.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='sizes'>
            <Icon name='IconBell' className='size-3.5 text-fg-3' />
            <Icon name='IconBell' className='size-4 text-fg-3' />
            <Icon name='IconBell' className='size-5 text-fg-3' />
            <Icon name='IconBell' className='size-6 text-fg-3' />
          </Specimen>
          <Specimen label='corner radius · 0 → 3'>
            <Icon name='IconArchive' radius='0' className='size-6 text-fg-3' />
            <Icon name='IconArchive' radius='1' className='size-6 text-fg-3' />
            <Icon name='IconArchive' radius='2' className='size-6 text-fg-3' />
            <Icon name='IconArchive' radius='3' className='size-6 text-fg-3' />
          </Specimen>
          <Specimen label='tiles · sm · default · lg, the glyph-on-a-surface used in rows, headers and empty states'>
            <IconTile icon='IconBellFilled' size='sm' />
            <IconTile icon='IconBellFilled' />
            <IconTile icon='IconBellFilled' size='lg' />
          </Specimen>
          <Specimen label='tile tones · icon at 85%, fill at 15%, ring at 25% of the ramp'>
            <IconTile icon='IconCheckmark1' tone='green' />
            <IconTile icon='IconExclamationTriangle' tone='red' />
            <IconTile icon='IconBellFilled' tone='amber' />
            <IconTile icon='IconBellFilled' tone='sky' />
            <IconTile icon='IconBellFilled' tone='blue' />
            <IconTile icon='IconBellFilled' tone='purple' />
            <IconTile icon='IconBellFilled' tone='orange' />
            <IconTile icon='IconBellFilled' tone='pink' />
            <IconTile icon='IconBellFilled' tone='yellow' />
          </Specimen>
          <Specimen label={`bundled · ${ICON_NAMES.length} icons`}>
            <div className='grid w-full grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-3'>
              {ICON_NAMES.map((name) => (
                <div key={name} className='flex flex-col items-center gap-1.5'>
                  <IconTile icon={name} />
                  <span className='w-full truncate text-center text-fg-2 text-xs'>
                    {name.replace('Icon', '')}
                  </span>
                </div>
              ))}
            </div>
          </Specimen>
        </Section>

        <Section
          id='button'
          title='Button'
          description='Pressing scales only the background; the label never moves. Disabled buttons are fully inert.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='variants'>
            <Button>Primary</Button>
            <Button variant='elevated'>Elevated</Button>
            <Button variant='soft'>Soft</Button>
            <Button variant='ghost'>Ghost</Button>
            <Button variant='destructive'>Destructive</Button>
            <Button variant='link'>Link</Button>
          </Specimen>
          <Specimen label='sizes · xs · sm · default · lg'>
            <Button size='xs'>Extra small</Button>
            <Button size='sm'>Small</Button>
            <Button size='default'>Default</Button>
            <Button size='lg'>Large</Button>
          </Specimen>
          <Specimen label='icon-only · one per size'>
            <Button size='icon-xs' icon='IconPlusMedium' aria-label='Add' />
            <Button size='icon-sm' icon='IconBell' aria-label='Notify' />
            <Button size='icon' variant='elevated' icon='IconFiles' aria-label='Copy' />
            <Button size='icon-lg' variant='soft' icon='IconSettingsGear1' aria-label='Settings' />
          </Specimen>
          <Specimen label='loading · the spinner takes the icon’s place, the label stays, the button disables itself'>
            <Button loading>Create key</Button>
            <Button loading icon='IconPlusMedium'>
              Create key
            </Button>
            <Button
              loading
              variant='elevated'
              icon={{ name: 'IconChevronRightMedium', position: 'inline-end' }}
            >
              Next
            </Button>
          </Specimen>
          <Specimen label='icon prop · leading and trailing'>
            <Button icon='IconPlusMedium'>New tenant</Button>
            <Button variant='elevated' icon='IconSend'>
              Send test
            </Button>
            <Button variant='elevated' icon={{ name: 'IconChevronDownMedium', position: 'inline-end' }}>
              Filter
            </Button>
            <Button variant='soft' size='sm' icon='IconKey1'>
              Key
            </Button>
          </Specimen>
          <Specimen label='disabled'>
            <Button disabled>Primary</Button>
            <Button variant='elevated' disabled>
              Elevated
            </Button>
            <Button variant='soft' disabled>
              Soft
            </Button>
            <Button variant='destructive' disabled>
              Destructive
            </Button>
          </Specimen>
        </Section>

        <Section
          id='pastel-avatar'
          title='PastelAvatar'
          description='The picture for things without one (workspaces): a gradient between two neighboring accent ramps picked from the seed, with a soft highlight. Same seed, same picture. Pure tokens, so it renders on the server and follows the theme.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='24px · the switcher'>
            {['acme', 'globex', 'initech', 'umbrella', 'hooli', 'vandelay', 'wonka', 'stark'].map((seed) => (
              <PastelAvatar
                key={seed}
                seed={seed}
                size={24}
                className='corner-superellipse/1.125 rounded-lg'
              />
            ))}
          </Specimen>
          <Specimen label='40px · invites and settings'>
            {['acme', 'globex', 'initech'].map((seed) => (
              <PastelAvatar
                key={seed}
                seed={seed}
                size={40}
                className='corner-superellipse/1.125 rounded-xl'
              />
            ))}
          </Specimen>
          <Specimen label='orb · people (subscribers, members without a picture) · other hash, other pairs'>
            {['user_42', 'jane.doe7', 'usr_c055e203c655', 'acme', 'globex', 'initech'].map((seed) => (
              <PastelAvatar key={seed} seed={seed} variant='orb' size={30} />
            ))}
          </Specimen>
        </Section>
        <Section
          id='truncate'
          title='Truncate'
          description='A single line that cuts off with an ellipsis and, only when it really is cut off, shows the whole text in a tooltip after 150ms, like every time stamp. Replaces a bare `truncate` span wherever the text comes from data.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='clipped · hover for the full text'>
            <div className='flex w-56 flex-col rounded-xl bg-bg-2 px-3 py-2'>
              <Truncate className='font-medium text-fg-4 text-sm'>
                Your trial ends in 3 days, keep your projects by upgrading before Friday
              </Truncate>
              <Truncate className='text-fg-2 text-xs'>
                jane.okafor560@example.com · Sydney, New South Wales
              </Truncate>
            </div>
          </Specimen>
          <Specimen label='fits · no tooltip'>
            <div className='flex w-56 flex-col rounded-xl bg-bg-2 px-3 py-2'>
              <Truncate className='font-medium text-fg-4 text-sm'>Deals</Truncate>
              <Truncate className='text-fg-2 text-xs'>Weekly offers</Truncate>
            </div>
          </Specimen>
        </Section>
        <Section
          id='filter-bar'
          title='FilterBar'
          description='The row above a data table: a search field, one select per facet ("Any status" until something is picked), a time facet whose presets reach back a year and whose "Custom range" opens a two-month calendar, and a Clear button once anything is active. Controlled by the page, which keeps the state in the URL.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='nothing active'>
            <FilterBar>
              <FilterSelect
                label='Status'
                value={null}
                options={[
                  { value: 'queued', label: 'Queued' },
                  { value: 'completed', label: 'Completed' },
                ]}
                onValueChange={() => {}}
              />
              <FilterSelect
                label='Channel'
                value={null}
                options={[
                  { value: 'push', label: 'Push' },
                  { value: 'email', label: 'Email' },
                ]}
                onValueChange={() => {}}
              />
              <FilterRange
                presets={[
                  { value: '7d', label: 'Last 7 days' },
                  { value: '30d', label: 'Last 30 days' },
                  { value: '12m', label: 'Last 12 months' },
                ]}
                value={null}
                onValueChange={() => {}}
              />
              <FilterSearch placeholder='Search messages' aria-label='Search' defaultValue='' />
            </FilterBar>
          </Specimen>
          <Specimen label='active · searching'>
            <FilterBar>
              <FilterSelect
                label='Status'
                value='completed'
                options={[
                  { value: 'queued', label: 'Queued' },
                  { value: 'completed', label: 'Completed' },
                ]}
                onValueChange={() => {}}
              />
              <FilterRange
                presets={[
                  { value: '7d', label: 'Last 7 days' },
                  { value: '30d', label: 'Last 30 days' },
                ]}
                value='2026-06-03..2026-06-17'
                onValueChange={() => {}}
              />
              <FilterClear />
              <FilterSearch placeholder='Search' aria-label='Search' defaultValue='order' loading />
            </FilterBar>
          </Specimen>
        </Section>
        <Section
          id='charts'
          title='Charts'
          description='bklit charts restyled to the tokens: an area sparkline with a fading fill and a stacked column chart with a tooltip. Series colors are the ramp variables; text stays in text tokens.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='sparkline'>
            <div className='h-16 w-72'>
              <AreaChart
                data={CHART_DAYS.map((day, index) => ({
                  date: day,
                  value: [3, 5, 4, 9, 7, 12, 10][index] ?? 0,
                }))}
                xDataKey='date'
                margin={{ top: 6, right: 0, bottom: 0, left: 0 }}
                aspectRatio='auto'
                className='h-full w-full'
                style={{ height: '100%' }}
              >
                <Area
                  dataKey='value'
                  fill='var(--sky-4)'
                  stroke='var(--sky-4)'
                  strokeWidth={1.5}
                  fillOpacity={0.25}
                  gradientToOpacity={0}
                  fadeEdges
                  showHighlight={false}
                />
              </AreaChart>
            </div>
          </Specimen>
        </Section>
        <Section
          id='badge'
          title='Badge'
          description='Status chips: a -1 tint background with its -text step on top. The -4 step is a fill, not a text color; on its own tint it lands around 2:1.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='variants'>
            {BADGE_VARIANTS.map((v) => (
              <Badge key={v} variant={v}>
                {v}
              </Badge>
            ))}
          </Specimen>
          <Specimen label='sizes · sm (20px) · default (24px)'>
            <Badge size='sm' variant='green'>
              +12.4%
            </Badge>
            <Badge size='sm'>Small</Badge>
            <Badge size='default'>Default</Badge>
          </Specimen>
          <Specimen label='icon prop · trims 2px on the icon side'>
            <Badge variant='green' icon='IconCheckmark1'>
              Active
            </Badge>
            <Badge variant='amber' icon='IconBell'>
              Unverified
            </Badge>
            <Badge size='sm' variant='sky' icon='IconInfoSimple'>
              Info
            </Badge>
            <Badge variant='purple' icon={{ name: 'IconChevronRightMedium', position: 'inline-end' }}>
              Trailing
            </Badge>
          </Specimen>
        </Section>

        <Section
          id='selection'
          title='Selection'
          description='Text selection follows the surface: ::selection reads the inherited --selection variable, so every tinted surface re-colors it with its selection-* utility. Neutral surfaces use the bg-a4 tint. Select the text below to see each one.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='badges · selectable here so the hue shows'>
            {BADGE_VARIANTS.map((v) => (
              <Badge key={v} variant={v} className='cursor-text select-text'>
                Select me
              </Badge>
            ))}
          </Specimen>
          <Specimen label='surfaces'>
            <p className='rounded-xl bg-bg-2 px-3 py-2 text-fg-3 text-sm'>
              Neutral surface, neutral selection.
            </p>
            <p className='selection-amber rounded-xl bg-amber-a2 px-3 py-2 text-fg-3 text-sm'>
              Amber surface selects amber.
            </p>
            <p className='selection-inverse rounded-xl bg-fg-4 px-3 py-2 text-background text-sm'>
              Solid surface flips the selection to light.
            </p>
          </Specimen>
        </Section>

        <Section
          id='input'
          title='Input & Textarea'
          description='Recessed bg-2 fields at 34px, one step taller than the default button, sharing its rounding.'
          className='flex-col items-start'
        >
          <div className='grid w-full max-w-2xl gap-4 sm:grid-cols-2'>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='ds-name'>Default</Label>
              <Input id='ds-name' placeholder='Tenant name' />
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='ds-filled'>Filled</Label>
              <Input id='ds-filled' defaultValue='BuzzKit' />
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='ds-disabled'>Disabled</Label>
              <Input id='ds-disabled' placeholder='Disabled' disabled />
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='ds-invalid'>Invalid</Label>
              <Input id='ds-invalid' placeholder='Invalid' aria-invalid />
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='ds-readonly'>Read-only</Label>
              <Input id='ds-readonly' readOnly defaultValue='bk_ws_live_…' />
              <Input id='ds-loading' placeholder='Look up by external id' defaultValue='user_42' loading />
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='ds-message'>Textarea</Label>
              <Textarea id='ds-message' placeholder='Write a message…' />
            </div>
          </div>
        </Section>

        <Section
          id='field'
          title='Field'
          description='Composes a label, control, description and error into one accessible unit, the building block of every form.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='vertical: label, control, description'>
            <div className='grid w-full max-w-2xl gap-4 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor='ds-f-name'>Workspace name</FieldLabel>
                <Input id='ds-f-name' placeholder='Acme' />
              </Field>
              <Field>
                <FieldLabel htmlFor='ds-f-slug'>Slug</FieldLabel>
                <Input id='ds-f-slug' placeholder='acme' />
                <FieldDescription>Lowercase letters, numbers and hyphens.</FieldDescription>
              </Field>
            </div>
          </Specimen>
          <Specimen label='invalid: data-invalid on the field, aria-invalid on the control'>
            <Field data-invalid='true' className='max-w-sm'>
              <FieldLabel htmlFor='ds-f-invalid'>Slug</FieldLabel>
              <Input
                id='ds-f-invalid'
                defaultValue='api'
                aria-invalid
                aria-describedby='ds-f-invalid-error'
              />
              <FieldError id='ds-f-invalid-error'>This slug is reserved. Pick another.</FieldError>
            </Field>
          </Specimen>
          <Specimen label='disabled'>
            <Field data-disabled='true' className='max-w-sm'>
              <FieldLabel htmlFor='ds-f-disabled'>Workspace name</FieldLabel>
              <Input id='ds-f-disabled' placeholder='Acme' disabled />
              <FieldDescription>Only an owner can rename the workspace.</FieldDescription>
            </Field>
          </Specimen>
          <Specimen label='horizontal: content beside the control'>
            <Field orientation='horizontal' className='max-w-sm'>
              <FieldContent>
                <FieldLabel htmlFor='ds-f-digest'>Require identity verification</FieldLabel>
                <FieldDescription>Every client call must carry a valid identity hash.</FieldDescription>
              </FieldContent>
              <Switch id='ds-f-digest' defaultChecked />
            </Field>
          </Specimen>
          <Specimen label='group: gap-5 stack with a labeled separator'>
            <FieldGroup className='max-w-sm'>
              <Field>
                <FieldLabel htmlFor='ds-f-email'>Email</FieldLabel>
                <Input id='ds-f-email' type='email' placeholder='you@company.com' />
              </Field>
              <FieldSeparator>or</FieldSeparator>
              <Field>
                <FieldLabel htmlFor='ds-f-sso'>SSO domain</FieldLabel>
                <Input id='ds-f-sso' placeholder='company.okta.com' />
                <FieldDescription>Your identity provider’s domain.</FieldDescription>
              </Field>
            </FieldGroup>
          </Specimen>
          <Specimen label='fieldset: legend over related fields'>
            <FieldSet className='max-w-sm'>
              <FieldLegend>Channels</FieldLegend>
              <FieldDescription>Choose which channels this tenant can send on.</FieldDescription>
              <Field orientation='horizontal'>
                <FieldContent>
                  <FieldLabel htmlFor='ds-f-push'>Push</FieldLabel>
                </FieldContent>
                <Checkbox id='ds-f-push' defaultChecked />
              </Field>
              <Field orientation='horizontal'>
                <FieldContent>
                  <FieldLabel htmlFor='ds-f-email2'>Email</FieldLabel>
                </FieldContent>
                <Checkbox id='ds-f-email2' />
              </Field>
            </FieldSet>
          </Specimen>
        </Section>

        <Section
          id='select'
          title='Select'
          description='Field language of an input, press behavior of a button, and the menu’s sliding highlight. Opens on click so the press shows.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='one size, matches the default button'>
            <Select defaultValue='queued' items={[...STATUS_ITEMS, ...CHANNEL_ITEMS]}>
              <SelectTrigger className='w-44'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Status</SelectLabel>
                  {STATUS_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value} icon={item.icon}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Channel</SelectLabel>
                  {CHANNEL_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select items={CHANNEL_ITEMS}>
              <SelectTrigger className='w-36'>
                <SelectValue placeholder='Channel…' />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select disabled items={CHANNEL_ITEMS}>
              <SelectTrigger className='w-36'>
                <SelectValue placeholder='Disabled' />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Specimen>
          <Specimen label='ghost: no fill until hover or open'>
            <Select defaultValue='queued' items={STATUS_ITEMS}>
              <SelectTrigger variant='ghost'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value} icon={item.icon}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Specimen>
        </Section>

        <Section
          id='combobox'
          title='Combobox'
          description='A Select you can type into: the field language of an input, the same popup and sliding highlight, filtered as you type. Free text stays when nothing matches.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='filters the catalog, keeps custom names'>
            <Combobox items={EVENT_NAMES}>
              <ComboboxInput placeholder='workout.completed' className='w-64' />
              <ComboboxContent empty='No event with that name yet.'>
                {(name: string) => (
                  <ComboboxItem key={name} value={name}>
                    {name}
                  </ComboboxItem>
                )}
              </ComboboxContent>
            </Combobox>
          </Specimen>
        </Section>

        <Section
          id='scope-picker'
          title='ScopePicker'
          description='Grouped permissions with a search field: each group is a collapsible row whose checkbox stands for its wildcard, options fold open with the sidebar spring, and picking every option collapses back into the wildcard.'
        >
          <ScopePickerDemo />
        </Section>

        <Section
          id='controls'
          title='Checkbox, Radio, Switch'
          description='Contentless controls scale fully on press; they have no label that could shift.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='checkbox'>
            <div className='flex items-center gap-2'>
              <Checkbox id='ds-c1' defaultChecked />
              <Label htmlFor='ds-c1'>Checked</Label>
            </div>
            <div className='flex items-center gap-2'>
              <Checkbox id='ds-c2' />
              <Label htmlFor='ds-c2'>Unchecked</Label>
            </div>
            <div className='flex items-center gap-2'>
              <Checkbox id='ds-c3' disabled defaultChecked />
              <Label htmlFor='ds-c3'>Disabled</Label>
            </div>
          </Specimen>
          <Specimen label='radio'>
            <RadioGroup defaultValue='all' className='flex w-auto items-center gap-4'>
              <div className='flex items-center gap-2'>
                <RadioGroupItem value='all' id='ds-r1' />
                <Label htmlFor='ds-r1'>All subscribers</Label>
              </div>
              <div className='flex items-center gap-2'>
                <RadioGroupItem value='topic' id='ds-r2' />
                <Label htmlFor='ds-r2'>By topic</Label>
              </div>
              <div className='flex items-center gap-2'>
                <RadioGroupItem value='none' id='ds-r3' disabled />
                <Label htmlFor='ds-r3'>Disabled</Label>
              </div>
            </RadioGroup>
          </Specimen>
          <Specimen label='switch'>
            <div className='flex items-center gap-2'>
              <Switch id='ds-s1' defaultChecked />
              <Label htmlFor='ds-s1'>Checked</Label>
            </div>
            <div className='flex items-center gap-2'>
              <Switch id='ds-s2' />
              <Label htmlFor='ds-s2'>Unchecked</Label>
            </div>
            <div className='flex items-center gap-2'>
              <Switch id='ds-s3' disabled defaultChecked />
              <Label htmlFor='ds-s3'>Disabled</Label>
            </div>
          </Specimen>
        </Section>

        <Section
          id='tabs'
          title='Tabs'
          description='The segmented pill slides between tabs; the ghost variant is bare text that presses like a link.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='segmented (default)'>
            <Tabs defaultValue='deliveries'>
              <TabsList>
                <TabsTrigger value='deliveries'>Deliveries</TabsTrigger>
                <TabsTrigger value='attempts'>Attempts</TabsTrigger>
                <TabsTrigger value='payload'>Payload</TabsTrigger>
              </TabsList>
              <TabsContent value='deliveries'>One row per subscription.</TabsContent>
              <TabsContent value='attempts'>Every provider call, with request and response.</TabsContent>
              <TabsContent value='payload'>The exact message that was sent.</TabsContent>
            </Tabs>
          </Specimen>
          <Specimen label='ghost'>
            <Tabs defaultValue='day'>
              <TabsList variant='ghost'>
                <TabsTrigger value='day'>Day</TabsTrigger>
                <TabsTrigger value='week'>Week</TabsTrigger>
                <TabsTrigger value='month'>Month</TabsTrigger>
              </TabsList>
            </Tabs>
          </Specimen>
        </Section>

        <Section
          id='pill-tabs'
          title='Pill tabs'
          description='Free-floating pickers (no track). The pill is a clip-path window over an inverted copy of the labels; sliding it splits a label at the pill edge instead of cross-fading text color.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='primary: status filters'>
            <PillTabsDemo
              variant='primary'
              itemClassName='h-6.5 px-2.5 text-xs'
              values={['All', 'Sent', 'Retrying', 'Failed']}
            />
          </Specimen>
          <Specimen label='soft: header nav, environment pickers'>
            <PillTabsDemo
              variant='soft'
              itemClassName='h-7.5 px-3 text-sm'
              values={['Overview', 'Subscribers', 'Messages', 'Settings']}
            />
          </Specimen>
        </Section>

        <Section
          id='dropdown'
          title='Dropdown menu'
          description='One indicator slides between items; items never draw their own background. Supports icons, submenus, checkbox and radio items.'
        >
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant='elevated' />}>Options</DropdownMenuTrigger>
            <DropdownMenuContent className='w-56'>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Credential</DropdownMenuLabel>
                <DropdownMenuItem icon='IconArrowRotateClockwise'>Validate again</DropdownMenuItem>
                <DropdownMenuItem icon='IconKey1'>
                  Replace key
                  <DropdownMenuShortcut>R</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Environment</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem icon='IconRocket'>Production</DropdownMenuItem>
                    <DropdownMenuItem icon='IconCode'>Sandbox</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>View</DropdownMenuLabel>
                <DropdownMenuCheckboxItem checked>Show revoked</DropdownMenuCheckboxItem>
                <DropdownMenuRadioGroup defaultValue='newest'>
                  <DropdownMenuRadioItem value='newest'>Newest first</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value='oldest'>Oldest first</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant='destructive' icon='IconTrashCan'>
                Revoke
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Section>

        <Section id='popover' title='Popover' description='Small interactive panels on the menu surface.'>
          <Popover>
            <PopoverTrigger render={<Button variant='elevated' />}>Channels</PopoverTrigger>
            <PopoverContent>
              <PopoverHeader>
                <PopoverTitle>Channels</PopoverTitle>
                <PopoverDescription>Pause a channel without deleting its key.</PopoverDescription>
              </PopoverHeader>
              <div className='flex items-center justify-between'>
                <Label htmlFor='ds-pop-1'>Push</Label>
                <Switch id='ds-pop-1' defaultChecked />
              </div>
              <div className='flex items-center justify-between'>
                <Label htmlFor='ds-pop-2'>Email</Label>
                <Switch id='ds-pop-2' />
              </div>
            </PopoverContent>
          </Popover>
        </Section>

        <Section
          id='tooltip'
          title='Tooltip'
          description='A compact dark pill. Supports a trailing shortcut.'
        >
          <Tooltip>
            <TooltipTrigger render={<Button variant='elevated' />}>Top</TooltipTrigger>
            <TooltipContent>Validate credential</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button variant='elevated' />}>Right</TooltipTrigger>
            <TooltipContent side='right'>Copy the key</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button variant='elevated' />}>With shortcut</TooltipTrigger>
            <TooltipContent>
              Send test
              <Kbd>T</Kbd>
            </TooltipContent>
          </Tooltip>
        </Section>

        <Section
          id='dialog'
          title='Dialog'
          description='Centered, 420px, title over description. Tall content scrolls.'
        >
          <Dialog>
            <DialogTrigger render={<Button />}>New tenant</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a tenant</DialogTitle>
              </DialogHeader>
              <form className='flex w-full flex-col gap-3'>
                <div className='flex flex-col gap-1.5'>
                  <Label htmlFor='ds-dialog-name'>Name</Label>
                  <Input id='ds-dialog-name' placeholder='Customer One' />
                </div>
                <div className='flex flex-col gap-1.5'>
                  <Label htmlFor='ds-dialog-slug'>Slug</Label>
                  <Input id='ds-dialog-slug' placeholder='customer-one' />
                </div>
                <Button className='mt-2 w-full' type='submit'>
                  Create tenant
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger render={<Button variant='elevated' />}>With close button</DialogTrigger>
            <DialogContent showCloseButton>
              <DialogHeader>
                <DialogTitle>Keyboard shortcuts</DialogTitle>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </Section>

        <Section
          id='alert-dialog'
          title='Alert dialog'
          description='Destructive confirms: title, description, and two actions that split the width.'
        >
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant='destructive' />}>Delete tenant</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete tenant?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes its credentials, subscribers and messages and revokes its keys. This cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant='destructive'>Delete tenant</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Section>

        <Section
          id='sheet'
          title='Sheet'
          description='Side panels. Scrollable content goes in SheetBody so the header and footer stay pinned.'
        >
          {(['right', 'left', 'bottom'] as const).map((side) => (
            <Sheet key={side}>
              <SheetTrigger render={<Button variant='elevated' />}>{side}</SheetTrigger>
              <SheetContent side={side}>
                <SheetHeader>
                  <SheetTitle>Delivery details</SheetTitle>
                  <SheetDescription>Every attempt, with request and response.</SheetDescription>
                </SheetHeader>
                <SheetBody className='flex flex-col gap-3'>
                  {ACTIVITY_ROWS.map((row) => (
                    <div key={row.id} className='flex items-center gap-3'>
                      <Avatar size='sm'>
                        <AvatarFallback>{row.initial}</AvatarFallback>
                      </Avatar>
                      <div className='flex flex-col'>
                        <span className='font-medium text-fg-4 text-sm'>{row.title}</span>
                        <span className='text-fg-2 text-xs'>Sent via APNs in 212ms</span>
                      </div>
                    </div>
                  ))}
                </SheetBody>
                <SheetFooter>
                  <Button className='w-full'>Resend</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          ))}
        </Section>

        <Section
          id='drawer'
          title='Drawer'
          description='Vaul: a surface that is dragged, not just opened. Bottom under 768px, an inset side panel above.'
        >
          <Specimen label='responsive'>
            <Drawer responsive>
              <DrawerTrigger asChild>
                <Button variant='elevated'>Open drawer</Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader className='pt-2 pb-2'>
                  <DrawerTitle className='text-sm'>Subscribers</DrawerTitle>
                </DrawerHeader>
                <DrawerBody className='flex flex-col gap-2 pb-2'>
                  <p className='text-fg-2 text-sm'>
                    Drag it away to dismiss. Narrow the window below 768px and the same drawer comes up from
                    the bottom instead.
                  </p>
                </DrawerBody>
                <DrawerFooter className='pt-2'>
                  <Button className='w-full'>New subscriber</Button>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          </Specimen>
        </Section>

        <Section
          id='toast'
          title='Toast'
          description='Firing the same toast twice pings the existing one (shake for errors, bump otherwise) instead of stacking duplicates.'
        >
          <Button variant='elevated' onClick={() => toast.success('Credential connected')}>
            Success
          </Button>
          <Button
            variant='elevated'
            onClick={() =>
              toast.error('Unable to reach the API', { description: 'Check your connection and try again.' })
            }
          >
            Error
          </Button>
          <Button variant='elevated' onClick={() => toast.warning('APNs key expires soon')}>
            Warning
          </Button>
          <Button variant='elevated' onClick={() => toast.info('3 new subscribers')}>
            Info
          </Button>
          <Button variant='elevated' onClick={() => toast('Plain message')}>
            Default
          </Button>
          <Button
            variant='elevated'
            onClick={() =>
              toast('Key revoked', {
                description: 'Requests with it fail from now on.',
                action: { label: 'Undo', onClick: () => toast.success('Restored') },
              })
            }
          >
            With action
          </Button>
          <Button
            variant='elevated'
            onClick={() => {
              const id = toast.loading('Sending…');
              setTimeout(() => toast.success('Message queued', { id }), 1600);
            }}
          >
            Loading → success
          </Button>
        </Section>

        <Section
          id='card'
          title='Card'
          description='Header / content / footer, with an optional action slot.'
          className='items-stretch'
        >
          <Card className='max-w-sm'>
            <CardHeader>
              <CardTitle>Workspace name</CardTitle>
              <CardDescription>This is the name shown to your team and in the dashboard.</CardDescription>
            </CardHeader>
            <CardContent>
              <Input defaultValue='BuzzKit' />
            </CardContent>
            <CardFooter>
              <span className='text-fg-2 text-sm'>Max. 100 characters</span>
              <Button size='xs'>Save</Button>
            </CardFooter>
          </Card>
          <Card className='max-w-xs'>
            <CardHeader divider>
              <CardTitle>Recent messages</CardTitle>
            </CardHeader>
            <ul className='flex flex-col divide-y divide-bg-3'>
              <li className='px-4 py-2.5 text-fg-4 text-sm'>Streak at risk</li>
              <li className='px-4 py-2.5 text-fg-4 text-sm'>Good morning</li>
            </ul>
          </Card>
          <Card className='max-w-xs'>
            <CardHeader>
              <CardTitle>Credentials</CardTitle>
              <CardDescription>2 connected, 1 unverified.</CardDescription>
              <CardAction>
                <Badge variant='amber' size='sm'>
                  1 unverified
                </Badge>
              </CardAction>
            </CardHeader>
          </Card>
          <Card className='max-w-52 cursor-pointer transition-shadow hover:shadow-md'>
            <CardHeader>
              <div className='mb-2 flex size-6 items-center justify-center rounded-full bg-bg-2 shadow-1'>
                <Icon name='IconBell' className='size-3.5 text-fg-3' />
              </div>
              <CardTitle>Messages</CardTitle>
              <CardDescription>128 sent today</CardDescription>
            </CardHeader>
          </Card>
        </Section>

        <Section
          id='onboarding'
          title='Onboarding'
          description='The pieces of the setup flow: progress, choice cards, guide steps, file drop and the provider illustrations.'
          className='flex-col items-start gap-6'
        >
          <Specimen label='progress'>
            <ProgressDemo />
          </Specimen>
          <Specimen label='choice rows · available, connected, soon'>
            <div className='w-full max-w-md px-2'>
              <ChoiceRows>
                <ChoiceRow
                  to='#onboarding'
                  icon='IconBellFilled'
                  title='Push notifications'
                  description='Reach iPhones and Android phones through Apple and Google.'
                />
                <ChoiceRow
                  to='#onboarding'
                  icon='IconEmail2Filled'
                  title='Email'
                  description='Transactional email through your own sending provider.'
                  state='connected'
                />
                <ChoiceRow
                  to='#onboarding'
                  icon='IconBubbleTextFilled'
                  title='SMS'
                  description='Text messages through Twilio or Vonage.'
                  state='soon'
                />
              </ChoiceRows>
            </div>
          </Specimen>
          <Specimen label='guide steps · done, active, upcoming'>
            <ol className='flex w-full max-w-md flex-col gap-5'>
              <li>
                <GuideStep number={1} title='Connect a channel' state='done'>
                  <p className='text-pretty text-fg-2 text-sm'>Apple is connected.</p>
                </GuideStep>
              </li>
              <li>
                <GuideStep number={2} title='Register a device' state='active' waiting='Waiting for a device'>
                  <p className='text-pretty text-fg-2 text-sm'>
                    Creates the subscriber and its subscription.
                  </p>
                </GuideStep>
              </li>
              <li>
                <GuideStep number={3} title='Send your first message' state='upcoming'>
                  <p className='text-pretty text-fg-2 text-sm'>Returns a message id right away.</p>
                </GuideStep>
              </li>
            </ol>
          </Specimen>
          <Specimen label='file drop'>
            <FileDropDemo />
          </Specimen>
          <Specimen label='illustrations · Apple guide'>
            <IllustrationDemo />
          </Specimen>
          <Specimen label='text swap'>
            <TextSwapDemo />
          </Specimen>
          <Specimen label='step counter'>
            <StepCounterDemo />
          </Specimen>
          <Specimen label='sidebar · mock workspace'>
            <div className='corner-superellipse/1.125 flex h-[640px] w-[560px] overflow-hidden rounded-2xl bg-background-subtle'>
              <Sidebar
                workspace={MOCK_WORKSPACE}
                workspaces={[
                  MOCK_WORKSPACE,
                  { ...MOCK_WORKSPACE, id: 'ws_2', name: 'Side project', slug: 'side' },
                ]}
                profile={MOCK_PROFILE}
                tenant={MOCK_TENANTS[0]!}
                tenants={MOCK_TENANTS}
              />
              <div className='corner-superellipse/1.125 m-2 ml-0 flex-1 rounded-2xl bg-card shadow-sm' />
            </div>
          </Specimen>
          <Specimen label='sign-in providers'>
            <div className='w-72'>
              <OAuthProviders github onGithub={() => undefined} />
            </div>
          </Specimen>
        </Section>

        <Section
          id='code-block'
          title='Code block'
          description='Copyable snippets for the setup guides: mono text on a soft surface, copy affordance in the corner.'
          className='items-stretch'
        >
          <CodeBlock
            className='max-w-xl'
            code={`curl -X POST https://api.BuzzKit.dev/v1/messages \\\n  -H 'Authorization: Bearer bk_ws_your_workspace_key' \\\n  -d '{ "to": ["user_42"], "title": "Hey", "body": "Your first push." }'`}
          />
        </Section>

        <Section
          id='avatar'
          title='Avatar'
          description='Sizes, image with fallback, status badge and overlapping groups. Anything without a picture of its own gets a generated one, never initials: `name` draws a deterministic Kodama face for subscribers, `picture="orb"` a pastel orb for signed-in people.'
        >
          <Specimen label='generated · name="user_42" · the same id always gets the same face'>
            <Avatar size='sm' name='user_42' />
            <Avatar name='user_42' />
            <Avatar size='lg' name='user_42' />
            <Avatar size='xl' name='user_42' />
            <Avatar size='lg' name='jane.doe7' />
            <Avatar size='lg' name='usr_c055e203c655' />
          </Specimen>
          <Specimen label='picture="orb" · signed-in people (account menu, members)'>
            <Avatar size='sm' name='jane@acme.com' picture='orb' />
            <Avatar name='jane@acme.com' picture='orb' />
            <Avatar size='lg' name='mark@acme.com' picture='orb' />
          </Specimen>
          <Specimen label='sizes'>
            <Avatar size='sm'>
              <AvatarFallback>bk</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>ct</AvatarFallback>
            </Avatar>
            <Avatar size='lg'>
              <AvatarFallback>mk</AvatarFallback>
            </Avatar>
            <Avatar size='xl'>
              <AvatarFallback>xl</AvatarFallback>
            </Avatar>
          </Specimen>
          <Specimen label='image · badge · group'>
            <Avatar>
              <AvatarImage src='https://github.com/chroxify.png' alt='@chroxify' />
              <AvatarFallback>ct</AvatarFallback>
            </Avatar>
            <Avatar size='lg'>
              <AvatarFallback>on</AvatarFallback>
              <AvatarBadge className='bg-green-4' />
            </Avatar>
            <AvatarGroup>
              <Avatar>
                <AvatarFallback>a</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>b</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>c</AvatarFallback>
              </Avatar>
            </AvatarGroup>
          </Specimen>
        </Section>

        <Section id='kbd' title='Kbd & Separator'>
          <Specimen label='kbd'>
            <Kbd>N</Kbd>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </Specimen>
          <Specimen label='separator'>
            <div className='flex w-48 flex-col gap-2'>
              <span className='text-fg-3 text-sm'>Above</span>
              <Separator />
              <span className='text-fg-3 text-sm'>Below</span>
            </div>
            <div className='flex h-10 items-center gap-3'>
              <span className='text-fg-3 text-sm'>Left</span>
              <Separator orientation='vertical' />
              <span className='text-fg-3 text-sm'>Right</span>
            </div>
          </Specimen>
        </Section>

        <Section
          id='loading'
          title='Loading & waiting'
          description='A spinner means the app is working. The live ping means the app is ready and listening for something external, so it sits beside the thing it waits for.'
        >
          <Specimen label='spinner'>
            <Spinner />
            <Spinner className='size-5 text-fg-2' />
            <Button disabled>
              <Spinner className='size-4' />
              Saving…
            </Button>
          </Specimen>
          <Specimen label='live ping'>
            <LivePing />
            <span className='flex w-64 items-center justify-between gap-2 font-medium text-fg-4 text-sm'>
              Register a device
              <span className='flex items-center gap-1.5 text-fg-2 text-xs'>
                <LivePing />
                Waiting for a device
              </span>
            </span>
          </Specimen>
          <Specimen label='skeleton'>
            <div className='flex items-center gap-3'>
              <Skeleton className='size-8 rounded-full' />
              <div className='flex flex-col gap-1'>
                <Skeleton className='h-3.5 w-32' />
                <Skeleton className='h-3.5 w-20' />
              </div>
            </div>
          </Specimen>
        </Section>

        <Section
          id='table'
          title='Table'
          description='Hairline rows inside a Card, edge to edge. Header cells are text-xs fg-2, body cells text-sm; every cell is nowrap and the container scrolls sideways, so narrow viewports scroll the table, never the page. Rows are not pressed; actions live in a trailing menu. TablePagination is the footer row: it disables Previous on the first page and Next on the last, and disappears for a single page.'
        >
          <TableDemo />
        </Section>

        <Section
          id='empty-state'
          title='Empty state'
          description='One treatment for every blank slate: a glyph in a soft tile, a title, one line saying what the place is, and at most one action. Never hand-roll another.'
          className='flex-col items-stretch'
        >
          <Specimen label='nothing here yet'>
            <div className='flex min-h-56 w-full max-w-md flex-col rounded-2xl bg-bg-2/40'>
              <EmptyState
                icon='IconPeopleFilled'
                title='No subscribers'
                description='Subscribers appear the moment your app registers a device.'
              />
            </div>
          </Specimen>
          <Specimen label='with an action'>
            <div className='flex min-h-56 w-full max-w-md flex-col rounded-2xl bg-bg-2/40'>
              <EmptyState
                icon='IconExclamationCircle'
                title='Unable to load messages'
                description='Check your connection and try again.'
              >
                <Button variant='elevated' size='sm'>
                  Try again
                </Button>
              </EmptyState>
            </div>
          </Specimen>
          <Specimen label='title only'>
            <div className='flex min-h-56 w-full max-w-md flex-col rounded-2xl bg-bg-2/40'>
              <EmptyState icon='IconBellFilled' title='Select a message' />
            </div>
          </Specimen>
          <Specimen label='size sm · inside a card section'>
            <div className='w-80'>
              <Card>
                <CardHeader>
                  <CardTitle>Preferences</CardTitle>
                </CardHeader>
                <EmptyState
                  size='sm'
                  icon='IconTagFilled'
                  title='No topics yet'
                  description='Create a topic and this subscriber’s choice per channel appears here.'
                />
              </Card>
            </div>
          </Specimen>
        </Section>

        <Section
          id='scroll'
          title='Scrolling'
          description='ScrollArea adds a custom auto-hiding scrollbar; ScrollFade is the same edge masking for a plain container. Both fade only on the side with more content.'
          className='items-start'
        >
          <div className='flex flex-col gap-2'>
            <span className='text-fg-2 text-xs'>ScrollArea</span>
            <ScrollArea className='h-40 w-64 rounded-xl bg-bg-2 p-3'>
              <div className='flex flex-col gap-2'>
                {SCROLL_ROWS.map((row) => (
                  <div key={row.id} className='text-fg-3 text-sm'>
                    {row.label}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
          <div className='flex flex-col gap-2'>
            <span className='text-fg-2 text-xs'>ScrollFade</span>
            <ScrollFade className='h-40 w-64 rounded-xl bg-bg-2 p-3'>
              <div className='flex flex-col gap-2'>
                {FADE_ROWS.map((row) => (
                  <div key={row.id} className='text-fg-3 text-sm'>
                    {row.label}
                  </div>
                ))}
              </div>
            </ScrollFade>
          </div>
        </Section>

        <Section
          id='motion'
          title='Size animator'
          description='Transitions height changes instead of snapping. Use around popup content that grows or filters.'
          className='flex-col items-start'
        >
          <Button variant='elevated' onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Collapse' : 'Expand'}
          </Button>
          <SizeAnimator className='w-72 rounded-xl bg-bg-2'>
            <div className='flex flex-col gap-2 p-3'>
              <span className='text-fg-3 text-sm'>Always visible</span>
              {expanded && (
                <>
                  <span className='text-fg-3 text-sm'>Revealed row one</span>
                  <span className='text-fg-3 text-sm'>Revealed row two</span>
                  <span className='text-fg-3 text-sm'>Revealed row three</span>
                </>
              )}
            </div>
          </SizeAnimator>
        </Section>
      </main>
    </div>
  );
}
