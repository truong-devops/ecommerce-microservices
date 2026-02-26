export function serviceLog(message: string, context?: Record<string, unknown>): void {
  console.log(message, context ?? {});
}
