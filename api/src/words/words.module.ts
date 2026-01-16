import { Module } from '@nestjs/common';
import { WordsController } from './words.controller';
import { WordsService } from './words.service';
import { EtymologyModule } from '../etymology/etymology.module';

@Module({
  imports: [EtymologyModule],
  controllers: [WordsController],
  providers: [WordsService],
  exports: [WordsService],
})
export class WordsModule {}
