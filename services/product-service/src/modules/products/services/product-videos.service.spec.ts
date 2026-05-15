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
    feedItems?: Record<string, unknown>[];
    redisClient?: {
      get?: jest.Mock;
      setex?: jest.Mock;
      sadd?: jest.Mock;
      smembers?: jest.Mock;
      del?: jest.Mock;
    };
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
      listFeed: jest.fn().mockResolvedValue({
        items: overrides?.feedItems ?? [buildVideo({ status: ProductVideoStatus.PUBLISHED, publishedAt: new Date('2026-05-15T00:00:00Z') })],
        totalItems: overrides?.feedItems?.length ?? 1
      }),
      incrementMetrics: jest.fn(),
      incrementMetricsOnce: jest.fn()
    };

    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'media.publicBaseUrl') {
          return 'http://localhost:12030/ecommerce-media';
        }
        return fallback;
      })
    };
    const productEventsPublisherService = {
      publishVideoAnalyticsEvent: jest.fn()
    };
    const redisService = overrides?.redisClient
      ? {
          getClient: jest.fn(() => overrides.redisClient)
        }
      : undefined;

    return {
      service: new ProductVideosService(
        configService as never,
        productVideosRepository as never,
        productsRepository as never,
        productEventsPublisherService as never,
        redisService as never
      ),
      productVideosRepository,
      productsRepository,
      productEventsPublisherService,
      redisService
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

  it('rejects seller direct publish because videos require moderation', async () => {
    const { service } = createService({
      existingVideo: buildVideo({
        status: ProductVideoStatus.PROCESSING,
        mediaObjectKey: 'products/video/video-1/demo.mp4',
        mimeType: 'video/mp4'
      })
    });

    await expect(service.publishVideo(sellerUser, 'video-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects submit review when media has not been confirmed', async () => {
    const { service } = createService({
      existingVideo: buildVideo({ mediaObjectKey: null, mimeType: null })
    });

    await expect(service.submitReview(sellerUser, 'video-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('submits a ready seller-owned video to moderation', async () => {
    const existingVideo = buildVideo({
      status: ProductVideoStatus.PROCESSING,
      mediaObjectKey: 'products/video/video-1/demo.mp4',
      mimeType: 'video/mp4'
    });
    const { service, productVideosRepository } = createService({ existingVideo });

    const result = await service.submitReview(sellerUser, 'video-1');

    expect(productVideosRepository.updateByVideoId).toHaveBeenCalledWith(
      'video-1',
      expect.objectContaining({
        status: ProductVideoStatus.REVIEW_PENDING,
        moderation: expect.objectContaining({ submittedAt: expect.any(Date) })
      })
    );
    expect(result.status).toBe(ProductVideoStatus.REVIEW_PENDING);
  });

  it('rejects confirming video media larger than 50MB', async () => {
    const { service } = createService();

    await expect(
      service.confirmMedia(sellerUser, 'video-1', {
        mediaObjectKey: 'products/video/video-1/large.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 50 * 1024 * 1024 + 1,
        durationSec: 30
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects moderation access from seller role', async () => {
    const { service } = createService();

    await expect(service.listReviewQueue(sellerUser, { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('approves a ready video from moderator role', async () => {
    const moderatorUser = { ...sellerUser, userId: 'moderator-1', role: Role.MODERATOR };
    const { service, productVideosRepository } = createService({
      existingVideo: buildVideo({ status: ProductVideoStatus.REVIEW_PENDING })
    });

    const result = await service.approveVideo(moderatorUser, 'video-1');

    expect(productVideosRepository.updateByVideoId).toHaveBeenCalledWith(
      'video-1',
      expect.objectContaining({
        status: ProductVideoStatus.PUBLISHED,
        hiddenAt: null,
        moderation: expect.objectContaining({ reviewedBy: 'moderator-1' })
      })
    );
    expect(result.status).toBe(ProductVideoStatus.PUBLISHED);
  });

  it('deduplicates tracked video events by client event id', async () => {
    const { service, productVideosRepository, productEventsPublisherService } = createService({
      existingVideo: buildVideo({
        status: ProductVideoStatus.PUBLISHED,
        publishedAt: new Date('2026-05-15T00:00:00Z')
      })
    });
    productVideosRepository.incrementMetricsOnce.mockResolvedValue(true);

    await service.trackEvent('video-1', 'view-qualified', {
      clientEventId: 'event-1',
      anonymousSessionId: 'session-1',
      watchTimeSec: 5
    });

    expect(productVideosRepository.incrementMetricsOnce).toHaveBeenCalledWith('video-1', 'view-qualified:event-1', {
      qualifiedViewCount: 1
    });
    expect(productEventsPublisherService.publishVideoAnalyticsEvent).toHaveBeenCalledWith(
      'video.view_qualified',
      expect.objectContaining({
        videoId: 'video-1',
        sellerId: 'seller-1',
        clientEventId: 'event-1'
      }),
      'view-qualified:event-1'
    );
  });

  it('serves public feed from Redis cache when available', async () => {
    const cachedFeed = {
      items: [
        {
          videoId: 'cached-video',
          sellerId: 'seller-1',
          title: 'Cached video',
          description: null,
          status: ProductVideoStatus.PUBLISHED,
          mediaObjectKey: null,
          mediaUrl: 'http://localhost:12030/ecommerce-media/video.mp4',
          thumbnailObjectKey: null,
          thumbnailUrl: null,
          mimeType: 'video/mp4',
          sizeBytes: 1024,
          durationSec: 30,
          products: [],
          seller: { sellerId: 'seller-1', sellerCode: 'SEL0000001', shopName: 'Shop SEL0000001' },
          metrics: {
            viewStartedCount: 0,
            qualifiedViewCount: 0,
            productClickCount: 0,
            addToCartCount: 0,
            ctr: 0,
            addToCartRate: 0,
            lastAggregatedAt: null
          },
          publishedAt: '2026-05-15T00:00:00.000Z',
          hiddenAt: null,
          archivedAt: null,
          createdAt: '2026-05-15T00:00:00.000Z',
          updatedAt: '2026-05-15T00:00:00.000Z'
        }
      ],
      pagination: { page: 1, pageSize: 12, totalItems: 1, totalPages: 1 }
    };
    const redisClient = {
      get: jest.fn().mockResolvedValue(JSON.stringify(cachedFeed)),
      setex: jest.fn(),
      sadd: jest.fn(),
      smembers: jest.fn(),
      del: jest.fn()
    };
    const { service, productVideosRepository } = createService({ redisClient });

    const result = await service.listFeed({ page: 1, pageSize: 12 });

    expect(result).toEqual(cachedFeed);
    expect(productVideosRepository.listFeed).not.toHaveBeenCalled();
  });

  it('invalidates public feed cache when a video is approved', async () => {
    const moderatorUser = { ...sellerUser, userId: 'moderator-1', role: Role.MODERATOR };
    const redisClient = {
      get: jest.fn(),
      setex: jest.fn(),
      sadd: jest.fn(),
      smembers: jest.fn().mockResolvedValue(['product-videos:feed:v1:page=1&pageSize=12']),
      del: jest.fn()
    };
    const { service } = createService({
      existingVideo: buildVideo({ status: ProductVideoStatus.REVIEW_PENDING }),
      redisClient
    });

    await service.approveVideo(moderatorUser, 'video-1');

    expect(redisClient.del).toHaveBeenCalledWith('product-videos:feed:v1:page=1&pageSize=12');
    expect(redisClient.del).toHaveBeenCalledWith('product-videos:feed:v1:keys');
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
    recentEventKeys: [],
    publishedAt: null,
    hiddenAt: null,
    archivedAt: null,
    createdAt: new Date('2026-05-15T00:00:00Z'),
    updatedAt: new Date('2026-05-15T00:00:00Z'),
    ...overrides
  };
}
