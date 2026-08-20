import { pgEnum } from 'drizzle-orm/pg-core';

export const channel = pgEnum('channel', ['push', 'email']);
