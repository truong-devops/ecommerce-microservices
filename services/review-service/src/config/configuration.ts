export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'review-service',
    env: process.env.APP_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3009),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1'
  },
  mongodb: {
    uri: process.env.MONGODB_URI
  },
  jwt: {
    access: {
      secret: process.env.JWT_ACCESS_SECRET
    }
  }
});
