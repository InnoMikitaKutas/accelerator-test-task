import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Public } from '@shared/common/decorators';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { ErrorResponseDto } from '@shared/common/errors/error-response.dto';
import { setAuthCookies } from '@shared/auth/cookies';
import { TokenService } from '@shared/auth/token.service';
import { SessionPrincipal } from '@shared/context/request-context';
import { SessionUserDto } from '@modules/auth/dto/session-user.dto';
import { JoinService } from './join.service';
import { AssociationResult } from './association.service';
import { JoinResolveDto } from './dto/sharelink.dto';
import { JoinBodyDto } from './dto/sharelink-query.dto';

type ConsumeResult =
  | SessionUserDto
  | { association: AssociationResult; context: { subjectProfileId: string; trainerId: string } };

@ApiTags('join')
@Controller({ path: 'join', version: '1' })
export class JoinController {
  constructor(
    private readonly join: JoinService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  @Get(':code')
  @Public()
  @ApiOperation({ summary: 'Resolve a ShareLink (no PII) — FR-017/018/028' })
  @ApiResponse({ status: 200, type: JoinResolveDto })
  resolve(@Param('code') code: string): Promise<JoinResolveDto> {
    return this.join.resolve(code);
  }

  @Post(':code')
  @Public()
  @HttpCode(201)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Consume: register new OR associate existing — FR-017/018/028/029' })
  @ApiResponse({ status: 201, description: 'SessionUserDto (new) or { association, context } (existing)' })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'EMAIL_EXISTS | COACH_ALREADY_ASSIGNED' })
  @ApiResponse({ status: 410, type: ErrorResponseDto, description: 'SHARELINK_EXPIRED | SHARELINK_USED' })
  async consume(
    @Param('code') code: string,
    @Body() body: JoinBodyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConsumeResult> {
    const principal = await this.tryPrincipal(req);
    if (principal) {
      return this.join.associateExisting(code, principal, { subjectProfileId: body.subjectProfileId });
    }

    const missing: { field: string; message: string }[] = [];
    if (!body.email) missing.push({ field: 'email', message: 'required' });
    if (!body.password) missing.push({ field: 'password', message: 'required' });
    if (!body.firstName) missing.push({ field: 'firstName', message: 'required' });
    if (!body.lastName) missing.push({ field: 'lastName', message: 'required' });
    if (missing.length) throw new AppException(AppErrorCode.VALIDATION_ERROR, { details: missing });

    const { user, tokens } = await this.join.registerNew(code, {
      email: body.email as string,
      password: body.password as string,
      firstName: body.firstName as string,
      lastName: body.lastName as string,
      phone: body.phone,
    });
    setAuthCookies(res, this.config, tokens.accessToken, tokens.refreshToken);
    return user;
  }

  /** Optional-auth: detect an existing valid session from the `at` cookie (route is @Public). */
  private async tryPrincipal(req: Request): Promise<SessionPrincipal | null> {
    const at = req.cookies?.['at'] as string | undefined;
    if (!at) return null;
    try {
      const c = await this.tokens.verifyAccess(at);
      if (c.impersonationExp && c.impersonationExp < Math.floor(Date.now() / 1000)) return null;
      return {
        id: c.sub,
        role: c.role,
        email: c.email,
        emailVerified: c.emailVerified,
        mustChangePassword: c.mustChangePassword,
        isMinor: c.isMinor,
        managedByParentUserId: c.managedByParentUserId ?? null,
        family: c.family,
      };
    } catch {
      return null;
    }
  }
}
