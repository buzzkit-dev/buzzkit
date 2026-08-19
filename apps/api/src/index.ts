import { app } from './modules';

const compiled = app.compile();

export default {
  fetch: compiled.fetch,
} satisfies ExportedHandler<Env>;
