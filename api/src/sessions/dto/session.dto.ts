import { IsNotEmpty, IsString, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiPropertyOptional({
    description: 'Optional name for the session',
    example: 'Latin roots exploration',
  })
  @IsOptional()
  @IsString()
  name?: string;
}

export class AddWordDto {
  @ApiProperty({
    description: 'The word to add to the session',
    example: 'pretext',
  })
  @IsString()
  @IsNotEmpty()
  word: string;

  @ApiPropertyOptional({
    description: 'ID of the parent word (for derivation tracking)',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class SessionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true })
  name: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty()
  words: SessionWordDto[];
}

export class SessionWordDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  order: number;

  @ApiProperty({ nullable: true })
  parentId: string | null;

  @ApiProperty()
  word: WordDto;
}

export class WordDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  word: string;

  @ApiProperty({ nullable: true })
  etymology: Record<string, unknown> | null;
}
