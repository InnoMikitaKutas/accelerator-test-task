import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { Roles, CurrentUser } from '@shared/common/decorators';
import { ErrorResponseDto } from '@shared/common/errors/error-response.dto';
import { SessionPrincipal } from '@shared/context/request-context';
import { UserAdminService } from './user-admin.service';
import { AnonymizationService } from './anonymization.service';
import { CreateTrainerDto } from './dto/create-trainer.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListQueryDto } from './dto/user-query.dto';
import { DeactivateUserDto, GdprDeleteDto, GdprDeleteResultDto } from './dto/user-actions.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { CampConversionDto } from './dto/camp-conversion.dto';

@ApiTags('users')
@ApiCookieAuth('at')
@ApiSecurity('csrf')
@Roles('SUPER_ADMIN')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly admin: UserAdminService,
    private readonly anonymization: AnonymizationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Global users directory (keyset, search/filter) — FR-010' })
  list(@Query() query: UserListQueryDto) {
    return this.admin.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a Trainer account — FR-011' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'EMAIL_EXISTS' })
  createTrainer(@Body() dto: CreateTrainerDto): Promise<UserResponseDto> {
    return this.admin.createTrainer(dto);
  }

  @Post('import/camp')
  @Roles('SUPER_ADMIN', 'TRAINER')
  @ApiOperation({ summary: 'Camp→User conversion stub (Epic-08) — FR-040' })
  importCamp(@Body() dto: CampConversionDto) {
    return this.admin.campImport(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.admin.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a user — FR-012' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.admin.update(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Soft-delete (deactivate) — FR-013' })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeactivateUserDto,
  ): Promise<UserResponseDto> {
    return this.admin.deactivate(id, dto);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore a deactivated user — FR-013' })
  reactivate(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.admin.reactivate(id);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'GDPR anonymize-delete (irreversible) — FR-014' })
  @ApiResponse({ status: 200, type: GdprDeleteResultDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto, description: 'confirmEmail mismatch' })
  gdprDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GdprDeleteDto,
    @CurrentUser() actor: SessionPrincipal,
  ): Promise<GdprDeleteResultDto> {
    return this.anonymization.gdprDelete(id, dto, actor.id);
  }
}
