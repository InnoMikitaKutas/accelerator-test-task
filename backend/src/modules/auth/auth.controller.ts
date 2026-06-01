import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { Request, Response } from 'express';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AllowDuringForcedChange,
  AllowUnverified,
  CurrentUser,
  Public,
} from '@shared/common/decorators';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { ErrorResponseDto } from '@shared/common/errors/error-response.dto';
import { clearAuthCookies, setAuthCookies } from '@shared/auth/cookies';
import { CsrfService } from '@shared/auth/csrf.service';
import { CTX_KEYS, SessionPrincipal } from '@shared/context/request-context';
import { AuthService } from './auth.service';
import { AuthPasswordService } from './auth-password.service';
import { LoginDto } from './dto/login.dto';
import { ResendVerificationDto, VerifyEmailDto } from './dto/verify-email.dto';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto';
import { SessionUserDto } from './dto/session-user.dto';

@ApiTags('auth')
@ApiCookieAuth('at')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: AuthPasswordService,
    private readonly csrfService: CsrfService,
    private readonly config: ConfigService,
    private readonly cls: ClsService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Email/password login; sets httpOnly session cookies' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, type: SessionUserDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto, description: 'INVALID_CREDENTIALS' })
  @ApiResponse({ status: 403, type: ErrorResponseDto, description: 'EMAIL_NOT_VERIFIED | ACCOUNT_INACTIVE' })
  @ApiResponse({ status: 429, type: ErrorResponseDto, description: 'RATE_LIMITED' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionUserDto> {
    const { user, tokens } = await this.auth.login(dto);
    setAuthCookies(res, this.config, tokens.accessToken, tokens.refreshToken);
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  @AllowDuringForcedChange()
  @AllowUnverified()
  @ApiOperation({ summary: 'Invalidate the session + clear cookies' })
  async logout(
    @CurrentUser() user: SessionPrincipal,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(user.family);
    clearAuthCookies(res, this.config);
  }

  @Post('refresh')
  @Public()
  @HttpCode(204)
  @ApiOperation({ summary: 'Rotate the session using the rt cookie' })
  @ApiResponse({ status: 204, description: 'Rotated (cookies reset)' })
  @ApiResponse({ status: 401, type: ErrorResponseDto, description: 'UNAUTHENTICATED' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const rt = req.cookies?.['rt'] as string | undefined;
    const tokens = rt ? await this.auth.refresh(rt) : null;
    if (!tokens) {
      clearAuthCookies(res, this.config);
      throw new AppException(AppErrorCode.UNAUTHENTICATED);
    }
    setAuthCookies(res, this.config, tokens.accessToken, tokens.refreshToken);
  }

  @Post('verify-email')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Consume an email-verification token' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 410, type: ErrorResponseDto, description: 'TOKEN_INVALID | TOKEN_EXPIRED | TOKEN_USED' })
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ verified: true }> {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @Public()
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resend verification email (always 202 — no enumeration)' })
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<void> {
    await this.auth.resendVerification(dto.email);
  }

  @Post('password/forgot')
  @Public()
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Request a password-reset link (always 202)' })
  async forgot(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.passwords.forgot(dto.email);
  }

  @Post('password/reset')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Complete a password reset' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 410, type: ErrorResponseDto, description: 'TOKEN_INVALID | TOKEN_EXPIRED | TOKEN_USED' })
  reset(@Body() dto: ResetPasswordDto): Promise<{ reset: true }> {
    return this.passwords.reset(dto);
  }

  @Post('password/change')
  @HttpCode(204)
  @AllowDuringForcedChange()
  @AllowUnverified()
  @ApiOperation({ summary: 'Change password (also the forced first-login change); rotates the session' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, type: ErrorResponseDto, description: 'INVALID_CREDENTIALS' })
  async change(
    @CurrentUser() user: SessionPrincipal,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const tokens = await this.passwords.change(user.id, dto);
    setAuthCookies(res, this.config, tokens.accessToken, tokens.refreshToken);
  }

  @Get('me')
  @AllowDuringForcedChange()
  @AllowUnverified()
  @ApiOperation({ summary: 'Current session principal' })
  @ApiResponse({ status: 200, type: SessionUserDto })
  me(@CurrentUser() user: SessionPrincipal): Promise<SessionUserDto> {
    return this.auth.me(user.id, this.cls.get<string>(CTX_KEYS.impersonatorAdminId));
  }

  @Get('csrf')
  @Public()
  @ApiOperation({ summary: 'Issue a CSRF token (echo in X-CSRF-Token on mutating requests)' })
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response): { csrfToken: string } {
    return { csrfToken: this.csrfService.issueToken(req, res) };
  }
}
