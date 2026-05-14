import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { Role } from '../../../common/constants/role.enum';
import { ProductVideoStatus } from '../entities/product-video-status.enum';
import { ProductStatus } from '../entities/product-status.enum';
import { ProductVideosService } from './product-videos.service';

const sellerUser = {
  userId: 'seller-1',
  email: 'seller@example.com',
  role: Role.SELLER,
  sessionId: 'session-1',
  jti: 'jti-1',
  tokenVersion: 1
};

describe('ProductVideosService', () => {
  function createService(overrides?: {
    products?: unknown[];
    existingVideo?: Record<string, unknown>;
    updatedVideo?: Record<string, unknown>;
  }) {
    const productsRepository = {
      findByIdsOrdered: jest.fn().mockResolvedValue(overrides?.products ?? [buildProduct()])
    };

    const productVideosRepository = {
      createVideo: jest.fn(async (payload: Record<string, unknown>) => buildVideo(payload)),
      findByVideoId: jest.fn().mockResolvedValue(overrides?.existingVideo ?? buildVideo()),
      updateByVideoId: jest.fn(async (_videoId: string, payload: Record<string, unknown>) => ({
        ...(overrides?.updatedVideo ?? overrides?.existingVideo ?? buildVideo()),
        ...payload,
        updatedAt: new Date('2026-05-15T00:00:00Z')
      })),
      listManaged: jest.fn(),
      listFeed: jest.fn(),
      incrementMetrics: jest.fn()
    };

    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'media.publicBaseUrl') {
          return 'http://localhost:12030/ecommerce-media';
        }
        if (key === 'video.reviewRequired') {
          return false;
        }
        return fallback;
      })
    };

    return {
      service: new ProductVideosService(configService as never, productVideosRepository as never, productsRepository as never),
      productVideosRepository,
      productsRepository
    };
  }

  it('rejects attaching products owned by another seller', async () => {
    const { service } = createService({
      products: [buildProduct({ sellerId: 'seller-2' })]
    });

    await expect(
      service.createVideo(sellerUser, {
        title: 'Demo shoppable video',
        products: [{ productId: 'product-1' }]
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects publish when media has not been confirmed', async () => {
    const { service } = createService({
      existingVideo: buildVideo({ mediaObjectKey: null, mimeType: null })
    });

    await expect(service.publishVideo(sellerUser, 'video-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('publishes a ready seller-owned video', async () => {
    const existingVideo = buildVideo({
      status: ProductVideoStatus.PROCESSING,
      mediaObjectKey: 'products/video/video-1/demo.mp4',
      mimeType: 'video/mp4'
    });
    const { service, productVideosRepository } = createService({ existingVideo });

    const result = await service.publishVideo(sellerUser, 'video-1');

    expect(productVideosRepository.updateByVideoId).toHaveBeenCalledWith(
      'video-1',
      expect.objectContaining({ status: ProductVideoStatus.PUBLISHED, hiddenAt: null })
    );
    expect(result.status).toBe(ProductVideoStatus.PUBLISHED);
  });
});

function buildProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'product-1',
    sellerId: 'seller-1',
    name: 'Demo Product',
    status: ProductStatus.ACTIVE,
    images: ['products/product/product-1/image.jpg'],
    minPrice: 100000,
    variants: [
      {
        sku: 'SKU-1',
        currency: 'VND',
        isDefault: true
      }
    ],
    ...overrides
  };
}

function buildVideo(overrides: Record<string, unknown> = {}) {
  return {
    videoId: 'video-1',
    sellerId: 'seller-1',
    title: 'Demo shoppable video',
    description: null,
    status: ProductVideoStatus.DRAFT,
    mediaObjectKey: 'products/video/video-1/demo.mp4',
    mediaUrl: null,
    thumbnailObjectKey: null,
    thumbnailUrl: null,
    mimeType: 'video/mp4',
    sizeBytes: 1024,
    durationSec: 30,
    products: [
      {
        productId: 'product-1',
        sku: 'SKU-1',
        nameSnapshot: 'Demo Product',
        imageSnapshot: 'products/product/product-1/image.jpg',
        priceSnapshot: 100000,
        currencySnapshot: 'VND',
        statusSnapshot: ProductStatus.ACTIVE,
        sortOrder: 1,
        tagPosition: null
      }
    ],
    moderation: { policyFlags: [] },
    metricsSnapshot: {
      viewStartedCount: 0,
      qualifiedViewCount: 0,
      productClickCount: 0,
      addToCartCount: 0,
      ctr: 0,
      addToCartRate: 0,
      lastAggregatedAt: null
    },
    publishedAt: null,
    hiddenAt: null,
    archivedAt: null,
    createdAt: new Date('2026-05-15T00:00:00Z'),
    updatedAt: new Date('2026-05-15T00:00:00Z'),
    ...overrides
  };
}
