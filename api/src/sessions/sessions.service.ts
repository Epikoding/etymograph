import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WordsService } from '../words/words.service';
import { CreateSessionDto, AddWordDto } from './dto/session.dto';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly sessionDuration = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private readonly prisma: PrismaService,
    private readonly wordsService: WordsService,
  ) {}

  async create(dto: CreateSessionDto) {
    const expiresAt = new Date(Date.now() + this.sessionDuration);

    return this.prisma.session.create({
      data: {
        name: dto.name,
        expiresAt,
      },
      include: {
        words: {
          include: {
            word: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });
  }

  async findById(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        words: {
          include: {
            word: true,
            parent: true,
            children: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session ${id} not found`);
    }

    return session;
  }

  async addWord(sessionId: string, dto: AddWordDto) {
    // Verify session exists
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        words: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // Search/create the word
    const word = await this.wordsService.search(dto.word);

    // Get the next order number
    const nextOrder = session.words.length;

    // Add word to session
    const sessionWord = await this.prisma.sessionWord.create({
      data: {
        sessionId,
        wordId: word.id,
        order: nextOrder,
        parentId: dto.parentId,
      },
      include: {
        word: true,
        parent: {
          include: {
            word: true,
          },
        },
      },
    });

    return sessionWord;
  }

  async getSessionGraph(sessionId: string) {
    const session = await this.findById(sessionId);

    // Build graph structure
    const nodes = session.words.map((sw) => ({
      id: sw.id,
      word: sw.word.word,
      etymology: sw.word.etymology,
      order: sw.order,
    }));

    const edges = session.words
      .filter((sw) => sw.parentId)
      .map((sw) => ({
        source: sw.parentId,
        target: sw.id,
      }));

    return {
      session: {
        id: session.id,
        name: session.name,
        createdAt: session.createdAt,
      },
      graph: {
        nodes,
        edges,
      },
    };
  }

  async deleteSession(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException(`Session ${id} not found`);
    }

    await this.prisma.session.delete({
      where: { id },
    });

    return { deleted: true };
  }
}
