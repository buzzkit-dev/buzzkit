import { bigint, pgEnum, timestamp } from 'drizzle-orm/pg-core';

export const channel = pgEnum('channel', ['push', 'email']);

export const provider = pgEnum('provider', ['apns', 'fcm', 'resend']);

export const environment = pgEnum('environment', ['production', 'sandbox']);

export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const createdAt = () => timestamptz('created_at').notNull().defaultNow();

export const updatedAt = () =>
  timestamptz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const deletedAt = () => timestamptz('deleted_at');

export const bigId = () => bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();

export const bigRef = (name: string) => bigint(name, { mode: 'number' });
