'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import EtymologyGraph from '@/components/EtymologyGraph';
import AnimatedGraphBackground from '@/components/AnimatedGraphBackground';
import LoadingSpinner from '@/components/LoadingSpinner';
import { api } from '@/lib/api';

const EXAMPLE_WORDS = ['philosophy', 'transport', 'abstract', 'telegraph', 'democracy', 'image'];

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [searchedWord, setSearchedWord] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<{ priority: string[]; general: string[] }>({ priority: [], general: [] });
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Helper function to search a word and update URL
  const searchWord = useCallback((word: string) => {
    setQuery(word);
    setShowSuggestions(false);
    setLoading(true);
    setSearchedWord(word);
    // Update URL so logo click can detect the change
    router.push(`/?word=${encodeURIComponent(word)}`, { scroll: false });
  }, [router]);

  // Handle URL query parameter for word search (e.g., /?word=teacher)
  useEffect(() => {
    const wordFromUrl = searchParams.get('word');

    console.log('[DEBUG] useEffect triggered:', {
      wordFromUrl,
      searchedWord
    });

    if (wordFromUrl && wordFromUrl !== searchedWord) {
      // URL has word param that differs from current - trigger search
      console.log('[DEBUG] Setting word from URL:', wordFromUrl);
      setQuery(wordFromUrl);
      setLoading(true);
      setSearchedWord(wordFromUrl);
    } else if (!wordFromUrl && searchedWord) {
      // URL has no word param but we have a searched word - reset to landing page
      console.log('[DEBUG] Resetting to landing page');
      setSearchedWord(null);
      setQuery('');
    }
  }, [searchParams, searchedWord]);

  // Helper to get all suggestions as a flat array for keyboard navigation
  const allSuggestions = [...suggestions.priority, ...suggestions.general];
  const hasSuggestions = allSuggestions.length > 0;

  // Debounced fetch suggestions
  useEffect(() => {
    // Don't fetch suggestions while loading or if query matches searchedWord
    const queryNormalized = query.trim().toLowerCase();
    if (query.length < 2 || loading || queryNormalized === searchedWord) {
      setSuggestions({ priority: [], general: [] });
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      // Double-check states before showing results
      if (loading || queryNormalized === searchedWord) return;
      const results = await api.getSuggestions(query);
      setSuggestions(results);
      setSelectedIndex(-1);
      setShowSuggestions(results.priority.length > 0 || results.general.length > 0);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, loading, searchedWord]);

  // Close suggestions when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedInSuggestions = suggestionsRef.current?.contains(target) ?? false;
      const clickedInInput = inputRef.current?.contains(target) ?? false;

      if (showSuggestions && !clickedInSuggestions && !clickedInInput) {
        setShowSuggestions(false);
      }
    };

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showSuggestions) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [showSuggestions]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showSuggestions || !hasSuggestions) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < allSuggestions.length - 1 ? prev + 1 : prev));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case 'Enter':
          if (selectedIndex >= 0) {
            e.preventDefault();
            searchWord(allSuggestions[selectedIndex]);
          }
          break;
        case 'Escape':
          setShowSuggestions(false);
          setSelectedIndex(-1);
          break;
      }
    },
    [showSuggestions, hasSuggestions, allSuggestions, selectedIndex, searchWord]
  );

  const handleSuggestionClick = (word: string) => {
    searchWord(word);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSuggestions({ priority: [], general: [] });
    searchWord(query.trim().toLowerCase());
  };

  const handleWordSelect = (_word: string) => {
    // 그래프 노드 클릭 시 검색란 업데이트 안 함
    // 그래프 내부에서 loadWord로 확장만 처리
  };

  const handleExampleClick = (word: string) => {
    searchWord(word);
  };

  const handleInitialLoad = () => {
    setLoading(false);
  };

  const isLandingPage = !searchedWord;

  return (
    <div className="relative h-[calc(100vh-64px)] overflow-hidden">
      {/* Animated Graph Background - always mounted */}
      <AnimatedGraphBackground isPaused={!isLandingPage} />

      {/* Landing Page Content */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${isLandingPage ? 'opacity-100 z-10' : 'opacity-0 -z-10 pointer-events-none'}`}>
        {/* Dark overlay with blur and vignette effect */}
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] pointer-events-none z-[1]" />
        <div
          className="absolute inset-0 pointer-events-none z-[2]"
          style={{
            boxShadow: 'inset 0 0 150px 50px rgba(0, 0, 0, 0.4)'
          }}
        />

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
                  ref={isLandingPage ? inputRef : undefined}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => hasSuggestions && setShowSuggestions(true)}
                  placeholder="영어 단어를 입력하세요..."
                  className="w-full px-6 py-4 pl-12 text-lg text-white bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all placeholder-slate-400"
                  autoComplete="off"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <button
                  type="submit"
                  disabled={loading || !query.trim() || query.trim() === '-'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/25"
                >
                  {loading ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    '탐색'
                  )}
                </button>

                {/* Autocomplete Dropdown */}
                {isLandingPage && showSuggestions && hasSuggestions && (
                  <div
                    ref={suggestionsRef}
                    className="absolute top-full left-0 right-0 mt-2 bg-slate-800/95 backdrop-blur-sm border border-slate-600 rounded-xl overflow-hidden shadow-xl z-50"
                  >
                    {/* Priority suggestions */}
                    {suggestions.priority.map((word, index) => (
                      <button
                        key={`priority-${word}`}
                        type="button"
                        onClick={() => handleSuggestionClick(word)}
                        className={`w-full px-6 py-3 text-left text-white transition-colors flex items-center gap-2 ${
                          index === selectedIndex
                            ? 'bg-indigo-600'
                            : 'bg-amber-900/30 hover:bg-amber-900/50'
                        }`}
                      >
                        <span className="text-amber-400 text-xs">★</span>
                        <span>
                          <span className="text-indigo-400">{word.slice(0, query.length)}</span>
                          <span>{word.slice(query.length)}</span>
                        </span>
                      </button>
                    ))}
                    {/* Divider between priority and general */}
                    {suggestions.priority.length > 0 && suggestions.general.length > 0 && (
                      <div className="border-t border-slate-600 my-1" />
                    )}
                    {/* General suggestions */}
                    {suggestions.general.map((word, index) => {
                      const actualIndex = suggestions.priority.length + index;
                      return (
                        <button
                          key={`general-${word}`}
                          type="button"
                          onClick={() => handleSuggestionClick(word)}
                          className={`w-full px-6 py-3 text-left text-white transition-colors ${
                            actualIndex === selectedIndex
                              ? 'bg-indigo-600'
                              : 'hover:bg-slate-700'
                          }`}
                        >
                          <span className="text-indigo-400">{word.slice(0, query.length)}</span>
                          <span>{word.slice(query.length)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
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

      {/* Graph View */}
      <div className={`absolute inset-0 flex flex-col transition-opacity duration-300 ${!isLandingPage ? 'opacity-100 z-10' : 'opacity-0 -z-10 pointer-events-none'}`}>
        {/* Compact Search Header */}
        <div className="flex-shrink-0 px-6 py-3 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 relative z-30">
          <div className="max-w-4xl mx-auto">
            {/* Search Form */}
            <form onSubmit={handleSearch}>
              <div className="relative">
                <input
                  ref={!isLandingPage ? inputRef : undefined}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => hasSuggestions && setShowSuggestions(true)}
                  placeholder="다른 단어 검색..."
                  className="w-full px-4 py-2 pl-10 text-white bg-slate-800 border border-slate-700 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors placeholder-slate-500"
                  autoComplete="off"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <button
                  type="submit"
                  disabled={loading || !query.trim() || query.trim() === '-'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    '검색'
                  )}
                </button>

                {/* Autocomplete Dropdown */}
                {!isLandingPage && showSuggestions && hasSuggestions && (
                  <div
                    ref={suggestionsRef}
                    className="absolute top-full left-0 right-0 mt-1 bg-slate-800/95 backdrop-blur-sm border border-slate-600 rounded-lg overflow-hidden shadow-xl z-50"
                  >
                    {/* Priority suggestions */}
                    {suggestions.priority.map((word, index) => (
                      <button
                        key={`priority-${word}`}
                        type="button"
                        onClick={() => handleSuggestionClick(word)}
                        className={`w-full px-4 py-2 text-left text-white text-sm transition-colors flex items-center gap-2 ${
                          index === selectedIndex
                            ? 'bg-indigo-600'
                            : 'bg-amber-900/30 hover:bg-amber-900/50'
                        }`}
                      >
                        <span className="text-amber-400 text-xs">★</span>
                        <span>
                          <span className="text-indigo-400">{word.slice(0, query.length)}</span>
                          <span>{word.slice(query.length)}</span>
                        </span>
                      </button>
                    ))}
                    {/* Divider between priority and general */}
                    {suggestions.priority.length > 0 && suggestions.general.length > 0 && (
                      <div className="border-t border-slate-600 my-1" />
                    )}
                    {/* General suggestions */}
                    {suggestions.general.map((word, index) => {
                      const actualIndex = suggestions.priority.length + index;
                      return (
                        <button
                          key={`general-${word}`}
                          type="button"
                          onClick={() => handleSuggestionClick(word)}
                          className={`w-full px-4 py-2 text-left text-white text-sm transition-colors ${
                            actualIndex === selectedIndex
                              ? 'bg-indigo-600'
                              : 'hover:bg-slate-700'
                        }`}
                        >
                          <span className="text-indigo-400">{word.slice(0, query.length)}</span>
                          <span>{word.slice(query.length)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Graph View */}
        <div
          className="flex-1 relative"
          onClick={() => {
            if (showSuggestions) {
              setShowSuggestions(false);
            }
          }}
        >
          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900">
              <LoadingSpinner size="lg" />
            </div>
          )}
          {searchedWord && (
            <EtymologyGraph
              initialWord={searchedWord}
              language="Korean"
              onWordSelect={handleWordSelect}
              onInitialLoad={handleInitialLoad}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="h-[calc(100vh-64px)] flex items-center justify-center"><LoadingSpinner size="lg" /></div>}>
      <HomeContent />
    </Suspense>
  );
}
