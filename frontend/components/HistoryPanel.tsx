'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, ChevronRight, ChevronDown, Calendar, Search, Globe } from 'lucide-react';
import { api } from '@/lib/api';
import type { HistoryDateSummary, SearchHistoryItem } from '@/types/auth';

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// Language short codes for display
const languageShortCodes: Record<string, string> = {
  Korean: 'ko',
  Japanese: 'ja',
  Chinese: 'zh',
};

export default function HistoryPanel({ isOpen, onClose }: HistoryPanelProps) {
  const router = useRouter();
  const [dates, setDates] = useState<HistoryDateSummary[]>([]);
  const [totalSearches, setTotalSearches] = useState(0);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [dateDetails, setDateDetails] = useState<Record<string, SearchHistoryItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadingDate, setLoadingDate] = useState<string | null>(null);

  // Fetch date list when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchDates();
    }
  }, [isOpen]);

  const fetchDates = async () => {
    setLoading(true);
    try {
      const response = await api.getHistoryDates();
      setDates(response.dates || []);
      setTotalSearches(response.totalSearches);
    } catch (error) {
      console.error('Failed to fetch history dates:', error);
    } finally {
      setLoading(false);
    }
  };

  // Extract YYYY-MM-DD from date string (handles both "2026-01-21" and "2026-01-21T00:00:00Z")
  const extractDateOnly = (dateStr: string) => dateStr.split('T')[0];

  const handleDateClick = async (date: string) => {
    const dateKey = extractDateOnly(date);

    if (expandedDate === dateKey) {
      setExpandedDate(null);
      return;
    }

    setExpandedDate(dateKey);

    // Fetch detail if not cached
    if (!dateDetails[dateKey]) {
      setLoadingDate(dateKey);
      try {
        const response = await api.getHistoryDateDetail(dateKey);
        setDateDetails((prev) => ({ ...prev, [dateKey]: response.words || [] }));
      } catch (error) {
        console.error('Failed to fetch date detail:', error);
      } finally {
        setLoadingDate(null);
      }
    }
  };

  const handleWordClick = useCallback((word: string) => {
    router.push(`/?word=${encodeURIComponent(word)}`);
    onClose();
  }, [router, onClose]);

  // Format date for display (YYYY-MM-DD -> MMM DD)
  const formatDate = (dateStr: string) => {
    const dateOnly = extractDateOnly(dateStr);
    const date = new Date(dateOnly + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const inputDate = new Date(dateOnly + 'T00:00:00');
    inputDate.setHours(0, 0, 0, 0);

    if (inputDate.getTime() === today.getTime()) {
      return 'Today';
    }
    if (inputDate.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    }

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Format time for display (HH:MM)
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-80 bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            <span className="font-semibold text-slate-200">Search History</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Stats */}
        {totalSearches > 0 && (
          <div className="px-4 py-2 border-b border-slate-800 text-xs text-slate-400">
            {totalSearches} searches across {dates.length} days
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-500 border-t-transparent" />
            </div>
          ) : dates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-500">
              <Search className="w-8 h-8 mb-2" />
              <p className="text-sm">No search history yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {dates.map((dateSummary) => {
                const dateKey = extractDateOnly(dateSummary.date);
                return (
                <div key={dateKey}>
                  {/* Date header */}
                  <button
                    onClick={() => handleDateClick(dateSummary.date)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {expandedDate === dateKey ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                      <span className="text-sm text-slate-200">
                        {formatDate(dateSummary.date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {dateSummary.languages.map((lang) => (
                        <span
                          key={lang}
                          className="text-xs px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded"
                        >
                          {languageShortCodes[lang] || lang.slice(0, 2).toLowerCase()}
                        </span>
                      ))}
                      <span className="text-xs text-slate-500">
                        ({dateSummary.count})
                      </span>
                    </div>
                  </button>

                  {/* Expanded words list */}
                  {expandedDate === dateKey && (
                    <div className="bg-slate-800/30 border-t border-slate-800">
                      {loadingDate === dateKey ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent" />
                        </div>
                      ) : (
                        <div className="py-1">
                          {(dateDetails[dateKey] || []).map((item) => (
                            <button
                              key={item.id}
                              onClick={() => handleWordClick(item.word)}
                              className="w-full flex items-center justify-between px-4 pl-10 py-2 hover:bg-slate-700/50 transition-colors text-left"
                            >
                              <span className="text-sm text-slate-300 truncate">
                                {item.word}
                              </span>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded">
                                  {languageShortCodes[item.language] || item.language.slice(0, 2).toLowerCase()}
                                </span>
                                <span>{formatTime(item.searchedAt)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Animation styles */}
      <style jsx>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
