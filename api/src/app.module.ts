import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WordsModule } from './words/words.module';
import { EtymologyModule } from './etymology/etymology.module';
import { SessionsModule } from './sessions/sessions.module';
import { ExportModule } from './export/export.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    WordsModule,
    EtymologyModule,
    SessionsModule,
    ExportModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
