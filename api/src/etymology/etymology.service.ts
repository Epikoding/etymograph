import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class EtymologyService {
  private readonly logger = new Logger(EtymologyService.name);
  private readonly llmProxyUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.llmProxyUrl = this.configService.get('LLM_PROXY_URL', 'http://localhost:8081');
  }

  async analyze(word: string): Promise<Record<string, unknown>> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.llmProxyUrl}/api/etymology`, { word }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to analyze etymology for ${word}:`, error);
      throw new HttpException(
        'Failed to analyze etymology',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async findDerivatives(word: string): Promise<Record<string, unknown>> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.llmProxyUrl}/api/derivatives`, { word }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to find derivatives for ${word}:`, error);
      throw new HttpException(
        'Failed to find derivatives',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async compareSynonyms(word: string): Promise<Record<string, unknown>> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.llmProxyUrl}/api/synonyms`, { word }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to compare synonyms for ${word}:`, error);
      throw new HttpException(
        'Failed to compare synonyms',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
