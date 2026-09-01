import { SECRET_NAME_PATTERN } from '@buzzkit/schema/workflows';
import { t } from 'elysia';
import { MAX_SECRET_BYTES } from './constants';

export const SecretNameSchema = t.String({ pattern: SECRET_NAME_PATTERN.source, maxLength: 48 });

export const SecretNameParamsSchema = t.Object({ name: SecretNameSchema });

export const SecretValueSchema = t.Object({ value: t.String({ minLength: 1, maxLength: MAX_SECRET_BYTES }) });
