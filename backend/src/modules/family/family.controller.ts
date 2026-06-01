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
  Put,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CurrentUser, MinorForbidden, RequireContext, Roles } from '@shared/common/decorators';
import { ErrorResponseDto } from '@shared/common/errors/error-response.dto';
import { SessionPrincipal } from '@shared/context/request-context';
import { FamilyService } from './family.service';
import { PurchaseApprovalService } from './purchase-approval.service';
import {
  ApprovalDecisionDto,
  ApprovalResponseDto,
  ChildSummaryDto,
  ChildTrainerAssocDto,
  CreateChildDto,
  EnableChildLoginDto,
  FamilyResponseDto,
  PurchaseRequestDto,
  TokenSettingDto,
  UpdateChildDto,
} from './dto/family.dto';
import { ApprovalListQueryDto } from './dto/family-query.dto';

@ApiTags('family')
@ApiCookieAuth('at')
@Roles('PLAYER')
@Controller({ path: 'family', version: '1' })
export class FamilyController {
  constructor(
    private readonly family: FamilyService,
    private readonly approvals: PurchaseApprovalService,
  ) {}

  @Get()
  @MinorForbidden()
  @ApiOperation({ summary: 'Family roster (Zone-1) — FR-027' })
  @ApiResponse({ status: 200, type: FamilyResponseDto })
  getFamily(@CurrentUser() user: SessionPrincipal): Promise<FamilyResponseDto> {
    return this.family.getFamily(user.id);
  }

  @Post('children')
  @MinorForbidden()
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Create a child profile — FR-021' })
  @ApiResponse({ status: 201, type: ChildSummaryDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'DUPLICATE_CHILD_WARNING' })
  createChild(@CurrentUser() user: SessionPrincipal, @Body() dto: CreateChildDto): Promise<ChildSummaryDto> {
    return this.family.createChild(user.id, dto);
  }

  @Get('children/:id')
  @MinorForbidden()
  getChild(@CurrentUser() user: SessionPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<ChildSummaryDto> {
    return this.family.getChild(user.id, id);
  }

  @Patch('children/:id')
  @MinorForbidden()
  @ApiSecurity('csrf')
  updateChild(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChildDto,
  ): Promise<ChildSummaryDto> {
    return this.family.updateChild(user.id, id, dto);
  }

  @Post('children/:id/login')
  @MinorForbidden()
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Provision a constrained child login (parent-driven) — FR-025' })
  @ApiResponse({ status: 201, type: ChildSummaryDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'EMAIL_EXISTS' })
  enableChildLogin(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EnableChildLoginDto,
  ): Promise<ChildSummaryDto> {
    return this.family.enableChildLogin(user.id, id, dto);
  }

  @Post('children/:id/trainers')
  @MinorForbidden()
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Add a child↔trainer association — FR-023' })
  addTrainer(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChildTrainerAssocDto,
  ) {
    return this.family.addTrainer(user.id, id, dto);
  }

  @Delete('children/:id/trainers/:trainerId')
  @MinorForbidden()
  @HttpCode(204)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Remove association (soft + RSVP cancel) — FR-023' })
  removeTrainer(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('trainerId', ParseUUIDPipe) trainerId: string,
  ): Promise<void> {
    return this.family.removeTrainer(user.id, id, trainerId);
  }

  @Put('children/:id/token-setting')
  @MinorForbidden()
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Per-child token-approval toggle — FR-024' })
  setTokenSetting(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TokenSettingDto,
  ) {
    return this.family.setTokenSetting(user.id, id, dto);
  }

  // Zone-3 action (tied to a specific trainer) — requires active context. Children MAY request.
  @Post('purchase-requests')
  @RequireContext()
  @ApiSecurity('csrf')
  @ApiSecurity('active-context')
  @ApiOperation({ summary: 'Child-initiated purchase → approval — FR-024' })
  @ApiResponse({ status: 201, type: ApprovalResponseDto })
  createPurchaseRequest(
    @CurrentUser() user: SessionPrincipal,
    @Body() dto: PurchaseRequestDto,
  ): Promise<ApprovalResponseDto> {
    return this.approvals.createRequest(user, dto);
  }

  @Get('approvals')
  @MinorForbidden()
  @ApiOperation({ summary: 'Pending/historic approvals — FR-024' })
  listApprovals(@CurrentUser() user: SessionPrincipal, @Query() q: ApprovalListQueryDto) {
    return this.approvals.list(user.id, {
      limit: q.limit,
      cursor: q.cursor,
      status: q.status,
      childProfileId: q.childProfileId,
    });
  }

  @Get('approvals/:id')
  @MinorForbidden()
  getApproval(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApprovalResponseDto> {
    return this.approvals.get(user.id, id);
  }

  @Post('approvals/:id/approve')
  @MinorForbidden()
  @HttpCode(200)
  @ApiSecurity('csrf')
  @ApiResponse({ status: 410, type: ErrorResponseDto, description: 'APPROVAL_EXPIRED' })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'APPROVAL_ALREADY_DECIDED' })
  approve(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ): Promise<ApprovalResponseDto> {
    return this.approvals.approve(user, id, dto);
  }

  @Post('approvals/:id/deny')
  @MinorForbidden()
  @HttpCode(200)
  @ApiSecurity('csrf')
  deny(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ): Promise<ApprovalResponseDto> {
    return this.approvals.deny(user, id, dto);
  }
}
