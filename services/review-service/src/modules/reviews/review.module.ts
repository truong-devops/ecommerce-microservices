import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewController } from './controllers/review.controller';
import { ReviewEntity, ReviewSchema } from './entities/review.entity';
import { ReviewRepository } from './repositories/review.repository';
import { ReviewService } from './services/review.service';
import { AccessTokenStrategy } from './strategies/access-token.strategy';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt-access'
    }),
    MongooseModule.forFeature([
      {
        name: ReviewEntity.name,
        schema: ReviewSchema
      }
    ])
  ],
  controllers: [ReviewController],
  providers: [AccessTokenStrategy, ReviewRepository, ReviewService]
})
export class ReviewsModule {}
