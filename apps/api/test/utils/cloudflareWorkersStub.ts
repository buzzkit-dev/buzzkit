export class WorkerEntrypoint {}

export class WorkflowEntrypoint {
  protected ctx: unknown;
  protected env: unknown;

  constructor(ctx: unknown, workerEnv: unknown) {
    this.ctx = ctx;
    this.env = workerEnv;
  }
}

export class DurableObject {}

export class RpcTarget {}

export const env = {};

export function waitUntil(): void {}
