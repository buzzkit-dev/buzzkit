export function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^NonRetryableError: /, '');
}
