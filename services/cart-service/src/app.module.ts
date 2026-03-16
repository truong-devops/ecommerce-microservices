import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { CartModule } from './modules/cart/cart.module';
import { HealthModule } from './modules/health/health.module';

const persistenceEnabled = process.env.CART_PERSISTENCE_ENABLED === 'true';

@Module({
  imports: [
    CommonModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      cache: true
    }),
    ...(persistenceEnabled
      ? [
          TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
              type: 'postgres' as const,
              url: configService.getOrThrow<string>('database.url'),
              ssl: configService.get<boolean>('database.ssl', false) ? { rejectUnauthorized: false } : false,
              autoLoadEntities: true,
              synchronize: false,
              logging: false
            })
          })
        ]
      : []),
    HealthModule,
    CartModule.register(persistenceEnabled)
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard
    }
  ]
})
export class AppModule {}
