import { type Static, Type } from '@sinclair/typebox';
import { DURATION_PATTERN, EVENT_NAME_PATTERN } from '../expressions/constants';
import { ExpressionSchema } from '../expressions/schema';
import {
  CONCURRENCY_MODES,
  DELIVERY_MODES,
  MAX_STEPS,
  SEND_CHANNELS,
  STEP_NAME_MAX_LENGTH,
  STEP_NAME_PATTERN,
  TRIGGER_SOURCES,
  WALL_TIME_PATTERN,
} from './constants';

const DurationSchema = Type.String({ pattern: DURATION_PATTERN.source });

const EventNameSchema = Type.String({ pattern: EVENT_NAME_PATTERN.source });

const StepNameSchema = Type.String({ pattern: STEP_NAME_PATTERN.source, maxLength: STEP_NAME_MAX_LENGTH });

export const AnchorSchema = Type.Object(
  {
    after: Type.String({ pattern: '^(trigger|steps\\.[a-z0-9]+(?:-[a-z0-9]+)*)$' }),
    plus: Type.Optional(DurationSchema),
    at: Type.Optional(Type.String({ pattern: WALL_TIME_PATTERN.source })),
    timezone: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  },
  { additionalProperties: false }
);

export const TriggerSchema = Type.Object(
  {
    event: EventNameSchema,
    sources: Type.Optional(
      Type.Array(Type.Union(TRIGGER_SOURCES.map((source) => Type.Literal(source))), { minItems: 1 })
    ),
    where: Type.Optional(ExpressionSchema),
  },
  { additionalProperties: false }
);

export const CancelRuleSchema = Type.Object(
  { event: EventNameSchema, where: Type.Optional(ExpressionSchema) },
  { additionalProperties: false }
);

export const SendPayloadSchema = Type.Object(
  {
    channel: Type.Optional(Type.Union(SEND_CHANNELS.map((channel) => Type.Literal(channel)))),
    topic: Type.Optional(Type.String({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', minLength: 3, maxLength: 48 })),
    title: Type.Optional(Type.String({ maxLength: 500 })),
    body: Type.Optional(Type.String({ maxLength: 4000 })),
    subtitle: Type.Optional(Type.String({ maxLength: 500 })),
    data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    deliver: Type.Optional(Type.Union(DELIVERY_MODES.map((mode) => Type.Literal(mode)))),
  },
  { additionalProperties: false }
);

export const StepSchema = Type.Recursive(
  (self) =>
    Type.Union([
      Type.Object({ name: StepNameSchema, wait: DurationSchema }, { additionalProperties: false }),
      Type.Object({ name: StepNameSchema, waitUntil: AnchorSchema }, { additionalProperties: false }),
      Type.Object(
        {
          name: StepNameSchema,
          waitFor: Type.Object(
            {
              event: EventNameSchema,
              where: Type.Optional(ExpressionSchema),
              until: Type.Union([AnchorSchema, DurationSchema]),
            },
            { additionalProperties: false }
          ),
        },
        { additionalProperties: false }
      ),
      Type.Object(
        {
          name: StepNameSchema,
          branch: Type.Object(
            {
              if: ExpressionSchema,
              then: Type.Array(self, { maxItems: MAX_STEPS }),
              else: Type.Optional(Type.Array(self, { maxItems: MAX_STEPS })),
            },
            { additionalProperties: false }
          ),
        },
        { additionalProperties: false }
      ),
      Type.Object({ name: StepNameSchema, send: SendPayloadSchema }, { additionalProperties: false }),
      Type.Object({ exit: Type.Literal(true) }, { additionalProperties: false }),
    ]),
  { $id: 'WorkflowStep' }
);

export const WorkflowSpecSchema = Type.Object(
  {
    trigger: TriggerSchema,
    concurrency: Type.Optional(Type.Union(CONCURRENCY_MODES.map((mode) => Type.Literal(mode)))),
    cancelOn: Type.Optional(Type.Array(CancelRuleSchema, { maxItems: 10 })),
    steps: Type.Array(StepSchema, { minItems: 1, maxItems: MAX_STEPS }),
  },
  { additionalProperties: false }
);

export type WorkflowSpecInput = Static<typeof WorkflowSpecSchema>;
