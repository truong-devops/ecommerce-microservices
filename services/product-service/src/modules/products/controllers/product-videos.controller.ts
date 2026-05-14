import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '../../../common/constants/role.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import {
  ConfirmVideoMediaDto,
  ConfirmVideoThumbnailDto,
  CreateProductVideoDto,
  ListProductVideosDto,
  TrackVideoEventDto,
  UpdateProductVideoDto
} from '../dto/product-video.dto';
import { ProductVideosService } from '../services/product-videos.service';

@Controller('videos')
export class ProductVideosController {
  constructor(private readonly productVideosService: ProductVideosService) {}

  @Post()
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPER_ADMIN)
  async createVideo(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() dto: CreateProductVideoDto
  ): Promise<unknown> {
    return this.productVideosService.createVideo(user, dto);
  }

  @Get('me')
  @Roles(Role.SELLER, Role.ADMIN, Role.MODERATOR, Role.SUPER_ADMIN)
  async listManagedVideos(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListProductVideosDto
  ): Promise<unknown> {
    return this.productVideosService.listManagedVideos(user, query);
  }

  @Public()
  @Get('feed')
  async listVideoFeed(@Query() query: ListProductVideosDto): Promise<unknown> {
    return this.productVideosService.listFeed(query);
  }

  @Public()
  @Get(':videoId')
  async getPublicVideo(@Param('videoId') videoId: string): Promise<unknown> {
    return this.productVideosService.getPublicVideo(videoId);
  }

  @Patch(':videoId')
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPER_ADMIN)
  async updateVideo(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('videoId') videoId: string,
    @Body() dto: UpdateProductVideoDto
  ): Promise<unknown> {
    return this.productVideosService.updateVideo(user, videoId, dto);
  }

  @Post(':videoId/media/confirm')
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPER_ADMIN)
  async confirmMedia(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('videoId') videoId: string,
    @Body() dto: ConfirmVideoMediaDto
  ): Promise<unknown> {
    return this.productVideosService.confirmMedia(user, videoId, dto);
  }

  @Post(':videoId/thumbnail/confirm')
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPER_ADMIN)
  async confirmThumbnail(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('videoId') videoId: string,
    @Body() dto: ConfirmVideoThumbnailDto
  ): Promise<unknown> {
    return this.productVideosService.confirmThumbnail(user, videoId, dto);
  }

  @Post(':videoId/submit-review')
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPER_ADMIN)
  async submitReview(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('videoId') videoId: string
  ): Promise<unknown> {
    return this.productVideosService.submitReview(user, videoId);
  }

  @Post(':videoId/publish')
  @Roles(Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN)
  async publishVideo(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('videoId') videoId: string
  ): Promise<unknown> {
    return this.productVideosService.publishVideo(user, videoId);
  }

  @Post(':videoId/unpublish')
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPER_ADMIN)
  async unpublishVideo(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('videoId') videoId: string
  ): Promise<unknown> {
    return this.productVideosService.unpublishVideo(user, videoId);
  }

  @Delete(':videoId')
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPER_ADMIN)
  async archiveVideo(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('videoId') videoId: string
  ): Promise<unknown> {
    return this.productVideosService.archiveVideo(user, videoId);
  }

  @Public()
  @Post(':videoId/events/view-started')
  async trackViewStarted(@Param('videoId') videoId: string, @Body() dto: TrackVideoEventDto): Promise<unknown> {
    return this.productVideosService.trackEvent(videoId, 'view-started', dto);
  }

  @Public()
  @Post(':videoId/events/view-qualified')
  async trackViewQualified(@Param('videoId') videoId: string, @Body() dto: TrackVideoEventDto): Promise<unknown> {
    return this.productVideosService.trackEvent(videoId, 'view-qualified', dto);
  }

  @Public()
  @Post(':videoId/events/product-clicked')
  async trackProductClicked(@Param('videoId') videoId: string, @Body() dto: TrackVideoEventDto): Promise<unknown> {
    return this.productVideosService.trackEvent(videoId, 'product-clicked', dto);
  }

  @Public()
  @Post(':videoId/events/add-to-cart')
  async trackAddToCart(@Param('videoId') videoId: string, @Body() dto: TrackVideoEventDto): Promise<unknown> {
    return this.productVideosService.trackEvent(videoId, 'add-to-cart', dto);
  }
}
