import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { comparisons } from '../compare';
import { hero } from '../content';
import { features } from '../features';
import { pricing } from '../pricing';
import {
  balanceLines,
  COLORS,
  element,
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
  visual: Visual;
}

const WIDTH = 1200;
const HEIGHT = 630;
const STAGE_WIDTH = WIDTH - 176;
const STAGE_HEIGHT = 420;

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
  { path: 'home', title: hero.headline, continuation: '', visual: { kind: 'dashboard' } },
  ...features.map((feature) => ({
    path: `features/${feature.slug}`,
    title: feature.title,
    continuation: feature.continuation,
    visual: FEATURE_VISUALS[feature.slug] ?? { kind: 'notifications' as const },
  })),
  ...comparisons.map((comparison) => ({
    path: `compare/${comparison.slug}`,
    title: comparison.title,
    continuation: comparison.continuation,
    visual: { kind: 'dashboard' as const },
  })),
  {
    path: 'pricing',
    title: pricing.title,
    continuation: pricing.continuation,
    visual: { kind: 'dashboard' },
  },
  {
    path: 'buzz',
    title: 'Buzz.',
    continuation: 'Live updates from your coding agents, on your lock screen.',
    visual: { kind: 'phone' },
  },
  {
    path: 'why-buzzkit',
    title: 'Why BuzzKit.',
    continuation: 'Everything a notification needs, already built.',
    visual: { kind: 'dashboard' },
  },
  {
    path: 'developers',
    title: 'Developers.',
    continuation: 'One API, one key, one call to send.',
    visual: { kind: 'apiKey' },
  },
  {
    path: 'about',
    title: 'About BuzzKit.',
    continuation: 'The part every app rebuilds, done once.',
    visual: { kind: 'dashboard' },
  },
  {
    path: 'contact',
    title: 'Contact.',
    continuation: 'Built in the open, answered by people.',
    visual: { kind: 'dashboard' },
  },
  {
    path: 'privacy',
    title: 'Privacy.',
    continuation: 'Plain about what is collected, and what is not.',
    visual: { kind: 'dashboard' },
  },
];

function wash(left: number): Node {
  return element('div', {
    position: 'absolute',
    top: -640,
    left,
    width: 1000,
    height: 1000,
    backgroundImage: `radial-gradient(circle at 50% 50%, ${COLORS.brand2} 0%, rgba(217, 227, 255, 0) 68%)`,
  });
}

function wordmark(size: number, radius: number, fontSize: number): Node {
  return element('div', { display: 'flex', alignItems: 'center', gap: size / 3.5 }, [
    logo(size, radius),
    element('span', { fontSize, fontWeight: 600, letterSpacing: -0.5, color: COLORS.fg4 }, 'BuzzKit'),
  ]);
}

function heading(entry: OgCard): Node {
  const fontSize = entry.continuation ? 40 : 52;
  const letterSpacing = -1.4;
  const lines = [
    element('span', { color: COLORS.fg4 }, balanceLines(entry.title, 900, fontSize, letterSpacing)),
  ];
  if (entry.continuation) {
    lines.push(
      element('span', { color: COLORS.fg2 }, balanceLines(entry.continuation, 900, fontSize, letterSpacing))
    );
  }
  return element(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: WIDTH - 176,
      fontSize,
      fontWeight: 500,
      lineHeight: 1.15,
      letterSpacing,
      whiteSpace: 'pre-line',
      textAlign: 'center',
    },
    lines
  );
}

function stage(entry: OgCard): Node {
  const artifact = visual(entry.visual);
  if (entry.visual.kind === 'dashboard') return artifact;
  return element(
    'div',
    {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      position: 'relative',
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      paddingTop: 48,
      borderRadius: '24px 24px 0 0',
      backgroundImage: `linear-gradient(to bottom, ${COLORS.brand1} 0%, ${COLORS.bg2} 50%, ${COLORS.bg3} 100%)`,
      overflow: 'hidden',
    },
    [
      element('div', {
        position: 'absolute',
        top: 0,
        left: 0,
        width: STAGE_WIDTH,
        height: 256,
        backgroundImage:
          'radial-gradient(circle at 50% 0%, rgba(217, 227, 255, 0.7) 0%, rgba(217, 227, 255, 0) 70%)',
      }),
      element('div', { display: 'flex' }, [artifact]),
    ]
  );
}

function card(entry: OgCard): Node {
  return element(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: WIDTH,
      height: HEIGHT,
      padding: '56px 88px 0',
      backgroundColor: COLORS.bg1,
      fontFamily: 'OpenRunde',
      position: 'relative',
      overflow: 'hidden',
    },
    [
      wash(100),
      element(
        'div',
        { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, width: WIDTH - 176 },
        [wordmark(44, 14, 28), heading(entry)]
      ),
      element('div', { display: 'flex', marginTop: 36 }, [stage(entry)]),
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
