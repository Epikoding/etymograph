import type { Word, Session, SessionGraph, DerivativesData, SynonymsData, EtymologyRevision } from '@/types/word';
import type { SearchHistoryResponse, HistoryDatesResponse, HistoryDateDetailResponse } from '@/types/auth';
import type { ErrorReport, ErrorReportsResponse, SubmitErrorReportRequest, DashboardStats, SearchAnalyticsResponse, ReportStatus } from '@/types/error-report';

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
  private _getAccessToken: (() => string | null) | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // Set the function to get access token from auth context
  setTokenGetter(getter: () => string | null): void {
    this._getAccessToken = getter;
  }

  // Get/Set current language
  get language(): SupportedLanguage {
    return this._language;
  }

  setLanguage(lang: SupportedLanguage): void {
    this._language = lang;
  }

  private getAuthHeaders(): Record<string, string> {
    const token = this._getAccessToken?.();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
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

  // Check if word exists in dictionary (words.txt)
  async wordExists(word: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/words/${encodeURIComponent(word)}/exists`
      );
      if (!response.ok) return false;
      const data = await response.json();
      return data.exists === true;
    } catch {
      return false;
    }
  }

  // Get morphemes (suffixes and prefixes) for frontend caching
  async getMorphemes(): Promise<{ suffixes: string[]; prefixes: string[] }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/morphemes`);
      if (!response.ok) {
        return { suffixes: [], prefixes: [] };
      }
      return response.json();
    } catch {
      return { suffixes: [], prefixes: [] };
    }
  }

  async getDerivatives(word: string, language?: SupportedLanguage): Promise<{ word: string; language: string; derivatives: Array<{ word: string; meaning: string }> }> {
    const lang = language || this._language;
    return this.fetch<{ word: string; language: string; derivatives: Array<{ word: string; meaning: string }> }>(`/words/${encodeURIComponent(word)}/derivatives?language=${lang}`);
  }

  async getSynonyms(word: string, language?: SupportedLanguage): Promise<{ word: string; language: string; synonyms: SynonymsData }> {
    const lang = language || this._language;
    return this.fetch<{ word: string; language: string; synonyms: SynonymsData }>(`/words/${encodeURIComponent(word)}/synonyms?language=${lang}`);
  }

  // Etymology refresh - creates a new revision
  async refreshEtymology(word: string, language?: SupportedLanguage): Promise<Word> {
    const lang = language || this._language;
    return this.fetch<Word>(`/words/${encodeURIComponent(word)}/refresh?language=${lang}`, {
      method: 'POST',
    });
  }

  // Get all revisions for a word
  async getRevisions(word: string, language?: SupportedLanguage): Promise<{ word: string; language: string; revisions: EtymologyRevision[] }> {
    const lang = language || this._language;
    return this.fetch<{ word: string; language: string; revisions: EtymologyRevision[] }>(`/words/${encodeURIComponent(word)}/revisions?language=${lang}`);
  }

  // Get a specific revision
  async getRevision(word: string, revisionNumber: number, language?: SupportedLanguage): Promise<EtymologyRevision> {
    const lang = language || this._language;
    return this.fetch<EtymologyRevision>(`/words/${encodeURIComponent(word)}/revisions/${revisionNumber}?language=${lang}`);
  }

  // Select a revision (requires auth)
  async selectRevision(word: string, revisionNumber: number, language?: SupportedLanguage): Promise<Word> {
    const lang = language || this._language;
    return this.fetch<Word>(`/words/${encodeURIComponent(word)}/revisions/${revisionNumber}/select?language=${lang}`, {
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

  // Search History
  async getSearchHistory(page: number = 1, limit: number = 20): Promise<SearchHistoryResponse> {
    return this.fetch<SearchHistoryResponse>(`/history?page=${page}&limit=${limit}`);
  }

  async deleteSearchHistory(id: number): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(`/history/${id}`, {
      method: 'DELETE',
    });
  }

  async deleteAllSearchHistory(): Promise<{ message: string; count: number }> {
    return this.fetch<{ message: string; count: number }>('/history', {
      method: 'DELETE',
    });
  }

  // History by date
  async getHistoryDates(): Promise<HistoryDatesResponse> {
    return this.fetch<HistoryDatesResponse>('/history/dates');
  }

  async getHistoryDateDetail(date: string): Promise<HistoryDateDetailResponse> {
    return this.fetch<HistoryDateDetailResponse>(`/history/dates/${date}`);
  }

  // Error Reports
  async submitErrorReport(request: SubmitErrorReportRequest): Promise<ErrorReport> {
    return this.fetch<ErrorReport>('/error-reports', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getMyErrorReports(page: number = 1, limit: number = 20): Promise<ErrorReportsResponse> {
    return this.fetch<ErrorReportsResponse>(`/error-reports/my?page=${page}&limit=${limit}`);
  }

  // Admin APIs
  async getAdminStats(): Promise<DashboardStats> {
    return this.fetch<DashboardStats>('/admin/stats');
  }

  async getAdminErrorReports(
    page: number = 1,
    limit: number = 20,
    status?: ReportStatus,
    issueType?: string
  ): Promise<ErrorReportsResponse> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.append('status', status);
    if (issueType) params.append('issueType', issueType);
    return this.fetch<ErrorReportsResponse>(`/admin/error-reports?${params.toString()}`);
  }

  async updateErrorReport(
    id: number,
    status: ReportStatus,
    reviewNote?: string
  ): Promise<ErrorReport> {
    return this.fetch<ErrorReport>(`/admin/error-reports/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status, reviewNote }),
    });
  }

  async getSearchAnalytics(days: number = 30, limit: number = 20): Promise<SearchAnalyticsResponse> {
    return this.fetch<SearchAnalyticsResponse>(`/admin/search-analytics?days=${days}&limit=${limit}`);
  }
}

export const api = new ApiClient(API_URL);
