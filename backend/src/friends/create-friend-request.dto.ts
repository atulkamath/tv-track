import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** `POST /friend-requests` body — exactly one of `code`/`email` is expected. */
export class CreateFriendRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
