import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WordsService } from './words.service';
import { SearchWordDto } from './dto/search-word.dto';
import { WordResponseDto } from './dto/word-response.dto';

@ApiTags('words')
@Controller('words')
export class WordsController {
  constructor(private readonly wordsService: WordsService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search for a word and get its etymology' })
  @ApiResponse({ status: 200, type: WordResponseDto })
  async search(@Body() dto: SearchWordDto) {
    return this.wordsService.search(dto.word);
  }

  @Get(':word/etymology')
  @ApiOperation({ summary: 'Get detailed etymology for a word' })
  @ApiResponse({ status: 200, type: WordResponseDto })
  async getEtymology(@Param('word') word: string) {
    return this.wordsService.getEtymology(word);
  }

  @Get(':word/derivatives')
  @ApiOperation({ summary: 'Get words derived from the same root' })
  @ApiResponse({ status: 200, type: WordResponseDto })
  async getDerivatives(@Param('word') word: string) {
    return this.wordsService.getDerivatives(word);
  }

  @Get(':word/synonyms')
  @ApiOperation({ summary: 'Get synonyms with nuanced differences' })
  @ApiResponse({ status: 200, type: WordResponseDto })
  async getSynonyms(@Param('word') word: string) {
    return this.wordsService.getSynonyms(word);
  }
}
