'use client';

import { useState, useEffect } from 'react';
import { Trash2, Download, ExternalLink } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';
import FadeTransition from '@/components/FadeTransition';

// Note: This is a placeholder. In a real app, you'd store session IDs
// in localStorage or a backend service.

interface HistoryItem {
  id: string;
  name: string;
  wordCount: number;
  createdAt: string;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load history from localStorage
    const stored = localStorage.getItem('etymograph-history');
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch {
        // Ignore parse errors
      }
    }
    setLoading(false);
  }, []);

  const removeFromHistory = (id: string) => {
    const updated = history.filter((item) => item.id !== id);
    setHistory(updated);
    localStorage.setItem('etymograph-history', JSON.stringify(updated));
  };

  if (loading) {
    return (
      <FadeTransition show={loading} className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </FadeTransition>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Exploration History
      </h1>

      {history.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">
            No exploration sessions found.
          </p>
          <a
            href="/"
            className="inline-block px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Start Exploring
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {history.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-lg shadow-sm border p-4 flex items-center justify-between"
            >
              <div>
                <h2 className="font-semibold text-gray-900">{item.name}</h2>
                <p className="text-sm text-gray-500">
                  {item.wordCount} words &bull;{' '}
                  {new Date(item.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/explore/${item.id}`}
                  className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                  title="Open"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
                <a
                  href={`/api/export/${item.id}?format=md`}
                  className="p-2 text-gray-400 hover:text-green-600 transition-colors"
                  title="Export"
                >
                  <Download className="w-5 h-5" />
                </a>
                <button
                  onClick={() => removeFromHistory(item.id)}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                  title="Remove"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
