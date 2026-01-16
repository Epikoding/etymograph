import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EtymologyService } from '../etymology/etymology.service';
import { Word } from '@prisma/client';

@Injectable()
export class WordsService {
  private readonly logger = new Logger(WordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly etymologyService: EtymologyService,
  ) {}

  async search(word: string): Promise<Word> {
    const normalizedWord = word.toLowerCase().trim();

    // Check if word exists in database
    let existingWord = await this.prisma.word.findUnique({
      where: { word: normalizedWord },
    });

    if (existingWord) {
      this.logger.log(`Found cached word: ${normalizedWord}`);
      return existingWord;
    }

    // Fetch etymology from LLM
    this.logger.log(`Fetching etymology for: ${normalizedWord}`);
    const etymology = await this.etymologyService.analyze(normalizedWord);

    // Create new word entry
    existingWord = await this.prisma.word.create({
      data: {
        word: normalizedWord,
        etymology: etymology,
      },
    });

    return existingWord;
  }

  async findByWord(word: string): Promise<Word | null> {
    return this.prisma.word.findUnique({
      where: { word: word.toLowerCase().trim() },
    });
  }

  async getEtymology(word: string): Promise<Word> {
    const normalizedWord = word.toLowerCase().trim();

    let existingWord = await this.prisma.word.findUnique({
      where: { word: normalizedWord },
    });

    if (existingWord?.etymology) {
      return existingWord;
    }

    const etymology = await this.etymologyService.analyze(normalizedWord);

    if (existingWord) {
      return this.prisma.word.update({
        where: { id: existingWord.id },
        data: { etymology },
      });
    }

    return this.prisma.word.create({
      data: {
        word: normalizedWord,
        etymology,
      },
    });
  }

  async getDerivatives(word: string): Promise<Word> {
    const normalizedWord = word.toLowerCase().trim();

    let existingWord = await this.prisma.word.findUnique({
      where: { word: normalizedWord },
    });

    if (existingWord?.derivatives?.length) {
      return existingWord;
    }

    const derivativesData = await this.etymologyService.findDerivatives(normalizedWord);
    const derivatives = derivativesData?.derivatives?.map((d: { word: string }) => d.word) || [];

    if (existingWord) {
      return this.prisma.word.update({
        where: { id: existingWord.id },
        data: { derivatives },
      });
    }

    return this.prisma.word.create({
      data: {
        word: normalizedWord,
        derivatives,
      },
    });
  }

  async getSynonyms(word: string): Promise<Word> {
    const normalizedWord = word.toLowerCase().trim();

    let existingWord = await this.prisma.word.findUnique({
      where: { word: normalizedWord },
    });

    if (existingWord?.synonyms) {
      return existingWord;
    }

    const synonyms = await this.etymologyService.compareSynonyms(normalizedWord);

    if (existingWord) {
      return this.prisma.word.update({
        where: { id: existingWord.id },
        data: { synonyms },
      });
    }

    return this.prisma.word.create({
      data: {
        word: normalizedWord,
        synonyms,
      },
    });
  }
}
