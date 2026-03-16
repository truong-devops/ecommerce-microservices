export const grpcConfig = {
  url: process.env.GRPC_URL ?? '0.0.0.0:50051',
  package: process.env.GRPC_PACKAGE ?? 'ecommerce'
};
