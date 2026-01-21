'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trash2, Search, ChevronLeft, ChevronRight, AlertCircle, LogIn } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type { SearchHistoryItem, SearchHistoryResponse } from '@/types/auth';
import Link from 'next/link';

export default function HistoryPage() {
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const fetchHistory = useCallback(async (pageNum: number) => {
    if (!isAuthenticated) return;

    setLoading(true);
    setError(null);

    try {
      const response: SearchHistoryResponse = await api.getSearchHistory(pageNum, 20);
      setHistory(response.data);
      setTotalPages(response.totalPages);
      setTotalCount(response.totalCount);
      setPage(response.page);
    } catch (err) {
      setError('Failed to load search history');
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchHistory(1);
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated, fetchHistory]);

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await api.deleteSearchHistory(id);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      setTotalCount((prev) => prev - 1);
    } catch (err) {
      console.error('Failed to delete history item:', err);
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to delete all search history?')) {
      return;
    }

    setDeletingAll(true);
    try {
      await api.deleteAllSearchHistory();
      setHistory([]);
      setTotalCount(0);
      setTotalPages(1);
    } catch (err) {
      console.error('Failed to delete all history:', err);
    } finally {
      setDeletingAll(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getLanguageLabel = (lang: string) => {
    const labels: Record<string, string> = {
      ko: 'Korean',
      ja: 'Japanese',
      zh: 'Chinese',
    };
    return labels[lang] || lang;
  };

  // Not authenticated
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-slate-800 flex items-center justify-center">
            <LogIn className="w-8 h-8 text-slate-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-4">
            Sign in to view your search history
          </h1>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">
            Track your word searches and easily revisit words you&apos;ve explored before.
          </p>
          <button
            onClick={login}
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-slate-100 mb-8">Search History</h1>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-slate-800 rounded-lg p-4 animate-pulse">
              <div className="h-5 w-32 bg-slate-700 rounded mb-2" />
              <div className="h-4 w-48 bg-slate-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-slate-100 mb-8">Search History</h1>
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => fetchHistory(page)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-slate-100">Search History</h1>
        {history.length > 0 && (
          <button
            onClick={handleDeleteAll}
            disabled={deletingAll}
            className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {deletingAll ? 'Deleting...' : 'Clear All'}
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="text-center py-16">
          <Search className="w-12 h-12 mx-auto mb-4 text-slate-600" />
          <p className="text-slate-400 mb-4">No search history found.</p>
          <Link
            href="/"
            className="inline-block px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          >
            Start Searching
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-400 mb-4">{totalCount} searches total</p>

          <div className="space-y-2">
            {history.map((item) => (
              <div
                key={item.id}
                className="bg-slate-800/50 hover:bg-slate-800 rounded-lg p-4 flex items-center justify-between transition-colors group"
              >
                <Link href={`/?word=${encodeURIComponent(item.word)}`} className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-medium text-slate-100">
                      {item.word}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded">
                      {getLanguageLabel(item.language)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    {formatDate(item.searchedAt)}
                  </p>
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete(item.id);
                  }}
                  disabled={deleting === item.id}
                  className="p-2 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                  title="Remove"
                >
                  {deleting === item.id ? (
                    <div className="w-5 h-5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="w-5 h-5" />
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                onClick={() => fetchHistory(page - 1)}
                disabled={page <= 1}
                className="flex items-center gap-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-slate-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => fetchHistory(page + 1)}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
