'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Shield,
  BarChart3,
  LogIn,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type { DashboardStats, ErrorReport, ReportStatus } from '@/types/error-report';
import { ISSUE_TYPE_LABELS, STATUS_LABELS } from '@/types/error-report';
import Link from 'next/link';

const STATUS_COLORS: Record<ReportStatus, string> = {
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  resolved: 'bg-green-500/20 text-green-400 border-green-500/30',
  dismissed: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const STATUS_ICONS: Record<ReportStatus, React.ReactNode> = {
  pending: <Clock className="w-4 h-4" />,
  resolved: <CheckCircle className="w-4 h-4" />,
  dismissed: <XCircle className="w-4 h-4" />,
};

export default function AdminPage() {
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | ''>('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedReport, setSelectedReport] = useState<ErrorReport | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const fetchStats = useCallback(async () => {
    if (!isAuthenticated) return;

    setStatsLoading(true);
    try {
      const data = await api.getAdminStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
      if ((err as Error).message?.includes('403')) {
        setError('접근 권한이 없습니다. Admin 계정으로 로그인해주세요.');
      }
    } finally {
      setStatsLoading(false);
    }
  }, [isAuthenticated]);

  const fetchReports = useCallback(async (pageNum: number, status?: ReportStatus | '') => {
    if (!isAuthenticated) return;

    setLoading(true);
    try {
      const response = await api.getAdminErrorReports(
        pageNum,
        10,
        status || undefined,
        undefined
      );
      setReports(response.data);
      setTotalPages(response.totalPages);
      setPage(response.page);
      setError(null);
    } catch (err) {
      console.error('Failed to load reports:', err);
      if ((err as Error).message?.includes('403')) {
        setError('접근 권한이 없습니다. Admin 계정으로 로그인해주세요.');
      } else {
        setError('신고 목록을 불러오는데 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchStats();
      fetchReports(1, statusFilter);
    } else if (!authLoading) {
      setLoading(false);
      setStatsLoading(false);
    }
  }, [authLoading, isAuthenticated, fetchStats, fetchReports, statusFilter]);

  const handleStatusChange = async (reportId: number, newStatus: ReportStatus) => {
    setUpdatingId(reportId);
    try {
      const updatedReport = await api.updateErrorReport(reportId, newStatus, reviewNote);
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? updatedReport : r))
      );
      setSelectedReport(null);
      setReviewNote('');
      // Refresh stats
      fetchStats();
    } catch (err) {
      console.error('Failed to update report:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Not authenticated
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-slate-800 flex items-center justify-center">
            <Shield className="w-8 h-8 text-slate-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-4">
            Admin Dashboard
          </h1>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">
            관리자 권한이 필요합니다. 로그인해주세요.
          </p>
          <button
            onClick={login}
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium"
          >
            <LogIn className="w-5 h-5" />
            로그인
          </button>
        </div>
      </div>
    );
  }

  // Access denied
  if (error?.includes('권한')) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-4">
            접근이 거부되었습니다
          </h1>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">
            {error}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  // Loading state
  if (authLoading || (statsLoading && loading)) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-slate-100 mb-8">Admin Dashboard</h1>
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-slate-800 rounded-lg p-4 h-24" />
            ))}
          </div>
          <div className="bg-slate-800 rounded-lg p-4 h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-8 h-8 text-indigo-400" />
        <h1 className="text-3xl font-bold text-slate-100">Admin Dashboard</h1>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">전체 신고</p>
                <p className="text-2xl font-bold text-white">{stats.totalReports}</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">검토 대기</p>
                <p className="text-2xl font-bold text-white">{stats.pendingReports}</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">수정 완료</p>
                <p className="text-2xl font-bold text-white">{stats.resolvedReports}</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-500/20 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-slate-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">기각</p>
                <p className="text-2xl font-bold text-white">{stats.dismissedReports}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Words Section */}
      {stats && (stats.topReportedWords.length > 0 || stats.topSearchedWords.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {stats.topReportedWords.length > 0 && (
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <h3 className="text-sm font-semibold text-slate-400 mb-3">가장 많이 신고된 단어</h3>
              <div className="space-y-2">
                {stats.topReportedWords.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Link
                      href={`/?word=${encodeURIComponent(item.word)}`}
                      className="text-white hover:text-indigo-400 transition-colors"
                    >
                      {item.word}
                    </Link>
                    <span className="text-sm text-red-400">{item.count}건</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.topSearchedWords.length > 0 && (
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <h3 className="text-sm font-semibold text-slate-400 mb-3">가장 많이 검색된 단어 (30일)</h3>
              <div className="space-y-2">
                {stats.topSearchedWords.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Link
                      href={`/?word=${encodeURIComponent(item.word)}`}
                      className="text-white hover:text-indigo-400 transition-colors"
                    >
                      {item.word}
                    </Link>
                    <span className="text-sm text-slate-400">{item.count}회</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reports Table */}
      <div className="bg-slate-800 rounded-lg border border-slate-700">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            오류 신고 목록
          </h2>

          {/* Status Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setStatusFilter('');
                fetchReports(1, '');
              }}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                statusFilter === ''
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              전체
            </button>
            <button
              onClick={() => {
                setStatusFilter('pending');
                fetchReports(1, 'pending');
              }}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                statusFilter === 'pending'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              대기중
            </button>
            <button
              onClick={() => {
                setStatusFilter('resolved');
                fetchReports(1, 'resolved');
              }}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                statusFilter === 'resolved'
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              완료
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
          </div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            신고된 내역이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {reports.map((report) => (
              <div
                key={report.id}
                className="p-4 hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Link
                        href={`/?word=${encodeURIComponent(report.word)}`}
                        className="text-lg font-medium text-white hover:text-indigo-400 transition-colors"
                      >
                        {report.word}
                      </Link>
                      <span className={`px-2 py-0.5 text-xs rounded border ${STATUS_COLORS[report.status as ReportStatus]}`}>
                        {STATUS_ICONS[report.status as ReportStatus]}
                        <span className="ml-1">{STATUS_LABELS[report.status as ReportStatus]}</span>
                      </span>
                      <span className="px-2 py-0.5 text-xs rounded bg-slate-700 text-slate-300">
                        {ISSUE_TYPE_LABELS[report.issueType as keyof typeof ISSUE_TYPE_LABELS]}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 mb-2">{report.description}</p>
                    <p className="text-xs text-slate-500">{formatDate(report.createdAt)}</p>
                    {report.reviewNote && (
                      <p className="text-xs text-slate-400 mt-2 p-2 bg-slate-900/50 rounded">
                        관리자 메모: {report.reviewNote}
                      </p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  {report.status === 'pending' && (
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => setSelectedReport(report)}
                        disabled={updatingId === report.id}
                        className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        {updatingId === report.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          '처리'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-center gap-4">
            <button
              onClick={() => fetchReports(page - 1, statusFilter)}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              이전
            </button>
            <span className="text-slate-400 text-sm">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => fetchReports(page + 1, statusFilter)}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Status Update Modal */}
      {selectedReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedReport(null)}
        >
          <div
            className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl w-full max-w-md mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">신고 처리</h3>
            </div>
            <div className="p-4">
              <div className="mb-4 p-3 bg-slate-900/50 rounded-lg">
                <p className="text-white font-medium mb-1">{selectedReport.word}</p>
                <p className="text-sm text-slate-400">{selectedReport.description}</p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  관리자 메모 (선택)
                </label>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="처리 내용을 입력하세요..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleStatusChange(selectedReport.id, 'resolved')}
                  disabled={updatingId === selectedReport.id}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {updatingId === selectedReport.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      수정 완료
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleStatusChange(selectedReport.id, 'dismissed')}
                  disabled={updatingId === selectedReport.id}
                  className="flex-1 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {updatingId === selectedReport.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" />
                      기각
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
