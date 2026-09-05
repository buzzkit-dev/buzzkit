import type { IconName } from '@buzzkit/ui/components/icon/paths';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { comparisons } from '../compare';
import { hero } from '../content';
import { features } from '../features';
import { pricing } from '../pricing';
import { site } from '../site';
import {
  balanceLines,
  COLORS,
  element,
  icon,
  logo,
  type Node,
  readAsset,
  resolveFonts,
  toArrayBuffer,
} from './primitives';
import { type Visual, visual } from './visuals';

export interface OgCard {
  path: string;
  title: string;
  continuation: string;
  kicker: string;
  icon: IconName;
  visual: Visual;
}

const WIDTH = 1200;
const HEIGHT = 630;

const FEATURE_VISUALS: Record<string, Visual> = {
  'live-activities': { kind: 'liveActivity' },
  workflows: { kind: 'workflow' },
  segments: { kind: 'segment' },
  topics: { kind: 'preferences' },
  delivery: { kind: 'ledger' },
  'ios-sdk': { kind: 'actions' },
  scheduling: { kind: 'schedule' },
  sources: { kind: 'sources' },
  'multi-tenancy': { kind: 'tenants' },
};

export const ogCards: OgCard[] = [
  {
    path: 'home',
    title: hero.headline,
    continuation: '',
    kicker: 'Open source',
    icon: 'IconGithub',
    visual: { kind: 'notifications' },
  },
  ...features.map((feature) => ({
    path: `features/${feature.slug}`,
    title: feature.title,
    continuation: feature.continuation,
    kicker: feature.name,
    icon: feature.icon as IconName,
    visual: FEATURE_VISUALS[feature.slug] ?? { kind: 'notifications' as const },
  })),
  ...comparisons.map((comparison) => ({
    path: `compare/${comparison.slug}`,
    title: comparison.title,
    continuation: comparison.continuation,
    kicker: 'Compare',
    icon: 'IconSplitFilled' as IconName,
    visual: { kind: 'notifications' as const },
  })),
  {
    path: 'pricing',
    title: pricing.title,
    continuation: pricing.continuation,
    kicker: 'Pricing',
    icon: 'IconTagFilled',
    visual: { kind: 'notifications' },
  },
  {
    path: 'why-buzzkit',
    title: 'Why BuzzKit.',
    continuation: 'Everything a notification needs, already built.',
    kicker: 'Why BuzzKit',
    icon: 'IconAgentsFilled',
    visual: { kind: 'notifications' },
  },
  {
    path: 'developers',
    title: 'Developers.',
    continuation: 'One API, one key, one call to send.',
    kicker: 'Developers',
    icon: 'IconCodeLargeFilled',
    visual: { kind: 'apiKey' },
  },
  {
    path: 'about',
    title: 'About BuzzKit.',
    continuation: 'The part every app rebuilds, done once.',
    kicker: 'About',
    icon: 'IconCircleInfo',
    visual: { kind: 'notifications' },
  },
  {
    path: 'contact',
    title: 'Contact.',
    continuation: 'Built in the open, answered by people.',
    kicker: 'Contact',
    icon: 'IconEmail2Filled',
    visual: { kind: 'notifications' },
  },
  {
    path: 'privacy',
    title: 'Privacy.',
    continuation: 'Plain about what is collected, and what is not.',
    kicker: 'Privacy',
    icon: 'IconShieldCheckFilled',
    visual: { kind: 'notifications' },
  },
];

function card(entry: OgCard): Node {
  const wide = entry.continuation === '';
  const fontSize = wide ? 54 : 60;
  const width = wide ? 720 : 680;
  const letterSpacing = -1.8;
  const heading = [
    element('span', { color: COLORS.fg4 }, balanceLines(entry.title, width, fontSize, letterSpacing)),
  ];
  if (entry.continuation) {
    heading.push(
      element('span', { color: COLORS.fg2 }, balanceLines(entry.continuation, width, fontSize, letterSpacing))
    );
  }
  return element(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: WIDTH,
      height: HEIGHT,
      padding: 72,
      backgroundColor: COLORS.bg1,
      fontFamily: 'OpenRunde',
      position: 'relative',
      overflow: 'hidden',
    },
    [
      element('div', {
        position: 'absolute',
        top: -640,
        left: 100,
        width: 1000,
        height: 1000,
        backgroundImage: `radial-gradient(circle at 50% 50%, ${COLORS.brand2} 0%, rgba(217, 227, 255, 0) 68%)`,
      }),
      element('div', { display: 'flex', alignItems: 'center', gap: 16 }, [
        logo(56, 18),
        element('span', { fontSize: 36, fontWeight: 600, letterSpacing: -0.5, color: COLORS.fg4 }, 'BuzzKit'),
      ]),
      element(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          width,
          fontSize,
          fontWeight: 500,
          lineHeight: 1.1,
          letterSpacing,
          whiteSpace: 'pre-line',
        },
        heading
      ),
      element(
        'div',
        {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 24,
          color: COLORS.fg2,
        },
        [
          element('span', {}, site.url.replace('https://', '')),
          element('div', { display: 'flex', alignItems: 'center', gap: 10 }, [
            icon(entry.icon, 26, COLORS.fg2),
            element('span', {}, entry.kicker),
          ]),
        ]
      ),
      element('div', { position: 'absolute', top: 56, right: 56, display: 'flex' }, [visual(entry.visual)]),
    ]
  );
}

export async function renderOgImage(entry: OgCard): Promise<ArrayBuffer> {
  const svg = await satori(card(entry) as never, { width: WIDTH, height: HEIGHT, fonts: resolveFonts() });
  return toArrayBuffer(new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng());
}

export function renderIcon(size: number, asset = 'public/favicon.svg'): ArrayBuffer {
  const svg = readAsset(asset).toString('utf8');
  return toArrayBuffer(new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
}
