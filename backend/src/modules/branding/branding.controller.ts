import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { RequireContext, Roles } from '@shared/common/decorators';
import { ErrorResponseDto } from '@shared/common/errors/error-response.dto';
import { logoFilePipe, UploadedFile as UploadedFileType } from '@shared/storage/file-validation';
import { BrandingService } from './branding.service';
import { BrandingResponseDto, UpdateBrandingDto } from './dto/branding.dto';

@ApiTags('branding')
@ApiCookieAuth('at')
@Controller({ version: '1' })
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get('trainer/branding')
  @Roles('TRAINER')
  @RequireContext()
  @ApiSecurity('active-context')
  @ApiOperation({ summary: 'Own org branding — FR-037' })
  @ApiResponse({ status: 200, type: BrandingResponseDto })
  getOwn(): Promise<BrandingResponseDto> {
    return this.branding.getOwn();
  }

  @Put('trainer/branding')
  @Roles('TRAINER')
  @RequireContext()
  @ApiSecurity('csrf')
  @ApiSecurity('active-context')
  @ApiOperation({ summary: 'Set primary color — FR-037' })
  @ApiResponse({ status: 200, type: BrandingResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto, description: 'bad hex' })
  setColor(@Body() dto: UpdateBrandingDto): Promise<BrandingResponseDto> {
    return this.branding.setColor(dto);
  }

  @Post('trainer/branding/logo')
  @Roles('TRAINER')
  @RequireContext()
  @ApiSecurity('csrf')
  @ApiSecurity('active-context')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload logo (PNG/JPG/SVG ≤2MB, auto-resized) — FR-037' })
  @ApiResponse({ status: 200, type: BrandingResponseDto })
  @ApiResponse({ status: 413, type: ErrorResponseDto, description: 'FILE_TOO_LARGE' })
  @ApiResponse({ status: 415, type: ErrorResponseDto, description: 'UNSUPPORTED_FILE_TYPE' })
  uploadLogo(@UploadedFile(logoFilePipe()) file: UploadedFileType): Promise<BrandingResponseDto> {
    return this.branding.uploadLogo(file);
  }

  @Get('branding/:trainerId')
  @ApiOperation({ summary: 'Resolve a trainer org branding for display — FR-037' })
  @ApiResponse({ status: 200, type: BrandingResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  getByTrainer(@Param('trainerId', ParseUUIDPipe) trainerId: string): Promise<BrandingResponseDto> {
    return this.branding.getByTrainer(trainerId);
  }
}
