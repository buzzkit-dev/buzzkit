import type { FaqItem } from '../content';
import { apns } from './apns';
import { braze } from './braze';
import { customerIo } from './customer-io';
import { firebaseCloudMessaging } from './firebase-cloud-messaging';
import { knock } from './knock';
import { novu } from './novu';
import { onesignal } from './onesignal';

export type CompareCell = boolean | string;

interface ComparisonRow {
  capability: string;
  buzzkit: CompareCell;
  competitor: CompareCell;
}

interface ComparisonGroup {
  group: string;
  rows: ComparisonRow[];
}

export interface ComparePage {
  slug: string;
  competitor: string;
  short?: string;
  summary: string;
  blurb: string;
  title: string;
  continuation: string;
  intro: string;
  groups: ComparisonGroup[];
  chooseBuzzkit: string[];
  chooseCompetitor: string[];
  faq: FaqItem[];
}

export const comparisons: ComparePage[] = [
  onesignal,
  novu,
  firebaseCloudMessaging,
  apns,
  knock,
  customerIo,
  braze,
];

export function findComparison(slug: string): ComparePage {
  const comparison = comparisons.find((entry) => entry.slug === slug);
  if (!comparison) throw new Error(`Unknown comparison page: ${slug}`);
  return comparison;
}
