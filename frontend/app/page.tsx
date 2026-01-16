'use client';

import { useState } from 'react';
import { Search, Loader2, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import type { Word } from '@/types/word';
import EtymologyCard from '@/components/EtymologyCard';
import DerivativeList from '@/components/DerivativeList';
import SynonymCompare from '@/components/SynonymCompare';

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Word | null>(null);
  const [activeTab, setActiveTab] = useState<'etymology' | 'derivatives' | 'synonyms'>('etymology');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const word = await api.searchWord(query.trim());
      setResult(word);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExploreWord = (word: string) => {
    setQuery(word);
    // Auto-search
    setLoading(true);
    setError(null);
    api.searchWord(word)
      .then(setResult)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResult(null);
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Discover Word Origins
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Explore the etymology of English words, find related derivatives,
          and understand nuanced differences between synonyms.
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a word to explore..."
            className="w-full px-6 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Search className="w-5 h-5" />
            )}
            Search
          </button>
        </div>
      </form>

      {/* Error Message */}
      {error && (
        <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Word Title */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-3xl font-bold text-gray-900 capitalize">
              {result.word}
            </h2>
            {result.etymology?.modernMeaning && (
              <p className="mt-2 text-gray-600">{result.etymology.modernMeaning}</p>
            )}
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            {(['etymology', 'derivatives', 'synonyms'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-xl shadow-sm border">
            {activeTab === 'etymology' && (
              <EtymologyCard etymology={result.etymology} />
            )}
            {activeTab === 'derivatives' && (
              <DerivativeList
                word={result.word}
                onExplore={handleExploreWord}
              />
            )}
            {activeTab === 'synonyms' && (
              <SynonymCompare
                word={result.word}
                onExplore={handleExploreWord}
              />
            )}
          </div>
        </div>
      )}

      {/* Example Words */}
      {!result && !loading && (
        <div className="text-center mt-12">
          <p className="text-gray-500 mb-4">Try exploring these words:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {['pretext', 'etymology', 'philosophy', 'manuscript', 'telegram'].map(
              (word) => (
                <button
                  key={word}
                  onClick={() => handleExploreWord(word)}
                  className="px-4 py-2 bg-gray-100 hover:bg-primary-50 hover:text-primary-600 rounded-full text-gray-700 transition-colors flex items-center gap-1"
                >
                  {word}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
