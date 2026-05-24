import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, ADMIN_ROLES } from '../../../common/constants/role.enum';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { AppException } from '../../../common/utils/app-exception.util';
import { addMinutes } from '../../../common/utils/date.util';
import { sha256 } from '../../../common/utils/hash.util';
import { AuthenticatedUserContext, RequestWithContext } from '../../../common/types/request-context.type';
import { RedisService } from '../../../common/utils/redis.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  OauthExchangeTicketDto,
  RefreshTokenDto,
  RegisterDto,
  ResendVerifyEmailDto,
  ResetPasswordDto,
  VerifyEmailDto
} from '../dto';
import { EmailVerificationTokenEntity } from '../entities/email-verification-token.entity';
import { PasswordResetTokenEntity } from '../entities/password-reset-token.entity';
import { RefreshTokenEntity } from '../entities/refresh-token.entity';
import { UserEntity } from '../entities/user.entity';
import { OauthAccountEntity } from '../entities/oauth-account.entity';
import { AuditService } from './audit.service';
import { EventsPublisherService } from './events-publisher.service';
import { MfaService } from './mfa.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { EmailVerificationTokenRepository } from '../repositories/email-verification-token.repository';
import { PasswordResetTokenRepository } from '../repositories/password-reset-token.repository';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';
import { UserRepository } from '../repositories/user.repository';
import { OauthAccountRepository } from '../repositories/oauth-account.repository';

const GOOGLE_OAUTH_PROVIDER = 'google';

const OAUTH_APP_NAMES = ['buyer-web', 'seller', 'moderator'] as const;
type OauthAppName = (typeof OAUTH_APP_NAMES)[number];

interface OauthStatePayload {
  app: OauthAppName;
  callbackUrl: string;
  returnUrl: string;
}

interface OauthLoginTicketPayload {
  app: OauthAppName;
  userId: string;
  returnUrl: string;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

interface GoogleUserInfoResponse {
  sub: string;
  email?: string;
  email_verified?: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly userRepository: UserRepository,
    private readonly oauthAccountRepository: OauthAccountRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly emailVerificationTokenRepository: EmailVerificationTokenRepository,
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly redisService: RedisService,
    private readonly mfaService: MfaService,
    private readonly auditService: AuditService,
    private readonly eventsPublisherService: EventsPublisherService
  ) {}

