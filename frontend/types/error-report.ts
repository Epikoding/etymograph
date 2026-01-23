export type IssueType = 'etymology' | 'definition' | 'derivative' | 'component' | 'synonym' | 'other';

export type ReportStatus = 'pending' | 'resolved' | 'dismissed';

export interface ErrorReport {
  id: number;
  userId: number;
  wordId: number;
  word: string;
  language: string;
  issueType: IssueType;
  description: string;
  status: ReportStatus;
  reviewedBy?: number;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitErrorReportRequest {
  wordId: number;
  issueType: IssueType;
  description: string;
}

export interface ErrorReportsResponse {
  data: ErrorReport[];
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface DashboardStats {
  totalReports: number;
  pendingReports: number;
  resolvedReports: number;
  dismissedReports: number;
  reportsByType: Record<IssueType, number>;
  topReportedWords: WordCount[];
  topSearchedWords: WordCount[];
}

export interface WordCount {
  word: string;
  count: number;
}

export interface SearchAnalyticsResponse {
  days: number;
  words: WordCount[];
}

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  etymology: '어원 정보 오류',
  definition: '정의/뜻 오류',
  derivative: '파생어 오류',
  component: '구성요소 오류',
  synonym: '동의어 오류',
  other: '기타',
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: '검토 대기',
  resolved: '수정 완료',
  dismissed: '기각',
};
