'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import EtymologyGraph from '@/components/EtymologyGraph';
import AnimatedGraphBackground from '@/components/AnimatedGraphBackground';
import LoadingSpinner from '@/components/LoadingSpinner';

const EXAMPLE_WORDS = ['philosophy', 'transport', 'manuscript', 'telegraph', 'democracy', 'biology'];

export default function Home() {
  const [query, setQuery] = useState('');
  const [searchedWord, setSearchedWord] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearchedWord(query.trim().toLowerCase());
  };

  const handleWordSelect = (word: string) => {
    setQuery(word);
  };

  const handleExampleClick = (word: string) => {
    setLoading(true);
    setQuery(word);
    setSearchedWord(word);
  };

  const handleInitialLoad = () => {
    setLoading(false);
  };

  const handleBackToHome = () => {
    setSearchedWord(null);
    setQuery('');
  };

  // Landing page with animated background
  if (!searchedWord) {
    return (
      <div className="relative h-[calc(100vh-64px)] overflow-hidden">
        {/* Animated Graph Background */}
        <AnimatedGraphBackground />

        {/* Gradient overlay for better readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/30 via-transparent to-slate-900/50 pointer-events-none" />

        {/* Centered Content */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full px-6">
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight">
              Etymo<span className="text-indigo-400">Graph</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-300 max-w-lg mx-auto">
              어원을 통해 단어 사이의 숨겨진 연결고리를 발견하세요
            </p>
            <p className="text-sm text-slate-400 mt-2">
              단어를 클릭하면 수천 년의 여정이 펼쳐집니다
            </p>
          </div>

          {/* Search Box */}
          <div className="w-full max-w-2xl">
            <form onSubmit={handleSearch} className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="영어 단어를 입력하세요..."
                  className="w-full px-6 py-4 pl-12 text-lg text-white bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all placeholder-slate-400"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <button
                  type="submit"
                  disabled={loading || !query.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/25"
                >
                  {loading ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    '탐색'
                  )}
                </button>
              </div>
            </form>

            {/* Example Words */}
            <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
              <span className="text-slate-400 text-sm">추천:</span>
              {EXAMPLE_WORDS.map((word) => (
                <button
                  key={word}
                  onClick={() => handleExampleClick(word)}
                  className="px-4 py-1.5 text-sm text-slate-300 bg-slate-800/50 hover:bg-slate-700/70 hover:text-white border border-slate-600/50 rounded-full transition-all backdrop-blur-sm"
                >
                  {word}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-slate-700/50">
              <div className="w-3 h-3 rounded-full bg-indigo-500 shadow-lg shadow-indigo-500/50" />
              <span className="text-slate-300 text-sm">단어</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-slate-700/50">
              <div className="w-3 h-3 rounded-full bg-amber-500 shadow-lg shadow-amber-500/50" />
              <span className="text-slate-300 text-sm">어근</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-slate-700/50">
              <div className="w-3 h-3 rounded-full bg-rose-500 shadow-lg shadow-rose-500/50" />
              <span className="text-slate-300 text-sm">접사</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-slate-700/50">
              <div className="w-3 h-3 rounded-full bg-cyan-500 shadow-lg shadow-cyan-500/50" />
              <span className="text-slate-300 text-sm">파생어</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-slate-700/50">
              <div className="w-3 h-3 rounded-full bg-purple-500 shadow-lg shadow-purple-500/50" />
              <span className="text-slate-300 text-sm">동의어</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Graph view after search
  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Compact Search Header */}
      <div className="flex-shrink-0 px-6 py-3 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          {/* Back button */}
          <button
            onClick={handleBackToHome}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="홈으로"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="다른 단어 검색..."
                className="w-full px-4 py-2 pl-10 text-white bg-slate-800 border border-slate-700 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors placeholder-slate-500"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  '검색'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Graph View */}
      <div className="flex-1 relative">
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900">
            <LoadingSpinner size="lg" />
          </div>
        )}
        <EtymologyGraph
          initialWord={searchedWord}
          language="Korean"
          onWordSelect={handleWordSelect}
          onInitialLoad={handleInitialLoad}
        />
      </div>
    </div>
  );
}
