import type { Word, Session, SessionGraph, DerivativesData, SynonymsData } from '@/types/word';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
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
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Words
  async searchWord(word: string): Promise<Word> {
    return this.fetch<Word>('/words/search', {
      method: 'POST',
      body: JSON.stringify({ word }),
    });
  }

  async getEtymology(word: string): Promise<Word> {
    return this.fetch<Word>(`/words/${encodeURIComponent(word)}/etymology`);
  }

  async getDerivatives(word: string): Promise<Word & { derivativesData?: DerivativesData }> {
    return this.fetch<Word>(`/words/${encodeURIComponent(word)}/derivatives`);
  }

  async getSynonyms(word: string): Promise<Word & { synonymsData?: SynonymsData }> {
    return this.fetch<Word>(`/words/${encodeURIComponent(word)}/synonyms`);
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
