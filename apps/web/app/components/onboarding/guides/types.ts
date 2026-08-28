import type { ProviderId } from '@/app/components/onboarding/catalog';

type TextField = {
  kind: 'text';
  name: string;
  label: string;
  placeholder: string;
  hint?: string;
  secret?: boolean;
  uppercase?: boolean;
  length?: number;
  pattern?: RegExp;
  invalidMessage?: string;
};

type FileField = {
  kind: 'file';
  name: string;
  label: string;
  accept: string;
  prompt: string;
  hint?: string;
  parse: (text: string) => { ok: true; summary: string } | { ok: false; error: string };
  derive?: (file: { name: string; text: string }) => Record<string, string>;
};

export type GuideField = TextField | FileField;

export type GuideStepDefinition = {
  id: string;
  title: string;
  description: string;
  link?: { label: string; href: string };
  note?: string;
  fields?: GuideField[];
  skipWhenDerived?: boolean;
  illustration: () => React.ReactNode;
};

export type GuideDefinition = {
  provider: ProviderId;
  title: string;
  description: string;
  docs: { label: string; href: string };
  connectLabel: string;
  steps: GuideStepDefinition[];
};
