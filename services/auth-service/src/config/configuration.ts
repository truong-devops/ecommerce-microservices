export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'auth-service',
    env: process.env.APP_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3001),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1'
  },
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true'
  },
  redis: {
    url: process.env.REDIS_URL
  },
  jwt: {
    access: {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '8h'
    },
    refresh: {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '45d'
    },
    mfa: {
      secret: process.env.JWT_MFA_SECRET,
      expiresIn: process.env.JWT_MFA_EXPIRES_IN ?? '10m'
    }
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
      scopes: (process.env.GOOGLE_OAUTH_SCOPES ?? 'openid email profile').split(/\s+/).filter(Boolean)
    },
    stateTtlSeconds: Number(process.env.OAUTH_STATE_TTL_SECONDS ?? 600),
    loginTicketTtlSeconds: Number(process.env.OAUTH_LOGIN_TICKET_TTL_SECONDS ?? 120),
    appBaseUrls: {
      buyerWeb: process.env.BUYER_WEB_BASE_URL ?? 'http://localhost:8888',
      seller: process.env.SELLER_WEB_BASE_URL ?? 'http://localhost:6789',
      moderator: process.env.MODERATOR_WEB_BASE_URL ?? 'http://localhost:1111'
    },
    buyerMobileCallbackUrl: process.env.BUYER_MOBILE_OAUTH_CALLBACK_URL ?? 'dtcommercebuyer://auth/google/callback'
  },
  security: {
    refreshTokenPepper: process.env.REFRESH_TOKEN_PEPPER,
    bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 12),
    passwordMinLength: Number(process.env.PASSWORD_MIN_LENGTH ?? 10),
    requireEmailVerification: process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === 'true',
    emailVerifyTokenTtlMinutes: Number(process.env.EMAIL_VERIFY_TOKEN_TTL_MINUTES ?? 60),
    resetPasswordTokenTtlMinutes: Number(process.env.RESET_PASSWORD_TOKEN_TTL_MINUTES ?? 30)
  },
  kafka: {
    enabled: process.env.KAFKA_ENABLED === 'true',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((value) => value.trim()),
    userEventsTopic: process.env.USER_EVENTS_TOPIC ?? 'user.events',
    notificationEventsTopic: process.env.NOTIFICATION_EVENTS_TOPIC ?? 'notification.events',
    auditEventsTopic: process.env.AUDIT_EVENTS_TOPIC ?? 'audit.events'
  }
});
