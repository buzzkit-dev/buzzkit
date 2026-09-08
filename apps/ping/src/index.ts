import { app } from './modules';

export { DeviceState } from './device/state';

const compiled = app.compile();

export default { fetch: compiled.fetch };
