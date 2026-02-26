export function logInfo(message: string, context?: Record<string, unknown>): void {
  // Placeholder logger to keep shared utilities importable from day one.
  console.info(message, context ?? {});
}
