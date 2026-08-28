import type { CHANNELS } from './constants';

export type Duration = `${number}${'m' | 'h' | 'd'}`;

export type Scalar = string | number | boolean | null;

export type Comparators = {
  eq?: Scalar;
  neq?: Scalar;
  gt?: number | string;
  gte?: number | string;
  lt?: number | string;
  lte?: number | string;
  in?: Scalar[];
  contains?: string;
  exists?: boolean;
};

export type NumericComparators = {
  eq?: number;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
};

export type RefCondition = { ref: string } & Comparators;

export type CountCondition = { count: string; within?: Duration } & NumericComparators;

export type NeverCondition = { never: string; within?: Duration };

export type LastSeenCondition = { lastSeen: { within?: Duration; olderThan?: Duration } };

export type ChannelCondition = { channel: (typeof CHANNELS)[number] };

export type Condition = RefCondition | CountCondition | NeverCondition | LastSeenCondition | ChannelCondition;

export type Expression = { all: Expression[] } | { any: Expression[] } | { not: Expression } | Condition;

export type ExpressionKind = 'all' | 'any' | 'not' | 'ref' | 'count' | 'never' | 'lastSeen' | 'channel';
