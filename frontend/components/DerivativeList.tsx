'use client';

import { useState, useEffect } from 'react';
import { Loader2, ArrowRight, GitFork } from 'lucide-react';
import { api } from '@/lib/api';
import type { DerivativesData } from '@/types/word';

interface DerivativeListProps {
  word: string;
  onExplore: (word: string) => void;
}

export default function DerivativeList({ word, onExplore }: DerivativeListProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DerivativesData | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    api.getDerivatives(word)
      .then((result) => {
        // The derivatives data might be in a nested structure
        const derivativesData = (result as { derivativesData?: DerivativesData }).derivativesData || {
          word,
          root: '',
          rootMeaning: '',
          derivatives: result.derivatives?.map((d: string) => ({
            word: d,
            meaning: '',
            relationship: '',
          })) || [],
        };
        setData(derivativesData);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load derivatives');
      })
      .finally(() => setLoading(false));
  }, [word]);

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
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

  if (!data || !data.derivatives?.length) {
    return (
      <div className="p-6 text-center text-gray-500">
        No derivatives found for this word.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Root Information */}
      {data.root && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <GitFork className="w-5 h-5 text-purple-500" />
            <span className="font-semibold text-gray-900">Common Root:</span>
            <span className="font-mono text-purple-700">{data.root}</span>
          </div>
          {data.rootMeaning && (
            <p className="text-gray-600 ml-7">{data.rootMeaning}</p>
          )}
        </div>
      )}

      {/* Derivatives List */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Related Words ({data.derivatives.length})
        </h3>
        <div className="grid gap-3">
          {data.derivatives.map((derivative, index) => (
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
                {derivative.relationship && (
                  <p className="text-xs text-gray-400 mt-1">{derivative.relationship}</p>
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
