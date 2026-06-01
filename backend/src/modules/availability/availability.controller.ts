import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
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
import { AvailabilityService } from './availability.service';
import {
  AvailabilityResponseDto,
  OverrideDto,
  SetAvailabilityDto,
  TrainerAvailabilityQueryDto,
} from './dto/availability.dto';

@ApiTags('availability')
@ApiCookieAuth('at')
@Controller({ version: '1' })
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('availability/:subjectType/:subjectId')
  @ApiOperation({ summary: 'Read Best/My Times — FR-030/039' })
  @ApiResponse({ status: 200, type: AvailabilityResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto, description: 'TENANT_FORBIDDEN' })
  getFor(
    @CurrentUser() user: SessionPrincipal,
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
  ): Promise<AvailabilityResponseDto> {
    return this.availability.getFor(user, subjectType, subjectId);
  }

  @Put('availability/:subjectType/:subjectId')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Replace slots (owner only) — FR-030/039' })
  @ApiResponse({ status: 200, type: AvailabilityResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto, description: 'overlap / start≥end' })
  setFor(
    @CurrentUser() user: SessionPrincipal,
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
    @Body() dto: SetAvailabilityDto,
  ): Promise<AvailabilityResponseDto> {
    return this.availability.setFor(user, subjectType, subjectId, dto);
  }

  @Get('trainer/availability')
  @Roles('TRAINER')
  @RequireContext()
  @ApiSecurity('active-context')
  @ApiOperation({ summary: 'View + filter associated players Best Times — FR-034' })
  trainerView(@Query() query: TrainerAvailabilityQueryDto) {
    return this.availability.trainerView(query);
  }

  @Post('availability/overrides')
  @Roles('TRAINER')
  @RequireContext()
  @ApiSecurity('csrf')
  @ApiSecurity('active-context')
  @ApiOperation({ summary: 'Override a coach availability conflict with a logged reason — FR-031' })
  @ApiResponse({ status: 201, description: 'Override recorded' })
  createOverride(@CurrentUser() user: SessionPrincipal, @Body() dto: OverrideDto) {
    return this.availability.createOverride(user, dto);
  }
}
