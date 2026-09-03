import type { FaqItem } from '../content';
import { delivery } from './delivery';
import { iosSdk } from './ios-sdk';
import { liveActivities } from './live-activities';
import { multiTenancy } from './multi-tenancy';
import { scheduling } from './scheduling';
import { segments } from './segments';
import { sending } from './sending';
import { sources } from './sources';
import { topics } from './topics';
import { workflows } from './workflows';

export type VignetteKind =
  | 'send'
  | 'workflow'
  | 'segment'
  | 'schedule'
  | 'preferences'
  | 'sources'
  | 'activity'
  | 'delivery'
  | 'ios'
  | 'tenants';

interface FeatureSection {
  title: string;
  text: string;
  code?: string;
  points?: string[];
}

export type FeatureGroup = 'Send' | 'Automate' | 'Platform' | 'SDKs';

const FEATURE_GROUPS: FeatureGroup[] = ['Send', 'Automate', 'Platform', 'SDKs'];

interface UpcomingFeature {
  name: string;
  icon: string;
  group: FeatureGroup;
  blurb: string;
}

const upcoming: UpcomingFeature[] = [
  {
    name: 'Android SDK',
    icon: 'IconGooglePlayStoreFilled',
    group: 'SDKs',
    blurb: 'The same SDK for Android',
  },
];

export interface FeaturePage {
  slug: string;
  name: string;
  icon: string;
  group: FeatureGroup;
  summary: string;
  blurb: string;
  title: string;
  continuation: string;
  intro: string;
  vignette: VignetteKind;
  sections: FeatureSection[];
  capabilities: { title: string; text: string }[];
  faq: FaqItem[];
  related: string[];
}

export const features: FeaturePage[] = [
  sending,
  workflows,
  segments,
  scheduling,
  topics,
  sources,
  delivery,
  liveActivities,
  iosSdk,
  multiTenancy,
];

export interface FeatureGroupEntries {
  label: FeatureGroup;
  features: FeaturePage[];
  upcoming: UpcomingFeature[];
}

export function findFeature(slug: string): FeaturePage {
  const feature = features.find((entry) => entry.slug === slug);
  if (!feature) throw new Error(`Unknown feature page: ${slug}`);
  return feature;
}

export function listFeatureGroups(): FeatureGroupEntries[] {
  return FEATURE_GROUPS.map((group) => ({
    label: group,
    features: features.filter((feature) => feature.group === group),
    upcoming: upcoming.filter((feature) => feature.group === group),
  }));
}
