import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext, RequestWithContext } from '../../../common/types/request-context.type';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  MfaVerifyDto,
  OauthExchangeTicketDto,
  RefreshTokenDto,
  RegisterDto,
  ResendVerifyEmailDto,
  ResetPasswordDto,
  VerifyEmailDto
} from '../dto';
import { AuthService } from '../services/auth.service';
import { RateLimiterService } from '../services/rate-limiter.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimiter: RateLimiterService
  ) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() request: RequestWithContext): Promise<Record<string, unknown>> {
    await this.rateLimiter.assertRegisterAllowed(request);
    return this.authService.register(dto, request);
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() request: RequestWithContext): Promise<Record<string, unknown>> {
    await this.rateLimiter.assertLoginAllowed(request, dto.email);
    return this.authService.login(dto, request);
  }

  @Public()
  @Get('oauth/google/authorize')
  async googleAuthorize(
    @Query('app') app: string,
    @Query('callbackUrl') callbackUrl: string,
    @Query('returnUrl') returnUrl: string | undefined,
    @Query('codeChallenge') codeChallenge: string | undefined,
    @Req() request: RequestWithContext,
    @Res() response: Response
  ): Promise<void> {
    await this.rateLimiter.assertOauthAllowed(request);
    const authorizeUrl = await this.authService.buildGoogleAuthorizeUrl({
      app,
      callbackUrl,
      returnUrl,
      codeChallenge
    });

    response.redirect(302, authorizeUrl);
  }

  @Public()
  @Get('oauth/google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() response: Response,
    @Req() request: RequestWithContext
  ): Promise<void> {
    const redirectUrl = await this.authService.handleGoogleCallback({
      code,
      state,
      request
    });

    response.redirect(302, redirectUrl);
  }

  @Public()
  @Post('oauth/exchange-ticket')
  async exchangeOauthTicket(@Body() dto: OauthExchangeTicketDto, @Req() request: RequestWithContext): Promise<Record<string, unknown>> {
    await this.rateLimiter.assertOauthAllowed(request);
    return this.authService.exchangeOauthTicket(dto, request);
  }

  @Post('logout')
  logout(
    @CurrentUser() currentUser: AuthenticatedUserContext,
    @Body() dto: LogoutDto,
    @Req() request: RequestWithContext
  ): Promise<Record<string, unknown>> {
    return this.authService.logout(currentUser, dto, request);
  }

  @Post('logout-all')
  logoutAll(@CurrentUser() currentUser: AuthenticatedUserContext, @Req() request: RequestWithContext): Promise<Record<string, unknown>> {
    return this.authService.logoutAll(currentUser, request);
  }

  @Public()
  @Post('refresh-token')
  refreshToken(@Body() dto: RefreshTokenDto, @Req() request: RequestWithContext): Promise<Record<string, unknown>> {
    return this.authService.refreshToken(dto, request);
  }

  @Public()
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto, @Req() request: RequestWithContext): Promise<Record<string, unknown>> {
    return this.authService.verifyEmail(dto, request);
  }

  @Public()
  @Post('resend-verify-email')
  async resendVerifyEmail(@Body() dto: ResendVerifyEmailDto, @Req() request: RequestWithContext): Promise<Record<string, unknown>> {
    await this.rateLimiter.assertResendVerifyEmailAllowed(dto.email);
    return this.authService.resendVerifyEmail(dto, request);
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: RequestWithContext): Promise<Record<string, unknown>> {
    await this.rateLimiter.assertForgotPasswordAllowed(dto.email);
    return this.authService.forgotPassword(dto, request);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto, @Req() request: RequestWithContext): Promise<Record<string, unknown>> {
    return this.authService.resetPassword(dto, request);
  }

  @Post('change-password')
  changePassword(
    @CurrentUser() currentUser: AuthenticatedUserContext,
    @Body() dto: ChangePasswordDto,
    @Req() request: RequestWithContext
  ): Promise<Record<string, unknown>> {
    return this.authService.changePassword(currentUser, dto, request);
  }

  @Get('sessions')
  getSessions(@CurrentUser() currentUser: AuthenticatedUserContext): Promise<Record<string, unknown>> {
    return this.authService.getSessions(currentUser);
  }

  @Get('me')
  getMe(@CurrentUser() currentUser: AuthenticatedUserContext): Promise<Record<string, unknown>> {
    return this.authService.getMe(currentUser);
  }

  @Delete('sessions/:sessionId')
  revokeSessionById(
    @CurrentUser() currentUser: AuthenticatedUserContext,
    @Param('sessionId') sessionId: string,
    @Req() request: RequestWithContext
  ): Promise<Record<string, unknown>> {
    return this.authService.revokeSessionById(currentUser, sessionId, request);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Post('mfa/setup')
  setupMfa(@CurrentUser() currentUser: AuthenticatedUserContext, @Req() request: RequestWithContext): Promise<Record<string, unknown>> {
    return this.authService.setupMfa(currentUser, request);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Post('mfa/enable')
  enableMfa(
    @CurrentUser() currentUser: AuthenticatedUserContext,
    @Body() dto: MfaVerifyDto,
    @Req() request: RequestWithContext
  ): Promise<Record<string, unknown>> {
    return this.authService.enableMfa(currentUser, dto.code, request);
  }
}
