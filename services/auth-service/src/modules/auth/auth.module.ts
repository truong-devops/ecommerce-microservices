import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './controllers/auth.controller';
import { GovernanceController } from './controllers/governance.controller';
import { AuditLogEntity } from './entities/audit-log.entity';
import { EmailVerificationTokenEntity } from './entities/email-verification-token.entity';
import { PasswordResetTokenEntity } from './entities/password-reset-token.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { SessionEntity } from './entities/session.entity';
import { UserEntity } from './entities/user.entity';
import { OauthAccountEntity } from './entities/oauth-account.entity';
import { GovernanceActionLogEntity } from './entities/governance-action-log.entity';
import { GovernancePolicyEntity } from './entities/governance-policy.entity';
import { AccessTokenStrategy } from './strategies/access-token.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';
import { AuditLogRepository } from './repositories/audit-log.repository';
import { EmailVerificationTokenRepository } from './repositories/email-verification-token.repository';
import { PasswordResetTokenRepository } from './repositories/password-reset-token.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { SessionRepository } from './repositories/session.repository';
import { UserRepository } from './repositories/user.repository';
import { OauthAccountRepository } from './repositories/oauth-account.repository';
import { AuditService } from './services/audit.service';
import { AuthService } from './services/auth.service';
import { EventsPublisherService } from './services/events-publisher.service';
import { MfaService } from './services/mfa.service';
import { PasswordService } from './services/password.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { SessionService } from './services/session.service';
import { TokenService } from './services/token.service';
import { GovernanceService } from './services/governance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      SessionEntity,
      RefreshTokenEntity,
      EmailVerificationTokenEntity,
      PasswordResetTokenEntity,
      AuditLogEntity,
      OauthAccountEntity,
      GovernanceActionLogEntity,
      GovernancePolicyEntity
    ]),
    PassportModule.register({ defaultStrategy: 'jwt-access' }),
    JwtModule.register({})
  ],
  controllers: [AuthController, GovernanceController],
  providers: [
    AuthService,
    PasswordService,
    RateLimiterService,
    TokenService,
    SessionService,
    MfaService,
    AuditService,
    EventsPublisherService,
    UserRepository,
    SessionRepository,
    RefreshTokenRepository,
    EmailVerificationTokenRepository,
    PasswordResetTokenRepository,
    AuditLogRepository,
    OauthAccountRepository,
    AccessTokenStrategy,
    RefreshTokenStrategy,
    GovernanceService
  ],
  exports: [AuthService]
})
export class AuthModule {}
