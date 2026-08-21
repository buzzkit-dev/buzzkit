import { trace } from '@buzzkit/api/libs/telemetry';
import { type Db, eq, tables } from '@buzzkit/database';

export type User = typeof tables.auth.user.$inferSelect;

export function serializeUser(user: Pick<User, 'id' | 'name' | 'email' | 'image'>) {
  return { id: user.id, name: user.name, email: user.email, image: user.image };
}

export async function updateProfile(db: Db, userId: string, patch: { name: string }): Promise<User> {
  const [updated] = await trace(
    'profile.update',
    async () =>
      await db
        .update(tables.auth.user)
        .set({ name: patch.name })
        .where(eq(tables.auth.user.id, userId))
        .returning()
  );
  return updated!;
}
