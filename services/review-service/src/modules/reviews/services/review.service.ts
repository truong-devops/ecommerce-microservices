import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { Role } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { CreateReviewDto, ListReviewsDto, ModerateReviewDto, ReplyReviewDto, UpdateReviewDto } from '../dto';
import { ReviewDocument } from '../entities/review.entity';
import { ReviewStatus } from '../enums/review-status.enum';
import { ReviewRepository } from '../repositories/review.repository';

const MODERATOR_ROLES: Role[] = [Role.ADMIN, Role.SUPPORT, Role.SUPER_ADMIN];
const REPLY_ROLES: Role[] = [Role.SELLER, Role.ADMIN, Role.SUPPORT, Role.SUPER_ADMIN];

@Injectable()
export class ReviewService {
  constructor(private readonly reviewRepository: ReviewRepository) {}

  async createReview(user: AuthenticatedUserContext, dto: CreateReviewDto): Promise<Record<string, unknown>> {
    this.assertRole(user, [Role.CUSTOMER]);

    const existing = await this.reviewRepository.findActiveDuplicate(dto.orderId, dto.productId, user.userId);
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.REVIEW_ALREADY_EXISTS,
        message: 'Review already exists for this order and product'
      });
    }

    const review = await this.reviewRepository.create({
      orderId: dto.orderId,
      productId: dto.productId,
      sellerId: dto.sellerId,
      buyerId: user.userId,
      rating: dto.rating,
      title: dto.title?.trim() || undefined,
      content: dto.content.trim(),
      images: dto.images ?? [],
      status: ReviewStatus.PUBLISHED
    });

    return this.toReviewResponse(review);
  }

  async listReviews(user: AuthenticatedUserContext | undefined, query: ListReviewsDto): Promise<Record<string, unknown>> {
    this.assertBuyerFilterPermission(user, query);

    const status = this.resolveStatusFilter(user, query);
    const { items, totalItems } = await this.reviewRepository.list({
      status,
      query
    });

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    return {
      items: items.map((item) => this.toReviewResponse(item)),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize)
      }
    };
  }

  async getReviewById(user: AuthenticatedUserContext | undefined, reviewId: string): Promise<Record<string, unknown>> {
    const review = await this.reviewRepository.findById(reviewId);
    this.assertReviewExists(review);

    if (!this.canViewReview(user, review!)) {
      throw new NotFoundException({
        code: ErrorCode.REVIEW_NOT_FOUND,
        message: 'Review not found'
      });
    }

    return this.toReviewResponse(review!);
  }

  async updateReview(user: AuthenticatedUserContext, reviewId: string, dto: UpdateReviewDto): Promise<Record<string, unknown>> {
    this.assertRole(user, [Role.CUSTOMER]);

    const review = await this.reviewRepository.findById(reviewId);
    this.assertReviewExists(review);

    if (review!.buyerId !== user.userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You can only update your own review'
      });
    }

    const updated = await this.reviewRepository.updateById(reviewId, {
      rating: dto.rating ?? review!.rating,
      title: dto.title?.trim() ?? review!.title,
      content: dto.content?.trim() ?? review!.content,
      images: dto.images ?? review!.images
    });

    this.assertReviewExists(updated);
    return this.toReviewResponse(updated!);
  }

  async deleteReview(user: AuthenticatedUserContext, reviewId: string): Promise<Record<string, unknown>> {
    this.assertRole(user, [Role.CUSTOMER]);

    const review = await this.reviewRepository.findById(reviewId);
    this.assertReviewExists(review);

    if (review!.buyerId !== user.userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You can only delete your own review'
      });
    }

    const updated = await this.reviewRepository.updateById(reviewId, {
      status: ReviewStatus.DELETED,
      deletedAt: new Date()
    });

    if (!updated) {
      throw new NotFoundException({
        code: ErrorCode.REVIEW_NOT_FOUND,
        message: 'Review not found'
      });
    }

    return this.toReviewResponse(updated!);
  }

  async moderateReview(user: AuthenticatedUserContext, reviewId: string, dto: ModerateReviewDto): Promise<Record<string, unknown>> {
    this.assertRole(user, MODERATOR_ROLES);

    if (dto.status === ReviewStatus.DELETED) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Moderation status cannot be DELETED'
      });
    }

    if ([ReviewStatus.HIDDEN, ReviewStatus.REJECTED].includes(dto.status) && !dto.reason?.trim()) {
      throw new UnprocessableEntityException({
        code: ErrorCode.REVIEW_MODERATION_REASON_REQUIRED,
        message: 'Moderation reason is required for HIDDEN or REJECTED status'
      });
    }

    const review = await this.reviewRepository.findById(reviewId);
    this.assertReviewExists(review);

    const updated = await this.reviewRepository.updateById(reviewId, {
      status: dto.status,
      moderationReason: dto.reason?.trim(),
      moderatedBy: user.userId,
      moderatedAt: new Date()
    });

    this.assertReviewExists(updated);
    return this.toReviewResponse(updated!);
  }

  async replyReview(user: AuthenticatedUserContext, reviewId: string, dto: ReplyReviewDto): Promise<Record<string, unknown>> {
    this.assertRole(user, REPLY_ROLES);

    const review = await this.reviewRepository.findById(reviewId);
    this.assertReviewExists(review);

    if (review!.status === ReviewStatus.DELETED) {
      throw new NotFoundException({
        code: ErrorCode.REVIEW_NOT_FOUND,
        message: 'Review not found'
      });
    }

    if (user.role === Role.SELLER && review!.sellerId !== user.userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Seller can only reply to own product reviews'
      });
    }

    const updated = await this.reviewRepository.updateById(reviewId, {
      reply: {
        content: dto.content.trim(),
        repliedBy: user.userId,
        repliedAt: new Date()
      }
    });

    this.assertReviewExists(updated);
    return this.toReviewResponse(updated!);
  }

  async getProductSummary(productId: string): Promise<Record<string, unknown>> {
    const summary = await this.reviewRepository.getProductSummary(productId);

    return {
      productId,
      averageRating: summary.averageRating,
      totalReviews: summary.totalReviews,
      starDistribution: summary.starDistribution
    };
  }

  private resolveStatusFilter(user: AuthenticatedUserContext | undefined, query: ListReviewsDto): ReviewStatus | undefined {
    if (!user) {
      return ReviewStatus.PUBLISHED;
    }

    if (MODERATOR_ROLES.includes(user.role)) {
      return query.status;
    }

    if (user.role === Role.CUSTOMER && query.buyerId === user.userId) {
      return query.status;
    }

    if (query.status && query.status !== ReviewStatus.PUBLISHED) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Insufficient role to query this review status'
      });
    }

    return ReviewStatus.PUBLISHED;
  }

  private assertBuyerFilterPermission(user: AuthenticatedUserContext | undefined, query: ListReviewsDto): void {
    if (!query.buyerId) {
      return;
    }

    if (!user) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Authentication required for buyer filter'
      });
    }

    if (MODERATOR_ROLES.includes(user.role)) {
      return;
    }

    if (user.role === Role.CUSTOMER && query.buyerId === user.userId) {
      return;
    }

    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: 'Insufficient role to filter by buyerId'
    });
  }

  private canViewReview(user: AuthenticatedUserContext | undefined, review: ReviewDocument): boolean {
    if (review.status === ReviewStatus.PUBLISHED) {
      return true;
    }

    if (review.status === ReviewStatus.DELETED) {
      return false;
    }

    if (!user) {
      return false;
    }

    if (MODERATOR_ROLES.includes(user.role)) {
      return true;
    }

    if (user.role === Role.CUSTOMER && review.buyerId === user.userId) {
      return true;
    }

    if (user.role === Role.SELLER && review.sellerId === user.userId) {
      return true;
    }

    return false;
  }

  private assertRole(user: AuthenticatedUserContext, expectedRoles: Role[]): void {
    if (!expectedRoles.includes(user.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Insufficient role'
      });
    }
  }

  private assertReviewExists(review: ReviewDocument | null): void {
    if (!review || review.status === ReviewStatus.DELETED) {
      throw new NotFoundException({
        code: ErrorCode.REVIEW_NOT_FOUND,
        message: 'Review not found'
      });
    }
  }

  private toReviewResponse(review: ReviewDocument): Record<string, unknown> {
    return {
      id: review.id,
      orderId: review.orderId,
      productId: review.productId,
      sellerId: review.sellerId,
      buyerId: review.buyerId,
      rating: review.rating,
      title: review.title ?? null,
      content: review.content,
      images: review.images ?? [],
      status: review.status,
      moderationReason: review.moderationReason ?? null,
      moderatedBy: review.moderatedBy ?? null,
      moderatedAt: review.moderatedAt?.toISOString() ?? null,
      reply: review.reply
        ? {
            content: review.reply.content,
            repliedBy: review.reply.repliedBy,
            repliedAt: review.reply.repliedAt.toISOString()
          }
        : null,
      deletedAt: review.deletedAt?.toISOString() ?? null,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString()
    };
  }
}
