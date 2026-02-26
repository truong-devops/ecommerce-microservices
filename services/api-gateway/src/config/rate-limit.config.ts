export const rateLimitConfig = {
  ttl: Number(process.env.RATE_LIMIT_TTL ?? 60),
  limit: Number(process.env.RATE_LIMIT_LIMIT ?? 100)
};
