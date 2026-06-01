import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'Opaque token from the verification email' })
  @IsString()
  @Length(20, 256)
  token: string;
}

export class ResendVerificationDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(255)
  email: string;
}
