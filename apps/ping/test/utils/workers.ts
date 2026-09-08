export const env = {} as Record<string, unknown>;

export class DurableObject {
  protected ctx: unknown;
  protected env: unknown;

  constructor(ctx: unknown, environment: unknown) {
    this.ctx = ctx;
    this.env = environment;
  }
}
