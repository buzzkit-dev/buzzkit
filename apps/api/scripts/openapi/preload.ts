import { plugin } from 'bun';
import * as agentsStub from '../../test/utils/agentsStub';
import * as workersStub from '../../test/utils/cloudflareWorkersStub';
import * as workflowsStub from '../../test/utils/cloudflareWorkflowsStub';

plugin({
  name: 'workers-stubs',
  setup(build) {
    build.module('cloudflare:workers', () => ({ exports: { ...workersStub }, loader: 'object' }));
    build.module('cloudflare:workflows', () => ({ exports: { ...workflowsStub }, loader: 'object' }));
    build.module('agents', () => ({ exports: { ...agentsStub }, loader: 'object' }));
  },
});
