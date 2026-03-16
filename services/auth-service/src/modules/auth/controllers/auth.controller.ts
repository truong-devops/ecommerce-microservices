import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
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
  RefreshTokenDto,
  RegisterDto,
  ResendVerifyEmailDto,
  ResetPasswordDto,
  VerifyEmailDto
} from '../dto';
import { AuthService } from '../services/auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() request: RequestWithContext): Promise<Record<string, unknown>> {
    return this.authService.register(dto, request);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: RequestWithContext): Promise<Record<string, unknown>> {
    return this.authService.login(dto, request);
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
  resendVerifyEmail(@Body() dto: ResendVerifyEmailDto, @Req() request: RequestWithContext): Promise<Record<string, unknown>> {
    return this.authService.resendVerifyEmail(dto, request);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: RequestWithContext): Promise<Record<string, unknown>> {
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
