import { Controller, Get, Param, Query, Res, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { ExportService, ExportFormat } from './export.service';

@ApiTags('export')
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get(':sessionId')
  @ApiOperation({ summary: 'Export session in various formats' })
  @ApiQuery({
    name: 'format',
    enum: ['json', 'csv', 'md'],
    required: false,
    description: 'Export format (default: json)',
  })
  async export(
    @Param('sessionId') sessionId: string,
    @Query('format') format: ExportFormat = 'json',
    @Res() res: Response,
  ) {
    const content = await this.exportService.exportSession(sessionId, format);

    const contentTypes: Record<ExportFormat, string> = {
      json: 'application/json',
      csv: 'text/csv',
      md: 'text/markdown',
    };

    const extensions: Record<ExportFormat, string> = {
      json: 'json',
      csv: 'csv',
      md: 'md',
    };

    const filename = `etymology-${sessionId.slice(0, 8)}.${extensions[format]}`;

    res.setHeader('Content-Type', contentTypes[format]);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }
}
