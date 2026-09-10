import type { Node } from '../primitives';
import { actions } from './actions';
import { agents } from './agents';
import { apiKey } from './api-key';
import { dashboard } from './dashboard';
import { ledger } from './ledger';
import { liveActivity } from './live-activity';
import { notifications } from './notifications';
import { phone } from './phone';
import { preferences } from './preferences';
import { schedule } from './schedule';
import { segment } from './segment';
import { sources } from './sources';
import { tenants } from './tenants';
import type { Visual } from './types';
import { workflow } from './workflow';

export type { Visual } from './types';

const VISUALS: Record<Visual['kind'], () => Node> = {
  notifications,
  actions,
  liveActivity,
  agents,
  workflow,
  segment,
  preferences,
  ledger,
  schedule,
  sources,
  tenants,
  apiKey,
  dashboard,
  phone,
};

export function visual(entry: Visual): Node {
  return VISUALS[entry.kind]();
}
