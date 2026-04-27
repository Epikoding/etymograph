'use client';

import { useState, useEffect } from 'react';
import { ArrowRight, Scale } from 'lucide-react';
import { api } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { SynonymsData } from '@/types/word';

interface SynonymCompareProps {
  word: string;
  onExplore: (word: string) => void;
}

export default function SynonymCompare({ word, onExplore }: SynonymCompareProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SynonymsData | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    api.getSynonyms(word)
      .then((result) => {
        setData(result.synonyms as SynonymsData || null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load synonyms');
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

  if (!data || !data.synonyms?.length) {
    return (
      <div className="p-6 text-center text-gray-500">
        No synonym comparisons available for this word.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Main Word Definition */}
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Scale className="w-5 h-5 text-blue-500" />
          <span className="font-semibold text-gray-900 capitalize">{data.word}</span>
        </div>
        <p className="text-gray-700 ml-7">{data.definition}</p>
      </div>

      {/* Synonyms Comparison */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Synonyms & Nuances
        </h3>
        <div className="space-y-4">
          {data.synonyms.map((synonym, index) => (
            <div
              key={index}
              className="border rounded-lg overflow-hidden"
            >
              <button
                onClick={() => onExplore(synonym.word)}
                className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-primary-50 transition-colors"
              >
                <span className="font-semibold text-gray-900 hover:text-primary-600 capitalize">
                  {synonym.word}
                </span>
                <ArrowRight className="w-5 h-5 text-gray-300" />
              </button>
              <div className="p-4 space-y-3">
                <div>
                  <span className="text-xs font-semibold text-gray-400 uppercase">Definition</span>
                  <p className="text-gray-700">{synonym.definition}</p>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg">
                  <span className="text-xs font-semibold text-amber-600 uppercase">Nuance</span>
                  <p className="text-amber-900">{synonym.nuance}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-400 uppercase">When to Use</span>
                  <p className="text-gray-700">{synonym.usage}</p>
                </div>
                {synonym.example && (
                  <div className="bg-gray-50 p-3 rounded-lg italic text-gray-600">
                    "{synonym.example}"
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
