import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '../../../common/constants/role.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequestWithContext } from '../../../common/types/request-context.type';
import { CreateReviewDto, ListReviewsDto, ModerateReviewDto, ReplyReviewDto, UpdateReviewDto } from '../dto';
import { ReviewService } from '../services/review.service';

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @Roles(Role.CUSTOMER)
  async createReview(
    @CurrentUser() user: RequestWithContext['user'],
    @Body() dto: CreateReviewDto
  ): Promise<Record<string, unknown>> {
    return this.reviewService.createReview(user!, dto);
  }

  @Public()
  @Get()
  async listReviews(
    @CurrentUser() user: RequestWithContext['user'],
    @Query() query: ListReviewsDto
  ): Promise<Record<string, unknown>> {
    return this.reviewService.listReviews(user, query);
  }

  @Public()
  @Get('products/:productId/summary')
  async getProductSummary(@Param('productId') productId: string): Promise<Record<string, unknown>> {
    return this.reviewService.getProductSummary(productId);
  }

  @Public()
  @Get(':id')
  async getReviewById(
    @CurrentUser() user: RequestWithContext['user'],
    @Param('id') id: string
  ): Promise<Record<string, unknown>> {
    return this.reviewService.getReviewById(user, id);
  }

  @Patch(':id')
  @Roles(Role.CUSTOMER)
  async updateReview(
    @CurrentUser() user: RequestWithContext['user'],
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto
  ): Promise<Record<string, unknown>> {
    return this.reviewService.updateReview(user!, id, dto);
  }

  @Delete(':id')
  @Roles(Role.CUSTOMER)
  async deleteReview(
    @CurrentUser() user: RequestWithContext['user'],
    @Param('id') id: string
  ): Promise<Record<string, unknown>> {
    return this.reviewService.deleteReview(user!, id);
  }

  @Patch(':id/moderation')
  @Roles(Role.ADMIN, Role.SUPPORT, Role.SUPER_ADMIN)
  async moderateReview(
    @CurrentUser() user: RequestWithContext['user'],
    @Param('id') id: string,
    @Body() dto: ModerateReviewDto
  ): Promise<Record<string, unknown>> {
    return this.reviewService.moderateReview(user!, id, dto);
  }

  @Post(':id/reply')
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPPORT, Role.SUPER_ADMIN)
  async replyReview(
    @CurrentUser() user: RequestWithContext['user'],
    @Param('id') id: string,
    @Body() dto: ReplyReviewDto
  ): Promise<Record<string, unknown>> {
    return this.reviewService.replyReview(user!, id, dto);
  }
}
