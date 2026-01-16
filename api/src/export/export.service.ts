import { Injectable } from '@nestjs/common';
import { SessionsService } from '../sessions/sessions.service';

export type ExportFormat = 'json' | 'csv' | 'md';

interface SessionWord {
  order: number;
  word: {
    word: string;
    etymology: Record<string, unknown> | null;
  };
  parent?: {
    word: {
      word: string;
    };
  } | null;
}

interface Session {
  id: string;
  name: string | null;
  createdAt: Date;
  words: SessionWord[];
}

@Injectable()
export class ExportService {
  constructor(private readonly sessionsService: SessionsService) {}

  async exportSession(sessionId: string, format: ExportFormat): Promise<string> {
    const session = await this.sessionsService.findById(sessionId) as Session;

    switch (format) {
      case 'json':
        return this.toJson(session);
      case 'csv':
        return this.toCsv(session);
      case 'md':
        return this.toMarkdown(session);
      default:
        return this.toJson(session);
    }
  }

  private toJson(session: Session): string {
    return JSON.stringify(
      {
        session: {
          id: session.id,
          name: session.name,
          createdAt: session.createdAt,
        },
        words: session.words.map((sw) => ({
          order: sw.order,
          word: sw.word.word,
          etymology: sw.word.etymology,
          derivedFrom: sw.parent?.word?.word || null,
        })),
      },
      null,
      2,
    );
  }

  private toCsv(session: Session): string {
    const headers = ['Order', 'Word', 'Origin Language', 'Root', 'Original Meaning', 'Modern Meaning', 'Derived From'];
    const rows = session.words.map((sw) => {
      const etymology = sw.word.etymology as Record<string, unknown> | null;
      const origin = etymology?.origin as Record<string, unknown> | undefined;
      return [
        sw.order.toString(),
        sw.word.word,
        origin?.language || '',
        origin?.root || '',
        etymology?.originalMeaning || '',
        etymology?.modernMeaning || '',
        sw.parent?.word?.word || '',
      ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  private toMarkdown(session: Session): string {
    const lines: string[] = [];

    lines.push(`# Etymology Exploration: ${session.name || 'Untitled Session'}`);
    lines.push('');
    lines.push(`Session ID: \`${session.id}\``);
    lines.push(`Created: ${session.createdAt.toISOString()}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const sw of session.words) {
      const etymology = sw.word.etymology as Record<string, unknown> | null;
      const origin = etymology?.origin as Record<string, unknown> | undefined;
      const components = origin?.components as Array<{ part: string; meaning: string }> | undefined;

      lines.push(`## ${sw.order + 1}. ${sw.word.word}`);
      lines.push('');

      if (sw.parent?.word?.word) {
        lines.push(`> Explored from: **${sw.parent.word.word}**`);
        lines.push('');
      }

      if (etymology) {
        lines.push('### Etymology');
        lines.push('');
        lines.push(`- **Origin:** ${origin?.language || 'Unknown'}`);
        lines.push(`- **Root:** ${origin?.root || 'Unknown'}`);

        if (components?.length) {
          lines.push('- **Components:**');
          for (const comp of components) {
            lines.push(`  - *${comp.part}*: ${comp.meaning}`);
          }
        }

        lines.push('');
        lines.push(`**Evolution:** ${etymology.evolution || 'Unknown'}`);
        lines.push('');
        lines.push(`**Original Meaning:** ${etymology.originalMeaning || 'Unknown'}`);
        lines.push('');
        lines.push(`**Modern Meaning:** ${etymology.modernMeaning || 'Unknown'}`);
      }

      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }
}
