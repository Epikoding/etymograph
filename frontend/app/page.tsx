'use client';

import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import EtymologyGraph from '@/components/EtymologyGraph';

export default function Home() {
  const [query, setQuery] = useState('');
  const [searchedWord, setSearchedWord] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearchedWord(query.trim().toLowerCase());
  };

  const handleWordSelect = (word: string) => {
    setQuery(word);
  };

  const handleExampleClick = (word: string) => {
    setQuery(word);
    setSearchedWord(word);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Search Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-slate-900 border-b border-slate-800">
        <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter a word to explore its origins..."
              className="w-full px-5 py-3 pl-12 text-white bg-slate-800 border border-slate-700 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors placeholder-slate-500"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Explore'
              )}
            </button>
          </div>
        </form>

        {/* Example words */}
        {!searchedWord && (
          <div className="flex items-center justify-center gap-2 mt-3 text-sm">
            <span className="text-slate-500">Try:</span>
            {['pretext', 'philosophy', 'manuscript', 'telegram'].map((word) => (
              <button
                key={word}
                onClick={() => handleExampleClick(word)}
                className="px-3 py-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
              >
                {word}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Graph View */}
      <div className="flex-1 relative">
        {searchedWord ? (
          <EtymologyGraph
            initialWord={searchedWord}
            onWordSelect={handleWordSelect}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
            <div className="text-center max-w-md">
              <h1 className="text-3xl font-bold text-white mb-3">
                EtymoGraph
              </h1>
              <p className="text-slate-400 mb-6">
                Explore word origins visually. Search a word to see its etymology,
                components, and derivatives in an interactive graph.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 rounded-full text-xs">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <span className="text-slate-300">Words</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 rounded-full text-xs">
                  <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  <span className="text-slate-300">Components</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 rounded-full text-xs">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                  <span className="text-slate-300">Derivatives</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 rounded-full text-xs">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-slate-300">Roots</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
