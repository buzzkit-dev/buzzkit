import { DatabaseSync } from 'node:sqlite';
import { ActorStore } from '@buzzkit/api/actor/store';

export function createActorStore(): { store: ActorStore; database: DatabaseSync } {
  const database = new DatabaseSync(':memory:');
  const sql = <T>(strings: TemplateStringsArray, ...values: (string | number | boolean | null)[]): T[] => {
    const statement = strings.join('?');
    const parameters = values.map((value) => (typeof value === 'boolean' ? Number(value) : value));
    return database.prepare(statement).all(...parameters) as T[];
  };
  const store = new ActorStore(sql);
  store.migrate();
  return { store, database };
}
