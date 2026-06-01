import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
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
import { CurrentUser } from '@shared/common/decorators';
import { ErrorResponseDto } from '@shared/common/errors/error-response.dto';
import { avatarFilePipe, UploadedFile as UploadedFileType } from '@shared/storage/file-validation';
import { UPLOAD_LIMITS } from '@shared/storage/upload.constants';
import { SessionPrincipal } from '@shared/context/request-context';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PhotoUploadResultDto, ProfileResponseDto } from './dto/profile-response.dto';

@ApiTags('profiles')
@ApiCookieAuth('at')
@Controller({ path: 'me/profile', version: '1' })
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Own profile (role-shaped) — FR-038' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  getMine(@CurrentUser() user: SessionPrincipal): Promise<ProfileResponseDto> {
    return this.profiles.getMine(user);
  }

  @Patch()
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Edit own profile (read-only fields rejected) — FR-038' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto, description: 'VALIDATION_ERROR' })
  update(
    @CurrentUser() user: SessionPrincipal,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.profiles.updateMine(user, dto);
  }

  @Post('photo')
  @ApiSecurity('csrf')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS }))
  @ApiOperation({ summary: 'Upload avatar (PNG/JPG ≤2MB) + thumbnail — FR-038' })
  @ApiResponse({ status: 201, type: PhotoUploadResultDto })
  @ApiResponse({ status: 413, type: ErrorResponseDto, description: 'FILE_TOO_LARGE' })
  @ApiResponse({ status: 415, type: ErrorResponseDto, description: 'UNSUPPORTED_FILE_TYPE' })
  uploadPhoto(
    @CurrentUser() user: SessionPrincipal,
    @UploadedFile(avatarFilePipe()) file: UploadedFileType,
  ): Promise<PhotoUploadResultDto> {
    return this.profiles.uploadPhoto(user, file);
  }
}
