import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '../../../common/constants/role.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { ListProductVideosDto } from '../dto/product-video.dto';
import { ProductVideosService } from '../services/product-videos.service';

interface RejectVideoBody {
  reason?: string;
}

@Controller('moderation/videos')
export class ProductVideoModerationController {
  constructor(private readonly productVideosService: ProductVideosService) {}

  @Get()
  @Roles(Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN)
  async listReviewQueue(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListProductVideosDto
  ): Promise<unknown> {
    return this.productVideosService.listReviewQueue(user, query);
  }

  @Post(':videoId/approve')
  @Roles(Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN)
  async approveVideo(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('videoId') videoId: string
  ): Promise<unknown> {
    return this.productVideosService.approveVideo(user, videoId);
  }

  @Post(':videoId/reject')
  @Roles(Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN)
  async rejectVideo(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('videoId') videoId: string,
    @Body() body: RejectVideoBody
  ): Promise<unknown> {
    return this.productVideosService.rejectVideo(user, videoId, body.reason);
  }
}
