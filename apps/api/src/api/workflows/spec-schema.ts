import {
  CONCURRENCY_MODES,
  DELIVERY_MODES,
  FETCH_ERROR_MODES,
  FETCH_METHODS,
  FETCH_TIMEOUT_PATTERN,
  MAX_BRANCH_CASES,
  MAX_EXPECTED_STATUSES,
  MAX_FETCH_HEADERS,
  MAX_RESET_EVENTS,
  MAX_STEPS,
  SEGMENT_SLUG_PATTERN,
  SEND_CHANNELS,
  SINCE_ANCHORS,
  STEP_NAME_MAX_LENGTH,
  STEP_NAME_PATTERN,
  TRIGGER_SOURCES,
  VAR_NAME_PATTERN,
  WALL_TIME_PATTERN,
} from '@buzzkit/schema/workflows';
import { type Static, Type } from '@sinclair/typebox';
import {
  countConditionSchema,
  DurationSchema,
  EventNameSchema,
  expressionSchema,
  NeverConditionSchema,
  RefConditionSchema,
} from '../segments/expression-schema';

const StepNameSchema = Type.String({ pattern: STEP_NAME_PATTERN.source, maxLength: STEP_NAME_MAX_LENGTH });

const TimezoneSchema = Type.String({ minLength: 1, maxLength: 64 });

const ScalarSchema = Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]);

const SinceSchema = Type.Union(SINCE_ANCHORS.map((anchor) => Type.Literal(anchor)));

export const RunCountConditionSchema = countConditionSchema({ since: Type.Optional(SinceSchema) });

export const OccurredConditionSchema = Type.Object(
  { occurred: EventNameSchema, within: Type.Optional(DurationSchema), since: Type.Optional(SinceSchema) },
  { additionalProperties: false }
);

export const OpenedConditionSchema = Type.Object({ opened: StepNameSchema }, { additionalProperties: false });

export const DeliveredConditionSchema = Type.Object(
  { delivered: StepNameSchema },
  { additionalProperties: false }
);

export const WorkflowConditionSchema = Type.Union([
  RefConditionSchema,
  RunCountConditionSchema,
  NeverConditionSchema,
  OccurredConditionSchema,
  OpenedConditionSchema,
  DeliveredConditionSchema,
]);

export const WorkflowExpressionSchema = expressionSchema(WorkflowConditionSchema, 'WorkflowExpression');

export const MomentSchema = Type.Object(
  {
    delay: Type.Optional(DurationSchema),
    time: Type.Optional(Type.String({ pattern: WALL_TIME_PATTERN.source })),
    timezone: Type.Optional(TimezoneSchema),
  },
  { additionalProperties: false }
);

const TimeoutSchema = Type.Union([DurationSchema, MomentSchema]);

export const EventTriggerSchema = Type.Object(
  {
    event: EventNameSchema,
    sources: Type.Optional(
      Type.Array(Type.Union(TRIGGER_SOURCES.map((source) => Type.Literal(source))), { minItems: 1 })
    ),
    where: Type.Optional(WorkflowExpressionSchema),
  },
  { additionalProperties: false }
);

export const ScheduleSchema = Type.Union([
  Type.Object({ cron: Type.String({ minLength: 9, maxLength: 100 }) }, { additionalProperties: false }),
  Type.Object({ daily: Type.String({ pattern: WALL_TIME_PATTERN.source }) }, { additionalProperties: false }),
]);

export const ScheduleTriggerSchema = Type.Object(
  {
    schedule: ScheduleSchema,
    timezone: TimezoneSchema,
    segment: Type.Optional(Type.String({ pattern: SEGMENT_SLUG_PATTERN.source, maxLength: 64 })),
    where: Type.Optional(WorkflowExpressionSchema),
  },
  { additionalProperties: false }
);

export const TriggerSchema = Type.Union([EventTriggerSchema, ScheduleTriggerSchema]);

export const CancelRuleSchema = Type.Object(
  { event: EventNameSchema, where: Type.Optional(WorkflowExpressionSchema) },
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
    skipIfSentWithin: Type.Optional(DurationSchema),
  },
  { additionalProperties: false }
);

export const FetchRequestSchema = Type.Object(
  {
    method: Type.Optional(Type.Union(FETCH_METHODS.map((method) => Type.Literal(method)))),
    url: Type.String({ minLength: 9, maxLength: 2000 }),
    headers: Type.Optional(
      Type.Record(Type.String(), Type.String({ maxLength: 4096 }), { maxProperties: MAX_FETCH_HEADERS })
    ),
    body: Type.Optional(
      Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.String({ maxLength: 65536 })])
    ),
    timeout: Type.Optional(Type.String({ pattern: FETCH_TIMEOUT_PATTERN.source })),
    expect: Type.Optional(
      Type.Object(
        {
          status: Type.Array(Type.Integer({ minimum: 100, maximum: 599 }), {
            minItems: 1,
            maxItems: MAX_EXPECTED_STATUSES,
          }),
        },
        { additionalProperties: false }
      )
    ),
    as: Type.Optional(Type.String({ pattern: VAR_NAME_PATTERN.source })),
    onError: Type.Optional(Type.Union(FETCH_ERROR_MODES.map((mode) => Type.Literal(mode)))),
  },
  { additionalProperties: false }
);

export const SetWriteSchema = Type.Union([
  Type.Object(
    { attribute: Type.String({ minLength: 1, maxLength: 64 }), value: ScalarSchema },
    { additionalProperties: false }
  ),
  Type.Object(
    { var: Type.String({ pattern: VAR_NAME_PATTERN.source }), value: ScalarSchema },
    { additionalProperties: false }
  ),
]);

export const StepSchema = Type.Recursive(
  (self) =>
    Type.Union([
      Type.Object({ name: StepNameSchema, wait: DurationSchema }, { additionalProperties: false }),
      Type.Object({ name: StepNameSchema, waitUntil: MomentSchema }, { additionalProperties: false }),
      Type.Object(
        {
          name: StepNameSchema,
          waitFor: Type.Object(
            {
              event: EventNameSchema,
              where: Type.Optional(WorkflowExpressionSchema),
              settleFor: Type.Optional(DurationSchema),
              resetOn: Type.Optional(
                Type.Array(EventNameSchema, { minItems: 1, maxItems: MAX_RESET_EVENTS })
              ),
              timeout: TimeoutSchema,
            },
            { additionalProperties: false }
          ),
        },
        { additionalProperties: false }
      ),
      Type.Object(
        {
          name: StepNameSchema,
          branch: Type.Array(
            Type.Object(
              {
                name: StepNameSchema,
                when: Type.Optional(WorkflowExpressionSchema),
                steps: Type.Array(self, { maxItems: MAX_STEPS }),
              },
              { additionalProperties: false }
            ),
            { minItems: 1, maxItems: MAX_BRANCH_CASES }
          ),
        },
        { additionalProperties: false }
      ),
      Type.Object({ name: StepNameSchema, fetch: FetchRequestSchema }, { additionalProperties: false }),
      Type.Object({ name: StepNameSchema, set: SetWriteSchema }, { additionalProperties: false }),
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
    defaultTimezone: Type.Optional(TimezoneSchema),
    steps: Type.Array(StepSchema, { minItems: 1, maxItems: MAX_STEPS }),
  },
  { additionalProperties: false }
);

export type WorkflowSpecInput = Static<typeof WorkflowSpecSchema>;
