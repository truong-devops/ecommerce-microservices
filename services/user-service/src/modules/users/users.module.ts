import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './controllers/users.controller';
import { UserEntity } from './entities/user.entity';
import { KafkaUserEventsPublisher } from './events/kafka-user-events.publisher';
import { USER_EVENTS_PUBLISHER } from './events/user-events.publisher';
import { UsersRepository } from './repositories/users.repository';
import { UsersService } from './services/users.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [UsersController],
  providers: [
    UsersRepository,
    UsersService,
    {
      provide: USER_EVENTS_PUBLISHER,
      useClass: KafkaUserEventsPublisher
    }
  ]
})
export class UsersModule {}
