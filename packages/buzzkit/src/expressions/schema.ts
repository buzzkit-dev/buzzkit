import { type Static, type TSchema, Type } from '@sinclair/typebox';
import {
  CHANNELS,
  DURATION_PATTERN,
  EVENT_NAME_PATTERN,
  MAX_EXPRESSION_DEPTH,
  MAX_IN_VALUES,
  REF_PATTERN,
} from './constants';

const DurationSchema = Type.String({ pattern: DURATION_PATTERN.source });

const ScalarSchema = Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]);

const OrderedSchema = Type.Union([Type.Number(), Type.String()]);

export const RefConditionSchema = Type.Object(
  {
    ref: Type.String({ pattern: REF_PATTERN.source }),
    eq: Type.Optional(ScalarSchema),
    neq: Type.Optional(ScalarSchema),
    gt: Type.Optional(OrderedSchema),
    gte: Type.Optional(OrderedSchema),
    lt: Type.Optional(OrderedSchema),
    lte: Type.Optional(OrderedSchema),
    in: Type.Optional(Type.Array(ScalarSchema, { minItems: 1, maxItems: MAX_IN_VALUES })),
    contains: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    exists: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false }
);

export const CountConditionSchema = Type.Object(
  {
    count: Type.String({ pattern: EVENT_NAME_PATTERN.source }),
    within: Type.Optional(DurationSchema),
    eq: Type.Optional(Type.Integer({ minimum: 0 })),
    gt: Type.Optional(Type.Integer({ minimum: 0 })),
    gte: Type.Optional(Type.Integer({ minimum: 0 })),
    lt: Type.Optional(Type.Integer({ minimum: 0 })),
    lte: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false }
);

export const NeverConditionSchema = Type.Object(
  {
    never: Type.String({ pattern: EVENT_NAME_PATTERN.source }),
    within: Type.Optional(DurationSchema),
  },
  { additionalProperties: false }
);

export const LastSeenConditionSchema = Type.Object(
  {
    lastSeen: Type.Object(
      { within: Type.Optional(DurationSchema), olderThan: Type.Optional(DurationSchema) },
      { additionalProperties: false }
    ),
  },
  { additionalProperties: false }
);

export const ChannelConditionSchema = Type.Object(
  { channel: Type.Union(CHANNELS.map((channel) => Type.Literal(channel))) },
  { additionalProperties: false }
);

export const ConditionSchema = Type.Union([
  RefConditionSchema,
  CountConditionSchema,
  NeverConditionSchema,
  LastSeenConditionSchema,
  ChannelConditionSchema,
]);

export const ExpressionSchema: TSchema = Type.Recursive(
  (self) =>
    Type.Union([
      Type.Object(
        { all: Type.Array(self, { minItems: 1, maxItems: MAX_EXPRESSION_DEPTH * 8 }) },
        { additionalProperties: false }
      ),
      Type.Object(
        { any: Type.Array(self, { minItems: 1, maxItems: MAX_EXPRESSION_DEPTH * 8 }) },
        { additionalProperties: false }
      ),
      Type.Object({ not: self }, { additionalProperties: false }),
      ConditionSchema,
    ]),
  { $id: 'Expression' }
);

export type ConditionInput = Static<typeof ConditionSchema>;
