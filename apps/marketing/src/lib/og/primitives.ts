import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ICON_PATHS, type IconName } from '@buzzkit/ui/components/icon/paths';
import { parse } from '@shuding/opentype.js';

export type Style = Record<string, string | number>;
export type Node = { type: string; props: Record<string, unknown> };

export const COLORS = {
  fg1: '#b1b2b5',
  fg2: '#6e6f75',
  fg3: '#525358',
  fg4: '#17181c',
  bg1: '#ffffff',
  bg2: '#f6f6f7',
  bg3: '#eff0f1',
  bg4: '#e6e7e9',
  bgA1: 'rgba(0, 0, 0, 0.027)',
  bgA2: 'rgba(0, 0, 0, 0.047)',
  backgroundSubtle: '#fafafa',
  brand1: '#eef2ff',
  brand2: '#d9e3ff',
  brand4: '#485dfb',
  green1: '#eefbf1',
  green4: '#58d176',
  greenText: '#009840',
  blue1: '#eefbff',
  blue4: '#34cfff',
  blueText: '#008fb5',
  sky1: '#edf3ff',
  sky4: '#4d8dfa',
  skyText: '#2376ff',
  amber1: '#fff8e9',
  amber4: '#ffb62e',
  amberText: '#b27a00',
  purple1: '#f8f3fe',
  purpleText: '#a851ff',
  red4: '#ff3b30',
};

const RAMPS: Record<string, [string, string]> = {
  purple: ['#e9ddfc', '#cbaef8'],
  pink: ['#ffc8ea', '#f284ca'],
  sky: ['#c5d9fe', '#74a4fc'],
  blue: ['#c8f3ff', '#5cd8ff'],
  green: ['#c7f0d2', '#79dd93'],
  yellow: ['#fff7ba', '#ffee6b'],
  amber: ['#ffecc7', '#ffcb69'],
  orange: ['#ffdcc6', '#ffab73'],
};

const TILE_PAIRS: [string, string][] = [
  ['purple', 'pink'],
  ['sky', 'blue'],
  ['green', 'yellow'],
  ['amber', 'orange'],
  ['pink', 'orange'],
  ['blue', 'purple'],
  ['yellow', 'green'],
  ['sky', 'purple'],
];

const ORB_HUES = ['purple', 'sky', 'blue', 'green', 'amber', 'orange', 'pink', 'yellow'];

export const SHADOWS = {
  card: '0px 1px 3px rgba(0, 0, 0, 0.09), 0px 0px 0px 1px rgba(0, 0, 0, 0.031)',
  raised:
    '0px 1px 3px rgba(0, 0, 0, 0.051), 0px 6px 14px rgba(0, 0, 0, 0.039), 0px 0px 0px 1px rgba(0, 0, 0, 0.02)',
  knob: '0px 1px 2px rgba(0, 0, 0, 0.16), 0px 0px 0px 1px rgba(0, 0, 0, 0.04)',
};

const SCALE = 1.4;

export function px(value: number): number {
  return Math.round(value * SCALE * 2) / 2;
}

export function element(type: string, style: Style, children?: (Node | string)[] | string): Node {
  return { type, props: children === undefined ? { style } : { style, children } };
}

export function readAsset(path: string): Buffer {
  return readFileSync(resolve(process.cwd(), path));
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function resolveFonts() {
  return [
    {
      name: 'OpenRunde',
      data: readAsset('src/assets/fonts/OpenRunde-Regular.ttf'),
      weight: 400 as const,
      style: 'normal' as const,
    },
    {
      name: 'OpenRunde',
      data: readAsset('src/assets/fonts/OpenRunde-Medium.ttf'),
      weight: 500 as const,
      style: 'normal' as const,
    },
    {
      name: 'OpenRunde',
      data: readAsset('src/assets/fonts/OpenRunde-Semibold.ttf'),
      weight: 600 as const,
      style: 'normal' as const,
    },
  ];
}

const mediumFont = parse(toArrayBuffer(readAsset('src/assets/fonts/OpenRunde-Medium.ttf')));

function measure(content: string, fontSize: number, letterSpacing: number): number {
  return mediumFont.getAdvanceWidth(content, fontSize) + letterSpacing * content.length;
}

export function balanceLines(
  content: string,
  maxWidth: number,
  fontSize: number,
  letterSpacing: number
): string {
  const words = content.split(' ');
  const widths = words.map((word) => measure(word, fontSize, letterSpacing));
  const space = measure(' ', fontSize, letterSpacing);
  const lineWidth = (from: number, to: number) =>
    widths.slice(from, to + 1).reduce((total, width) => total + width, 0) + space * (to - from);

  let lines = 1;
  let start = 0;
  for (let index = 0; index < words.length; index += 1) {
    if (lineWidth(start, index) > maxWidth && index > start) {
      lines += 1;
      start = index;
    }
  }

  let best: { widest: number; breaks: number[] } | null = null;
  const search = (from: number, remaining: number, breaks: number[], widest: number) => {
    if (remaining === 1) {
      const width = lineWidth(from, words.length - 1);
      if (width > maxWidth) return;
      const candidate = Math.max(widest, width);
      if (!best || candidate < best.widest) best = { widest: candidate, breaks };
      return;
    }
    for (let end = from; end < words.length - remaining + 1; end += 1) {
      const width = lineWidth(from, end);
      if (width > maxWidth) break;
      search(end + 1, remaining - 1, [...breaks, end + 1], Math.max(widest, width));
    }
  };
  search(0, lines, [], 0);
  if (!best) return content;

  const chosen = (best as { breaks: number[] }).breaks;
  const cuts = [0, ...chosen, words.length];
  return cuts
    .slice(0, -1)
    .map((cut, index) => words.slice(cut, cuts[index + 1]).join(' '))
    .join('\n');
}

function svgDataUri(markup: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(markup).toString('base64')}`;
}

function image(src: string, size: number, style: Style = {}): Node {
  return { type: 'img', props: { src, width: size, height: size, style } };
}

export interface AreaSeries {
  values: number[];
  color: string;
}

function curve(points: [number, number][]): string {
  let path = `M ${points[0]![0]} ${points[0]![1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index]!;
    const from = points[index]!;
    const to = points[index + 1]!;
    const next = points[index + 2] ?? to;
    const first = [from[0] + (to[0] - previous[0]) / 6, from[1] + (to[1] - previous[1]) / 6];
    const second = [to[0] - (next[0] - from[0]) / 6, to[1] - (next[1] - from[1]) / 6];
    path += ` C ${first[0]} ${first[1]} ${second[0]} ${second[1]} ${to[0]} ${to[1]}`;
  }
  return path;
}

