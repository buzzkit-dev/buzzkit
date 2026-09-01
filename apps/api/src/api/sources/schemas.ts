import { BadRequestError } from '@buzzkit/api/libs/error';
import {
  lintSourceMapping,
  lintVerification,
  MAX_SOURCE_NAME,
  type SourceMapping,
  type Verification,
} from '@buzzkit/schema/sources';
import { t } from 'elysia';

export const SourceProviderSchema = t.String({ minLength: 1, maxLength: 40 });

export const CreateSourceSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: MAX_SOURCE_NAME }),
  provider: SourceProviderSchema,
  verification: t.Optional(t.Unknown()),
  mapping: t.Optional(t.Unknown()),
  secret: t.Optional(t.String({ minLength: 1, maxLength: 4096 })),
});

export const UpdateSourceSchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: MAX_SOURCE_NAME })),
  provider: t.Optional(SourceProviderSchema),
  verification: t.Optional(t.Unknown()),
  mapping: t.Optional(t.Unknown()),
  secret: t.Optional(t.String({ minLength: 1, maxLength: 4096 })),
  status: t.Optional(t.Union([t.Literal('active'), t.Literal('paused')])),
});

export const PreviewSchema = t.Object({
  payload: t.Unknown(),
  headers: t.Optional(t.Record(t.String(), t.String())),
  mapping: t.Optional(t.Unknown()),
});

export function assertMapping(raw: unknown): asserts raw is SourceMapping {
  const problems = lintSourceMapping(raw);
  if (problems.length > 0) {
    throw new BadRequestError(`mapping.${problems[0]!.path.join('.')}: ${problems[0]!.message}`, {
      code: 'invalid_mapping',
      param: 'mapping',
      details: { problems },
    });
  }
}

export function assertVerification(value: unknown): asserts value is Verification {
  const problems = lintVerification(value);
  if (problems.length > 0) {
    throw new BadRequestError(`verification.${problems[0]!.path.join('.')}: ${problems[0]!.message}`, {
      code: 'invalid_verification',
      param: 'verification',
      details: { problems },
    });
  }
}
