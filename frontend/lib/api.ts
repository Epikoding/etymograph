import type { Word, Session, SessionGraph, DerivativesData, SynonymsData } from '@/types/word';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Supported languages for etymology translations
export const SUPPORTED_LANGUAGES = ['Korean', 'Japanese', 'Chinese'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

// Custom error class with code
export class ApiError extends Error {
  code?: string;
  word?: string;

  constructor(message: string, code?: string, word?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.word = word;
  }
}

class ApiClient {
  private baseUrl: string;
  private _language: SupportedLanguage = 'Korean';

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // Get/Set current language
  get language(): SupportedLanguage {
    return this._language;
  }

  setLanguage(lang: SupportedLanguage): void {
    this._language = lang;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new ApiError(
        errorData.error || `HTTP ${response.status}`,
        errorData.code,
        errorData.word
      );
    }

    return response.json();
  }

  // Words
  async searchWord(word: string, language?: SupportedLanguage): Promise<Word> {
    return this.fetch<Word>('/words/search', {
      method: 'POST',
      body: JSON.stringify({ word, language: language || this._language }),
    });
  }

  // Autocomplete suggestions
  async getSuggestions(query: string, limit: number = 8): Promise<{ priority: string[]; general: string[] }> {
    const emptyResult = { priority: [], general: [] };
    if (query.length < 2) return emptyResult;
    try {
      const response = await fetch(
        `${this.baseUrl}/api/words/suggest?q=${encodeURIComponent(query)}&limit=${limit}`
      );
      if (!response.ok) return emptyResult;
      const data = await response.json();
      return {
        priority: data.suggestions?.priority || [],
        general: data.suggestions?.general || [],
      };
    } catch {
      return emptyResult;
    }
  }

  async getEtymology(word: string, language?: SupportedLanguage): Promise<Word> {
    const lang = language || this._language;
    return this.fetch<Word>(`/words/${encodeURIComponent(word)}/etymology?language=${lang}`);
  }

  async getDerivatives(word: string, language?: SupportedLanguage): Promise<{ word: string; language: string; derivatives: Array<{ word: string; meaning: string }> }> {
    const lang = language || this._language;
    return this.fetch<{ word: string; language: string; derivatives: Array<{ word: string; meaning: string }> }>(`/words/${encodeURIComponent(word)}/derivatives?language=${lang}`);
  }

  async getSynonyms(word: string, language?: SupportedLanguage): Promise<{ word: string; language: string; synonyms: SynonymsData }> {
    const lang = language || this._language;
    return this.fetch<{ word: string; language: string; synonyms: SynonymsData }>(`/words/${encodeURIComponent(word)}/synonyms?language=${lang}`);
  }

  // Etymology refresh/compare
  async refreshEtymology(word: string, language?: SupportedLanguage): Promise<Word> {
    const lang = language || this._language;
    return this.fetch<Word>(`/words/${encodeURIComponent(word)}/refresh?language=${lang}`, {
      method: 'POST',
    });
  }

  async applyEtymology(word: string, language?: SupportedLanguage): Promise<Word> {
    const lang = language || this._language;
    return this.fetch<Word>(`/words/${encodeURIComponent(word)}/apply?language=${lang}`, {
      method: 'POST',
    });
  }

  async revertEtymology(word: string, language?: SupportedLanguage): Promise<Word> {
    const lang = language || this._language;
    return this.fetch<Word>(`/words/${encodeURIComponent(word)}/revert?language=${lang}`, {
      method: 'POST',
    });
  }

  // Sessions
  async createSession(name?: string): Promise<Session> {
    return this.fetch<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async getSession(id: string): Promise<Session> {
    return this.fetch<Session>(`/sessions/${id}`);
  }

  async addWordToSession(
    sessionId: string,
    word: string,
    parentId?: string
  ): Promise<Session> {
    return this.fetch<Session>(`/sessions/${sessionId}/words`, {
      method: 'POST',
      body: JSON.stringify({ word, parentId }),
    });
  }

  async getSessionGraph(sessionId: string): Promise<SessionGraph> {
    return this.fetch<SessionGraph>(`/sessions/${sessionId}/graph`);
  }

  async deleteSession(id: string): Promise<void> {
    await this.fetch<void>(`/sessions/${id}`, {
      method: 'DELETE',
    });
  }

  // Export
  getExportUrl(sessionId: string, format: 'json' | 'csv' | 'md'): string {
    return `${this.baseUrl}/api/export/${sessionId}?format=${format}`;
  }
}

export const api = new ApiClient(API_URL);