export function areaChart(
  series: AreaSeries[],
  width: number,
  height: number,
  strokeWidth: number,
  fillOpacity: number
): Node {
  const all = series.flatMap((entry) => entry.values);
  const lowest = Math.min(...all);
  const highest = Math.max(...all);
  const span = highest - lowest || 1;
  const top = strokeWidth;
  const plot = height - top;

  const shapes = series
    .map((entry, index) => {
      const points = entry.values.map(
        (value, position) =>
          [(position / (entry.values.length - 1)) * width, top + plot - ((value - lowest) / span) * plot] as [
            number,
            number,
          ]
      );
      const line = curve(points);
      const filled = `${line} L ${width} ${height} L 0 ${height} Z`;
      return `<path d="${filled}" fill="url(#fill${index})" /><path d="${line}" fill="none" stroke="${entry.color}" stroke-width="${strokeWidth}" stroke-linecap="round" />`;
    })
    .join('');
  const gradients = series
    .map(
      (entry, index) =>
        `<linearGradient id="fill${index}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${entry.color}" stop-opacity="${fillOpacity}" /><stop offset="1" stop-color="${entry.color}" stop-opacity="0" /></linearGradient>`
    )
    .join('');
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none"><defs>${gradients}</defs>${shapes}</svg>`;
  return { type: 'img', props: { src: svgDataUri(markup), width, height, style: {} } };
}

export function logo(size: number, radius: number): Node {
  return image(svgDataUri(readAsset('public/buzzkit.svg').toString('utf8')), size, { borderRadius: radius });
}

export function icon(name: IconName, size: number, color: string): Node {
  const markup = ICON_PATHS[name]['3'] ?? Object.values(ICON_PATHS[name])[0] ?? '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">${markup.replaceAll('currentColor', color)}</svg>`;
  return image(svgDataUri(svg), size);
}

function hash(seed: string, salt: number): number {
  let value = salt;
  for (let index = 0; index < seed.length; index += 1) {
    value = Math.imul(value ^ seed.charCodeAt(index), 16777619) >>> 0;
  }
  return value;
}

export function pastelAvatar(
  seed: string,
  size: number,
  radius: number,
  variant: 'tile' | 'orb' = 'tile'
): Node {
  const [from, to] =
    variant === 'orb'
      ? (() => {
          const hue = ORB_HUES[hash(seed, 2166136261) % ORB_HUES.length]!;
          return [hue, hue] as [string, string];
        })()
      : TILE_PAIRS[hash(seed, 84696351) % TILE_PAIRS.length]!;
  const gradient =
    variant === 'orb'
      ? `radial-gradient(circle at 70% 75%, ${RAMPS[to]![1]}, ${RAMPS[from]![1]} 85%)`
      : `linear-gradient(135deg, ${RAMPS[from]![0]}, ${RAMPS[to]![1]})`;
  const highlight =
    variant === 'orb'
      ? 'radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 55%)'
      : 'radial-gradient(circle at 28% 22%, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0) 65%)';
  return element(
    'div',
    {
      display: 'flex',
      width: size,
      height: size,
      borderRadius: variant === 'orb' ? size / 2 : radius,
      backgroundImage: gradient,
      boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.09)',
      overflow: 'hidden',
    },
    [element('div', { width: size, height: size, backgroundImage: highlight })]
  );
}

export function text(content: string, style: Style = {}): Node {
  return element('span', { whiteSpace: 'nowrap', ...style }, content);
}

export function row(children: (Node | string)[], style: Style = {}): Node {
  return element('div', { display: 'flex', alignItems: 'center', ...style }, children);
}

export function column(children: (Node | string)[], style: Style = {}): Node {
  return element('div', { display: 'flex', flexDirection: 'column', ...style }, children);
}
