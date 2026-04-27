'use client';

import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';

interface DerivativeItem {
  word: string;
  meaning: string;
}

interface DerivativeListProps {
  word: string;
  onExplore: (word: string) => void;
}

export default function DerivativeList({ word, onExplore }: DerivativeListProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [derivatives, setDerivatives] = useState<DerivativeItem[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    api.getDerivatives(word)
      .then((result) => {
        setDerivatives(result.derivatives || []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load derivatives');
      })
      .finally(() => setLoading(false));
  }, [word]);

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        {error}
      </div>
    );
  }

  if (!derivatives.length) {
    return (
      <div className="p-6 text-center text-gray-500">
        No derivatives found for this word.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Derivatives List */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Related Words ({derivatives.length})
        </h3>
        <div className="grid gap-3">
          {derivatives.map((derivative, index) => (
            <button
              key={index}
              onClick={() => onExplore(derivative.word)}
              className="group flex items-center justify-between p-4 bg-gray-50 hover:bg-primary-50 rounded-lg transition-colors text-left"
            >
              <div className="flex-1">
                <span className="font-semibold text-gray-900 group-hover:text-primary-600">
                  {derivative.word}
                </span>
                {derivative.meaning && (
                  <p className="text-sm text-gray-600 mt-1">{derivative.meaning}</p>
                )}
              </div>
              <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-primary-500 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
