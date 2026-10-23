import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

export class RegisterDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

export class CreateUserDto extends RegisterDto {
  @IsEnum(Role) role: Role;
}
