export interface User {
  id: number;
  provider: string;
  providerId: string;
  email: string;
  name: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

export interface SearchHistoryItem {
  id: number;
  userId: number;
  word: string;
  language: string;
  searchedAt: string;
}

export interface SearchHistoryResponse {
  data: SearchHistoryItem[];
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface HistoryDateSummary {
  date: string;
  count: number;
  languages: string[];
}

export interface HistoryDatesResponse {
  dates: HistoryDateSummary[];
  totalDays: number;
  totalSearches: number;
}

export interface HistoryDateDetailResponse {
  date: string;
  words: SearchHistoryItem[];
}
