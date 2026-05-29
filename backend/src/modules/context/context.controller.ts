import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@shared/common/decorators';
import { ErrorResponseDto } from '@shared/common/errors/error-response.dto';
import { SessionPrincipal } from '@shared/context/request-context';
import { ContextService } from './context.service';
import { ContextsResponseDto, SetDefaultContextDto } from './dto/context.dto';

@ApiTags('context')
@ApiCookieAuth('at')
@Controller({ path: 'me/contexts', version: '1' })
export class ContextController {
  constructor(private readonly context: ContextService) {}

  @Get()
  @ApiOperation({ summary: 'Switcher data: subjects → active trainer channels — FR-019/027' })
  @ApiResponse({ status: 200, type: ContextsResponseDto })
  getContexts(@CurrentUser() user: SessionPrincipal): Promise<ContextsResponseDto> {
    return this.context.getContexts(user);
  }

  @Put('default')
  @HttpCode(204)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Persist the default context — FR-019' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, type: ErrorResponseDto, description: 'CONTEXT_FORBIDDEN' })
  setDefault(
    @CurrentUser() user: SessionPrincipal,
    @Body() dto: SetDefaultContextDto,
  ): Promise<void> {
    return this.context.setDefault(user, dto);
  }
}
