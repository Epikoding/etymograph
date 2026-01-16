import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { EtymologyService } from './etymology.service';

@Module({
  imports: [HttpModule],
  providers: [EtymologyService],
  exports: [EtymologyService],
})
export class EtymologyModule {}
