import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

const PASSWORD_POLICY = /(?=.*[A-Za-z])(?=.*\d)/;
const PASSWORD_MSG = 'Password must contain a letter and a number';

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(255)
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @Length(20, 256)
  token: string;

  @ApiProperty({ minLength: 8, description: 'Min 8 chars, ≥1 letter & ≥1 number' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_POLICY, { message: PASSWORD_MSG })
  newPassword: string;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ description: 'Required unless under the temp-password (forced-change) flow' })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_POLICY, { message: PASSWORD_MSG })
  newPassword: string;
}
