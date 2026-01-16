import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SearchWordDto {
  @ApiProperty({
    description: 'The word to search for',
    example: 'pretext',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  word: string;
}
