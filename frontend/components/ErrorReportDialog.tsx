'use client';

import { useState, useEffect } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type { IssueType } from '@/types/error-report';
import { ISSUE_TYPE_LABELS } from '@/types/error-report';

interface ErrorReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  wordId: number;
  word: string;
  defaultIssueType?: IssueType;
}

const ISSUE_TYPES: IssueType[] = ['etymology', 'definition', 'derivative', 'component', 'synonym', 'other'];

export default function ErrorReportDialog({
  isOpen,
  onClose,
  wordId,
  word,
  defaultIssueType = 'etymology',
}: ErrorReportDialogProps) {
  const { isAuthenticated, login } = useAuth();
  const [issueType, setIssueType] = useState<IssueType>(defaultIssueType);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Sync issueType when defaultIssueType changes (e.g., different flag buttons)
  useEffect(() => {
    setIssueType(defaultIssueType);
  }, [defaultIssueType]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('설명을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.submitErrorReport({
        wordId,
        issueType,
        description: description.trim(),
      });
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setDescription('');
        setIssueType(defaultIssueType);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '신고 제출에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">오류 신고</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {!isAuthenticated ? (
            <div className="text-center py-4">
              <p className="text-slate-300 mb-4">
                오류 신고를 위해 로그인이 필요합니다.
              </p>
              <button
                onClick={login}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                로그인
              </button>
            </div>
          ) : success ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-400 font-medium">신고가 접수되었습니다!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Word Info */}
              <div className="mb-4 p-3 bg-slate-900/50 rounded-lg">
                <span className="text-slate-400 text-sm">신고 대상:</span>
                <span className="ml-2 text-white font-medium">{word}</span>
              </div>

              {/* Issue Type */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  오류 유형
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ISSUE_TYPES.map((type) => (
                    <label
                      key={type}
                      className={`flex items-center p-2 rounded-lg cursor-pointer transition-colors ${
                        issueType === type
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="issueType"
                        value={type}
                        checked={issueType === type}
                        onChange={(e) => setIssueType(e.target.value as IssueType)}
                        className="sr-only"
                      />
                      <span className="text-sm">{ISSUE_TYPE_LABELS[type]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  상세 설명 <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="어떤 오류가 있는지 설명해주세요..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
                  rows={4}
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    제출 중...
                  </>
                ) : (
                  '신고 제출'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
