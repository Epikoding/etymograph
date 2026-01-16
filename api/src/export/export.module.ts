import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [SessionsModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
