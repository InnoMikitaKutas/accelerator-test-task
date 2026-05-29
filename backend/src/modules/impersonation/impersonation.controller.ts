import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  AllowDuringForcedChange,
  AllowUnverified,
  CurrentUser,
  Roles,
} from '@shared/common/decorators';
import { ErrorResponseDto } from '@shared/common/errors/error-response.dto';
import { setAccessCookie, setAuthCookies } from '@shared/auth/cookies';
import { SessionPrincipal } from '@shared/context/request-context';
import { ImpersonationService } from './impersonation.service';
import {
  ImpersonationHistoryQueryDto,
  ImpersonationStateDto,
  StartImpersonationDto,
} from './dto/impersonation.dto';

@ApiTags('impersonation')
@ApiCookieAuth('at')
@ApiSecurity('csrf')
@Controller({ version: '1' })
export class ImpersonationController {
  constructor(
    private readonly impersonation: ImpersonationService,
    private readonly config: ConfigService,
  ) {}

  // NOTE: 'exit' is declared before ':userId' so the static route wins.
  @Post('impersonate/exit')
  @HttpCode(200)
  @AllowDuringForcedChange()
  @AllowUnverified()
  @ApiOperation({ summary: 'End impersonation; restores the admin session — FR-015' })
  @ApiResponse({ status: 200, type: ImpersonationStateDto })
  async exit(@Res({ passthrough: true }) res: Response): Promise<ImpersonationStateDto> {
    const { state, tokens } = await this.impersonation.exit();
    if (tokens) setAuthCookies(res, this.config, tokens.accessToken, tokens.refreshToken);
    return state;
  }

  @Post('impersonate/:userId')
  @Roles('SUPER_ADMIN')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start impersonation (super-admin only) — FR-015' })
  @ApiResponse({ status: 200, type: ImpersonationStateDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto, description: 'IMPERSONATE_SUPER_ADMIN | ACCOUNT_INACTIVE' })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async start(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: StartImpersonationDto,
    @CurrentUser() admin: SessionPrincipal,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ImpersonationStateDto> {
    const { token, ttlSec, state } = await this.impersonation.start(admin.id, userId, dto);
    setAccessCookie(res, this.config, token, ttlSec);
    return state;
  }

  @Get('impersonation/history')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Impersonation audit log report — FR-016' })
  history(@Query() query: ImpersonationHistoryQueryDto) {
    return this.impersonation.history(query);
  }
}
