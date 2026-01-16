import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CreateSessionDto, AddWordDto, SessionResponseDto } from './dto/session.dto';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new exploration session' })
  @ApiResponse({ status: 201, type: SessionResponseDto })
  async create(@Body() dto: CreateSessionDto) {
    return this.sessionsService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get session by ID' })
  @ApiResponse({ status: 200, type: SessionResponseDto })
  async findById(@Param('id') id: string) {
    return this.sessionsService.findById(id);
  }

  @Post(':id/words')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a word to the session' })
  async addWord(@Param('id') id: string, @Body() dto: AddWordDto) {
    return this.sessionsService.addWord(id, dto);
  }

  @Get(':id/graph')
  @ApiOperation({ summary: 'Get session as a graph structure' })
  async getGraph(@Param('id') id: string) {
    return this.sessionsService.getSessionGraph(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a session' })
  async delete(@Param('id') id: string) {
    return this.sessionsService.deleteSession(id);
  }
}