  async register(dto: RegisterDto, request: RequestWithContext): Promise<Record<string, unknown>> {
    const email = dto.email.toLowerCase().trim();
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'Email already exists'
      });
    }

    const role = dto.role ?? Role.CUSTOMER;
    if (![Role.CUSTOMER, Role.SELLER].includes(role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Public registration only supports CUSTOMER and SELLER roles'
      });
    }

    const user = this.userRepository.create({
      email,
      passwordHash: await this.passwordService.hashPassword(dto.password),
      role,
      isActive: true,
      isEmailVerified: false,
      mfaEnabled: ADMIN_ROLES.includes(role),
      mfaSecret: null
    });

    const createdUser = await this.userRepository.save(user);
    const verifyToken = await this.issueEmailVerificationToken(createdUser);

    await this.auditService.log({
      userId: createdUser.id,
      action: 'AUTH_REGISTER',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
      metadata: {
        role: createdUser.role
      }
    });

    await this.eventsPublisherService.publishUserEvent('auth.user.registered', {
      userId: createdUser.id,
      email: createdUser.email,
      role: createdUser.role
    });

    await this.eventsPublisherService.publishNotificationEvent('auth.email.verification.requested', {
      userId: createdUser.id,
      email: createdUser.email,
      token: verifyToken
    });

    return {
      userId: createdUser.id,
      userCode: formatRoleCode(createdUser.id, createdUser.role),
      email: createdUser.email,
      role: createdUser.role,
      emailVerificationRequired: true,
      ...(this.isDevelopment() ? { verifyToken } : {})
    };
  }

  async login(dto: LoginDto, request: RequestWithContext): Promise<Record<string, unknown>> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw this.invalidCredentialsException();
    }

    const passwordMatched = await this.passwordService.comparePassword(dto.password, user.passwordHash);
    if (!passwordMatched) {
      throw this.invalidCredentialsException();
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'User is inactive'
      });
    }

    if (this.isEmailVerificationRequired() && !user.isEmailVerified) {
      throw new UnauthorizedException({
        code: ErrorCode.EMAIL_NOT_VERIFIED,
        message: 'Email is not verified'
      });
    }

    if (ADMIN_ROLES.includes(user.role)) {
      const isDevMfaBypass = this.isDevelopment() && dto.mfaCode === '123456';

      if (!isDevMfaBypass) {
        if (!user.mfaEnabled || !user.mfaSecret) {
          throw new ForbiddenException({
            code: ErrorCode.MFA_REQUIRED,
            message: 'MFA must be configured for admin accounts'
          });
        }

        if (!dto.mfaCode || !this.mfaService.verifyTotp(user.mfaSecret, dto.mfaCode)) {
          throw new UnauthorizedException({
            code: ErrorCode.MFA_INVALID,
            message: 'Invalid MFA code'
          });
        }
      }
    }

    await this.sessionService.revokeAllSessions(user.id, 'replaced_by_new_login');

    const session = await this.sessionService.createSession({
      userId: user.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined
    });

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
      tokenVersion: user.tokenVersion
    };

    const access = await this.tokenService.issueAccessToken(tokenPayload);
    const refresh = await this.tokenService.issueRefreshToken({
      userId: user.id,
      sessionId: session.id,
      tokenVersion: user.tokenVersion
    });

    const refreshTokenRecord = this.refreshTokenRepository.create({
      userId: user.id,
      sessionId: session.id,
      jti: refresh.jti,
      tokenHash: this.tokenService.hashRefreshToken(refresh.token),
      expiresAt: refresh.expiresAt,
      revokedAt: null,
      replacedByTokenId: null
    });

    await this.refreshTokenRepository.save(refreshTokenRecord);

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_LOGIN',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
      metadata: { sessionId: session.id }
    });

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      tokenType: 'Bearer',
      expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
      sessionId: session.id,
      user: {
        id: user.id,
        userCode: formatRoleCode(user.id, user.role),
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        mfaEnabled: user.mfaEnabled
      }
    };
  }

  async buildGoogleAuthorizeUrl(input: { app: string; callbackUrl: string; returnUrl?: string }): Promise<string> {
    const app = this.parseOauthApp(input.app);
    const callbackUrl = this.validateAppCallbackUrl(app, input.callbackUrl);
    const returnUrl = this.resolveReturnUrl(input.returnUrl);
    const state = this.passwordService.generateOpaqueToken();

    const payload: OauthStatePayload = {
      app,
      callbackUrl,
      returnUrl
    };

    await this.redisService.setWithTtl(this.oauthStateKey(state), JSON.stringify(payload), this.getOauthStateTtlSeconds());

    const scopes = this.configService.get<string[]>('oauth.google.scopes', ['openid', 'email', 'profile']);
    const clientId = this.configService.getOrThrow<string>('oauth.google.clientId');
    const redirectUri = this.configService.getOrThrow<string>('oauth.google.redirectUri');

    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      access_type: 'online',
      include_granted_scopes: 'true',
      prompt: 'select_account'
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
  }

  async handleGoogleCallback(input: { code?: string; state?: string; request: RequestWithContext }): Promise<string> {
    const fallbackRedirect = this.buildOauthErrorRedirect(
      `${this.defaultAppBaseUrl('buyer-web')}${this.getExpectedCallbackPath('buyer-web')}`,
      'AUTH_FAILED',
      'Google callback is invalid'
    );

    try {
      if (!input.code || !input.state) {
        return fallbackRedirect;
      }

      const statePayload = await this.consumeOauthState(input.state);
      if (!statePayload) {
        return this.buildOauthErrorRedirect(
          `${this.defaultAppBaseUrl('buyer-web')}${this.getExpectedCallbackPath('buyer-web')}`,
          'INVALID_STATE',
          'OAuth state is invalid'
        );
      }

      const token = await this.exchangeGoogleAuthCode(input.code);
      const profile = await this.fetchGoogleUserProfile(token.access_token);

      if (!profile.email || !profile.email_verified) {
        return this.buildOauthErrorRedirect(statePayload.callbackUrl, ErrorCode.UNAUTHORIZED, 'Google account email is not verified');
      }

      const user = await this.resolveUserForGoogleProfile({
        profile
      });

      if (!this.isRoleAllowedForApp(statePayload.app, user.role)) {
        return this.buildOauthErrorRedirect(statePayload.callbackUrl, ErrorCode.FORBIDDEN, 'Account role is not allowed for this app');
      }

      const loginTicket = this.passwordService.generateOpaqueToken();
      const ticketPayload: OauthLoginTicketPayload = {
        app: statePayload.app,
        userId: user.id,
        returnUrl: statePayload.returnUrl
      };

      await this.redisService.setWithTtl(
        this.oauthLoginTicketKey(loginTicket),
        JSON.stringify(ticketPayload),
        this.getOauthLoginTicketTtlSeconds()
      );

      await this.auditService.log({
        userId: user.id,
        action: 'AUTH_GOOGLE_LOGIN_INITIATED',
        requestId: input.request.requestId,
        ipAddress: input.request.ip,
        userAgent: input.request.headers['user-agent'] as string | undefined,
        metadata: {
          app: statePayload.app
        }
      });

      const callbackUrl = new URL(statePayload.callbackUrl);
      callbackUrl.searchParams.set('ticket', loginTicket);
      return callbackUrl.toString();
    } catch {
      return fallbackRedirect;
    }
  }

  async exchangeOauthTicket(dto: OauthExchangeTicketDto, request: RequestWithContext): Promise<Record<string, unknown>> {
    const app = this.parseOauthApp(dto.app);
    const ticketPayload = await this.consumeOauthLoginTicket(dto.loginTicket);
    if (!ticketPayload || ticketPayload.app !== app) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid or expired login ticket'
      });
    }

    const user = await this.userRepository.findById(ticketPayload.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'User not found or inactive'
      });
    }

    if (!this.isRoleAllowedForApp(app, user.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Account role is not allowed for this app'
      });
    }

    await this.sessionService.revokeAllSessions(user.id, 'replaced_by_new_login');

    const session = await this.sessionService.createSession({
      userId: user.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined
    });

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
      tokenVersion: user.tokenVersion
    };

    const access = await this.tokenService.issueAccessToken(tokenPayload);
    const refresh = await this.tokenService.issueRefreshToken({
      userId: user.id,
      sessionId: session.id,
      tokenVersion: user.tokenVersion
    });

    const refreshTokenRecord = this.refreshTokenRepository.create({
      userId: user.id,
      sessionId: session.id,
      jti: refresh.jti,
      tokenHash: this.tokenService.hashRefreshToken(refresh.token),
      expiresAt: refresh.expiresAt,
      revokedAt: null,
      replacedByTokenId: null
    });

    await this.refreshTokenRepository.save(refreshTokenRecord);

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_GOOGLE_LOGIN',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
      metadata: {
        app
      }
    });

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      tokenType: 'Bearer',
      expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
      sessionId: session.id,
      returnUrl: ticketPayload.returnUrl,
      user: {
        id: user.id,
        userCode: formatRoleCode(user.id, user.role),
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        mfaEnabled: user.mfaEnabled
      }
    };
  }

  async logout(currentUser: AuthenticatedUserContext, dto: LogoutDto, request: RequestWithContext): Promise<Record<string, unknown>> {
    const refreshPayload = this.tokenService.verifyRefreshToken(dto.refreshToken);

    if (refreshPayload.sub !== currentUser.userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Refresh token does not belong to current user'
      });
    }

    await this.refreshTokenRepository.revokeByJti(refreshPayload.jti);
    await this.sessionService.revokeSession(refreshPayload.sessionId, 'logout');
    await this.sessionService.revokeAccessToken(currentUser.jti, this.tokenService.getAccessTokenTtlSeconds());

    await this.auditService.log({
      userId: currentUser.userId,
      action: 'AUTH_LOGOUT',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
      metadata: {
        sessionId: refreshPayload.sessionId
      }
    });

    return { message: 'Logged out successfully' };
  }

  async logoutAll(currentUser: AuthenticatedUserContext, request: RequestWithContext): Promise<Record<string, unknown>> {
    await this.sessionService.revokeAllSessions(currentUser.userId, 'logout_all');
    await this.userRepository.incrementTokenVersion(currentUser.userId);
    await this.sessionService.revokeAccessToken(currentUser.jti, this.tokenService.getAccessTokenTtlSeconds());

    await this.auditService.log({
      userId: currentUser.userId,
      action: 'AUTH_LOGOUT_ALL',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined
    });

    return { message: 'All sessions logged out' };
  }

  async refreshToken(dto: RefreshTokenDto, request: RequestWithContext): Promise<Record<string, unknown>> {
    const payload = this.tokenService.verifyRefreshToken(dto.refreshToken);
    const user = await this.userRepository.findById(payload.sub);

    if (!user || !user.isActive) {
      throw this.invalidRefreshTokenException();
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      throw this.invalidRefreshTokenException();
    }

    const session = await this.sessionService.getSessionById(payload.sessionId);
    if (!session || session.revokedAt) {
      throw new UnauthorizedException({
        code: ErrorCode.SESSION_REVOKED,
        message: 'Session revoked'
      });
    }

    const refreshToken = await this.refreshTokenRepository.findByJti(payload.jti);
    const incomingHash = this.tokenService.hashRefreshToken(dto.refreshToken);

    const isInvalidRefreshToken =
      !refreshToken || refreshToken.revokedAt !== null || refreshToken.tokenHash !== incomingHash || refreshToken.expiresAt.getTime() <= Date.now();

    if (isInvalidRefreshToken) {
      await this.handleTokenReuseDetection(payload.sub, payload.sessionId, request);
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_REUSE_DETECTED,
        message: 'Refresh token reuse detected. All sessions revoked.'
      });
    }

    refreshToken.revokedAt = new Date();

    const access = await this.tokenService.issueAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
      tokenVersion: user.tokenVersion
    });

    const nextRefresh = await this.tokenService.issueRefreshToken({
      userId: user.id,
      sessionId: session.id,
      tokenVersion: user.tokenVersion
    });

    const nextRefreshRecord = this.refreshTokenRepository.create({
      userId: user.id,
      sessionId: session.id,
      jti: nextRefresh.jti,
      tokenHash: this.tokenService.hashRefreshToken(nextRefresh.token),
      expiresAt: nextRefresh.expiresAt,
      revokedAt: null,
      replacedByTokenId: null
    });

    const persistedNextToken = await this.refreshTokenRepository.save(nextRefreshRecord);
    refreshToken.replacedByTokenId = persistedNextToken.id;
    await this.refreshTokenRepository.save(refreshToken);

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_REFRESH_TOKEN',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
      metadata: {
        oldJti: payload.jti,
        newJti: nextRefresh.jti,
        sessionId: session.id
      }
    });

    return {
      accessToken: access.token,
      refreshToken: nextRefresh.token,
      tokenType: 'Bearer',
      expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
      sessionId: session.id
    };
  }

  async verifyEmail(dto: VerifyEmailDto, request: RequestWithContext): Promise<Record<string, unknown>> {
    const tokenHash = sha256(dto.token);
    const verificationToken = await this.emailVerificationTokenRepository.findByTokenHash(tokenHash);

    if (!verificationToken || verificationToken.usedAt || verificationToken.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid or expired verification token'
      });
    }

    const user = await this.userRepository.findById(verificationToken.userId);
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found'
      });
    }

    user.isEmailVerified = true;
    user.emailVerifiedAt = new Date();
    await this.userRepository.save(user);

    verificationToken.usedAt = new Date();
    await this.emailVerificationTokenRepository.save(verificationToken);

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_VERIFY_EMAIL',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined
    });

    await this.eventsPublisherService.publishNotificationEvent('auth.email.verified', {
      userId: user.id,
      email: user.email
    });

    return { message: 'Email verified successfully' };
  }

  async resendVerifyEmail(dto: ResendVerifyEmailDto, request: RequestWithContext): Promise<Record<string, unknown>> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.userRepository.findByEmail(email);

    if (!user || user.isEmailVerified) {
      return { message: 'If account exists, verification email has been sent' };
    }

    const verifyToken = await this.issueEmailVerificationToken(user);

    await this.eventsPublisherService.publishNotificationEvent('auth.email.verification.requested', {
      userId: user.id,
      email: user.email,
      token: verifyToken
    });

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_RESEND_VERIFY_EMAIL',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined
    });

    return {
      message: 'Verification email sent',
      ...(this.isDevelopment() ? { verifyToken } : {})
    };
  }

  async forgotPassword(dto: ForgotPasswordDto, request: RequestWithContext): Promise<Record<string, unknown>> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      return { message: 'If account exists, password reset email has been sent' };
    }

    const resetToken = await this.issuePasswordResetToken(user);

    await this.eventsPublisherService.publishNotificationEvent('auth.password.reset.requested', {
      userId: user.id,
      email: user.email,
      token: resetToken
    });

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_FORGOT_PASSWORD',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined
    });

    return {
      message: 'If account exists, password reset email has been sent',
      ...(this.isDevelopment() ? { resetToken } : {})
    };
  }

  async resetPassword(dto: ResetPasswordDto, request: RequestWithContext): Promise<Record<string, unknown>> {
    const tokenHash = sha256(dto.token);
    const resetToken = await this.passwordResetTokenRepository.findByTokenHash(tokenHash);

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid or expired reset token'
      });
    }

    const user = await this.userRepository.findById(resetToken.userId);
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found'
      });
    }

    user.passwordHash = await this.passwordService.hashPassword(dto.newPassword);
    await this.userRepository.save(user);

    resetToken.usedAt = new Date();
    await this.passwordResetTokenRepository.save(resetToken);

    await this.userRepository.incrementTokenVersion(user.id);
    await this.sessionService.revokeAllSessions(user.id, 'password_reset');

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_RESET_PASSWORD',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined
    });

    await this.eventsPublisherService.publishNotificationEvent('auth.password.reset.completed', {
      userId: user.id,
      email: user.email
    });

    return { message: 'Password reset successfully' };
  }

  async changePassword(currentUser: AuthenticatedUserContext, dto: ChangePasswordDto, request: RequestWithContext): Promise<Record<string, unknown>> {
    const user = await this.userRepository.findById(currentUser.userId);
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found'
      });
    }

    const matched = await this.passwordService.comparePassword(dto.currentPassword, user.passwordHash);
    if (!matched) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Current password is incorrect'
      });
    }

    user.passwordHash = await this.passwordService.hashPassword(dto.newPassword);
    await this.userRepository.save(user);

    await this.userRepository.incrementTokenVersion(user.id);
    await this.sessionService.revokeAllSessions(user.id, 'password_change');

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_CHANGE_PASSWORD',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined
    });

    return { message: 'Password changed successfully' };
  }

  async getSessions(currentUser: AuthenticatedUserContext): Promise<Record<string, unknown>> {
    const sessions = await this.sessionService.listActiveSessions(currentUser.userId);

    return {
      items: sessions.map((session) => ({
        id: session.id,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        isCurrent: session.id === currentUser.sessionId
      }))
    };
  }

  async getMe(currentUser: AuthenticatedUserContext): Promise<Record<string, unknown>> {
    const user = await this.userRepository.findById(currentUser.userId);
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found'
      });
    }

    return {
      user: {
        id: user.id,
        userCode: formatRoleCode(user.id, user.role),
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        mfaEnabled: user.mfaEnabled
      }
    };
  }

  async revokeSessionById(currentUser: AuthenticatedUserContext, sessionId: string, request: RequestWithContext): Promise<Record<string, unknown>> {
    const session = await this.sessionService.getSessionById(sessionId);
    if (!session) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Session not found'
      });
    }

    if (session.userId !== currentUser.userId && !ADMIN_ROLES.includes(currentUser.role as Role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Cannot revoke another user session'
      });
    }

    await this.sessionService.revokeSession(sessionId, 'manual_session_revoke');

    await this.auditService.log({
      userId: currentUser.userId,
      action: 'AUTH_REVOKE_SESSION',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
      metadata: { sessionId }
    });

    return { message: 'Session revoked successfully' };
  }

  async setupMfa(currentUser: AuthenticatedUserContext, request: RequestWithContext): Promise<Record<string, unknown>> {
    const user = await this.userRepository.findById(currentUser.userId);
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found'
      });
    }

    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'MFA setup is only for admin roles'
      });
    }

    const mfa = this.mfaService.generateSecret(user.email);
    user.mfaSecret = mfa.secret;
    user.mfaEnabled = false;
    await this.userRepository.save(user);

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_MFA_SETUP',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined
    });

    return {
      secret: this.isDevelopment() ? mfa.secret : undefined,
      otpauthUrl: mfa.otpauthUrl,
      message: 'Scan OTP secret then call /auth/mfa/enable with code'
    };
  }

  async enableMfa(currentUser: AuthenticatedUserContext, code: string, request: RequestWithContext): Promise<Record<string, unknown>> {
    const user = await this.userRepository.findById(currentUser.userId);
    if (!user || !user.mfaSecret) {
      throw new AppException(400, {
        code: ErrorCode.BAD_REQUEST,
        message: 'MFA is not setup yet'
      });
    }

    const valid = this.mfaService.verifyTotp(user.mfaSecret, code);
    if (!valid) {
      throw new UnauthorizedException({
        code: ErrorCode.MFA_INVALID,
        message: 'Invalid MFA code'
      });
    }

    user.mfaEnabled = true;
    await this.userRepository.save(user);

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_MFA_ENABLE',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined
    });

    return { message: 'MFA enabled successfully' };
  }

  private parseOauthApp(raw: string): OauthAppName {
    if ((OAUTH_APP_NAMES as readonly string[]).includes(raw)) {
      return raw as OauthAppName;
    }

    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'Unsupported OAuth app'
    });
  }

  private resolveReturnUrl(raw: string | undefined): string {
    if (!raw) {
      return '/';
    }

    const value = raw.trim();
    if (!value.startsWith('/') || value.startsWith('//')) {
      return '/';
    }

    return value;
  }

  private validateAppCallbackUrl(app: OauthAppName, callbackUrl: string): string {
    let parsed: URL;
    try {
      parsed = new URL(callbackUrl);
    } catch {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Invalid callback URL'
      });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Invalid callback URL protocol'
      });
    }

    const expectedPath = this.getExpectedCallbackPath(app);
    if (parsed.pathname !== expectedPath) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Callback URL path is not allowed'
      });
    }

    const allowedOrigin = this.getAllowedAppOrigin(app);
    if (parsed.origin !== allowedOrigin) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Callback URL origin is not allowed'
      });
    }

    return parsed.toString();
  }

  private getAllowedAppOrigin(app: OauthAppName): string {
    let baseUrl: string;
    switch (app) {
      case 'buyer-web':
        baseUrl = this.configService.get<string>('oauth.appBaseUrls.buyerWeb', 'http://localhost:8888');
        break;
      case 'seller':
        baseUrl = this.configService.get<string>('oauth.appBaseUrls.seller', 'http://localhost:6789');
        break;
      case 'moderator':
        baseUrl = this.configService.get<string>('oauth.appBaseUrls.moderator', 'http://localhost:1111');
        break;
      default:
        baseUrl = 'http://localhost:8888';
        break;
    }

    try {
      return new URL(baseUrl).origin;
    } catch {
      throw new InternalServerErrorException({
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Invalid OAuth app base URL configuration'
      });
    }
  }

  private defaultAppBaseUrl(app: OauthAppName): string {
    return this.getAllowedAppOrigin(app);
  }

  private getExpectedCallbackPath(app: OauthAppName): string {
    switch (app) {
      case 'buyer-web':
        return '/api/buyer/auth/google/callback';
      case 'seller':
        return '/api/seller/auth/google/callback';
      case 'moderator':
        return '/api/moderator/auth/google/callback';
      default:
        return '/api/buyer/auth/google/callback';
    }
  }

  private isRoleAllowedForApp(app: OauthAppName, role: string): boolean {
    switch (app) {
      case 'buyer-web':
        return role === Role.CUSTOMER;
      case 'seller':
        return ['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(role);
      case 'moderator':
        return ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(role);
      default:
        return false;
    }
  }

  private oauthStateKey(state: string): string {
    return `oauth:google:state:${state}`;
  }

  private oauthLoginTicketKey(ticket: string): string {
    return `oauth:google:ticket:${ticket}`;
  }

  private async consumeOauthState(state: string): Promise<OauthStatePayload | null> {
    const key = this.oauthStateKey(state);
    const raw = await this.redisService.get(key);
    if (!raw) {
      return null;
    }

    await this.redisService.delete(key);

    try {
      const parsed = JSON.parse(raw) as Partial<OauthStatePayload>;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      if (!parsed.app || !parsed.callbackUrl || !parsed.returnUrl) {
        return null;
      }

      const app = this.parseOauthApp(parsed.app);
      return {
        app,
        callbackUrl: this.validateAppCallbackUrl(app, parsed.callbackUrl),
        returnUrl: this.resolveReturnUrl(parsed.returnUrl)
      };
    } catch {
      return null;
    }
  }

  private async consumeOauthLoginTicket(ticket: string): Promise<OauthLoginTicketPayload | null> {
    const key = this.oauthLoginTicketKey(ticket);
    const raw = await this.redisService.get(key);
    if (!raw) {
      return null;
    }

    await this.redisService.delete(key);

    try {
      const parsed = JSON.parse(raw) as Partial<OauthLoginTicketPayload>;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      if (!parsed.app || !parsed.userId) {
        return null;
      }

      return {
        app: this.parseOauthApp(parsed.app),
        userId: parsed.userId,
        returnUrl: this.resolveReturnUrl(parsed.returnUrl)
      };
    } catch {
      return null;
    }
  }

  private getOauthStateTtlSeconds(): number {
    return this.configService.get<number>('oauth.stateTtlSeconds', 600);
  }

  private getOauthLoginTicketTtlSeconds(): number {
    return this.configService.get<number>('oauth.loginTicketTtlSeconds', 120);
  }

  private async exchangeGoogleAuthCode(code: string): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      code,
      client_id: this.configService.getOrThrow<string>('oauth.google.clientId'),
      client_secret: this.configService.getOrThrow<string>('oauth.google.clientSecret'),
      redirect_uri: this.configService.getOrThrow<string>('oauth.google.redirectUri'),
      grant_type: 'authorization_code'
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Google token exchange failed'
      });
    }

    const payload = (await response.json()) as Partial<GoogleTokenResponse>;
    if (!payload.access_token) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Google token response is invalid'
      });
    }

    return payload as GoogleTokenResponse;
  }

  private async fetchGoogleUserProfile(accessToken: string): Promise<GoogleUserInfoResponse> {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Cannot fetch Google user profile'
      });
    }

    const payload = (await response.json()) as Partial<GoogleUserInfoResponse>;
    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid Google user profile'
      });
    }

    return payload as GoogleUserInfoResponse;
  }

  private async resolveUserForGoogleProfile(input: { profile: GoogleUserInfoResponse }): Promise<UserEntity> {
    const providerUserId = input.profile.sub;
    const providerEmail = (input.profile.email ?? '').trim().toLowerCase();
    if (!providerEmail) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Google account has no email'
      });
    }

    const existingByProvider = await this.oauthAccountRepository.findByProviderUserId(GOOGLE_OAUTH_PROVIDER, providerUserId);
    if (existingByProvider) {
      const linkedUser = await this.userRepository.findById(existingByProvider.userId);
      if (linkedUser) {
        return linkedUser;
      }
    }

    const existingByEmail = await this.userRepository.findByEmail(providerEmail);
    const user = existingByEmail
      ? existingByEmail
      : await this.userRepository.save(
          this.userRepository.create({
            email: providerEmail,
            passwordHash: await this.passwordService.hashPassword(this.passwordService.generateOpaqueToken()),
            role: Role.CUSTOMER,
            isActive: true,
            isEmailVerified: Boolean(input.profile.email_verified),
            emailVerifiedAt: input.profile.email_verified ? new Date() : null,
            mfaEnabled: false,
            mfaSecret: null
          })
        );

    const linkedByEmail = await this.oauthAccountRepository.findByProviderEmail(GOOGLE_OAUTH_PROVIDER, providerEmail);
    if (!linkedByEmail) {
      await this.oauthAccountRepository.save(
        this.oauthAccountRepository.create({
          userId: user.id,
          provider: GOOGLE_OAUTH_PROVIDER,
          providerUserId,
          providerEmail,
          providerEmailVerified: Boolean(input.profile.email_verified)
        })
      );
    }

    if (!user.isEmailVerified && input.profile.email_verified) {
      user.isEmailVerified = true;
      user.emailVerifiedAt = new Date();
      await this.userRepository.save(user);
    }

    return user;
  }

  private buildOauthErrorRedirect(callbackUrl: string, code: string, message: string): string {
    const url = new URL(callbackUrl);
    url.searchParams.set('error', code);
    url.searchParams.set('message', message);
    return url.toString();
  }

  private invalidCredentialsException(): UnauthorizedException {
    return new UnauthorizedException({
      code: ErrorCode.UNAUTHORIZED,
      message: 'Invalid credentials'
    });
  }

  private invalidRefreshTokenException(): UnauthorizedException {
    return new UnauthorizedException({
      code: ErrorCode.UNAUTHORIZED,
      message: 'Invalid refresh token'
    });
  }

  private async handleTokenReuseDetection(userId: string, sessionId: string, request: RequestWithContext): Promise<void> {
    await this.sessionService.revokeSession(sessionId, 'refresh_token_reuse_detected');
    await this.sessionService.revokeAllSessions(userId, 'refresh_token_reuse_detected');
    await this.userRepository.incrementTokenVersion(userId);

    await this.auditService.log({
      userId,
      action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
      metadata: {
        sessionId
      }
    });

    await this.eventsPublisherService.publishAuditEvent('auth.refresh_token_reuse_detected', {
      userId,
      sessionId,
      requestId: request.requestId
    });
  }

  private async issueEmailVerificationToken(user: UserEntity): Promise<string> {
    await this.emailVerificationTokenRepository.invalidateByUserId(user.id);

    const token = this.passwordService.generateOpaqueToken();
    const tokenEntity: EmailVerificationTokenEntity = this.emailVerificationTokenRepository.create({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: addMinutes(new Date(), this.configService.get<number>('security.emailVerifyTokenTtlMinutes', 60)),
      usedAt: null
    });

    await this.emailVerificationTokenRepository.save(tokenEntity);
    return token;
  }

  private async issuePasswordResetToken(user: UserEntity): Promise<string> {
    await this.passwordResetTokenRepository.invalidateByUserId(user.id);

    const token = this.passwordService.generateOpaqueToken();
    const tokenEntity: PasswordResetTokenEntity = this.passwordResetTokenRepository.create({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: addMinutes(new Date(), this.configService.get<number>('security.resetPasswordTokenTtlMinutes', 30)),
      usedAt: null
    });

    await this.passwordResetTokenRepository.save(tokenEntity);
    return token;
  }

  private isDevelopment(): boolean {
    return this.configService.get<string>('app.env') === 'development';
  }

  private isEmailVerificationRequired(): boolean {
    return this.configService.get<boolean>('security.requireEmailVerification', true);
  }
}

function formatRoleCode(userId: string, role: Role): string {
  if (role === Role.SELLER) {
    return formatCode(userId, 'SEL');
  }
  return formatCode(userId, 'CUS');
}

function formatCode(raw: string, prefix: string): string {
  const source = raw.trim();
  if (!source) {
    return `${prefix}0000000`;
  }

  const normalized = source.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const exactMatch = normalized.match(new RegExp(`^${prefix}(\\d{7,})$`));
  if (exactMatch) {
    return `${prefix}${exactMatch[1]}`;
  }

  const digits = normalized.replace(/\D/g, '');
  if (digits.length >= 7) {
    return `${prefix}${digits.slice(-7)}`;
  }

  return `${prefix}${String(stableHash(source)).padStart(7, '0')}`;
}

function stableHash(value: string): number {
  const modulo = 10_000_000;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % modulo;
  }
  return hash;
}
