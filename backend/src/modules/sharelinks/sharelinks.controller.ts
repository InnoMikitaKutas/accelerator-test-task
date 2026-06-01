import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, RequireContext, Roles } from '@shared/common/decorators';
import { ErrorResponseDto } from '@shared/common/errors/error-response.dto';
import { SessionPrincipal } from '@shared/context/request-context';
import { ShareLinkService } from './sharelink.service';
import { CoachInviteDto, CreateShareLinkDto, ShareLinkResponseDto } from './dto/sharelink.dto';
import { ShareLinkListQueryDto } from './dto/sharelink-query.dto';

@ApiTags('sharelinks')
@ApiCookieAuth('at')
@ApiSecurity('csrf')
@ApiSecurity('active-context')
@Roles('TRAINER')
@RequireContext()
@Controller({ path: 'sharelinks', version: '1' })
export class SharelinksController {
  constructor(private readonly sharelinks: ShareLinkService) {}

  @Post()
  @ApiOperation({ summary: 'Create a static player ShareLink — FR-033' })
  @ApiResponse({ status: 201, type: ShareLinkResponseDto })
  create(
    @CurrentUser() user: SessionPrincipal,
    @Body() dto: CreateShareLinkDto,
  ): Promise<ShareLinkResponseDto> {
    return this.sharelinks.createStatic(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List own links + invite statuses — FR-033' })
  list(@Query() q: ShareLinkListQueryDto) {
    return this.sharelinks.list({ limit: q.limit, cursor: q.cursor, type: q.type, status: q.status });
  }

  @Post('coach-invite')
  @ApiOperation({ summary: 'Unique single-use coach invite (7-day) — FR-028/033' })
  @ApiResponse({ status: 201, type: ShareLinkResponseDto })
  coachInvite(
    @CurrentUser() user: SessionPrincipal,
    @Body() dto: CoachInviteDto,
  ): Promise<ShareLinkResponseDto> {
    return this.sharelinks.createCoachInvite(user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Deactivate a link — FR-033' })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  revoke(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.sharelinks.revoke(id);
  }
}
