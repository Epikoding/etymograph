'use client';

import { useState, useEffect } from 'react';
import { api } from './api';

// Singleton cache - persists across component re-renders
let morphemeCache: {
  suffixes: Set<string>;
  prefixes: Set<string>;
} | null = null;

// Promise to prevent duplicate fetches
let loadingPromise: Promise<void> | null = null;

/**
 * Hook for caching morphemes (suffixes/prefixes) on page load.
 *
 * - Loads morpheme data once per page session
 * - Provides instant validation for suffixes (-er) and prefixes (un-)
 * - Falls back to API for regular words
 */
export function useMorphemeCache() {
  const [isLoaded, setIsLoaded] = useState(!!morphemeCache);

  useEffect(() => {
    // Already loaded
    if (morphemeCache) {
      setIsLoaded(true);
      return;
    }

    // Loading in progress from another component
    if (loadingPromise) {
      loadingPromise.then(() => setIsLoaded(true));
      return;
    }

    // Start loading
    loadingPromise = api.getMorphemes().then((data) => {
      morphemeCache = {
        suffixes: new Set(data.suffixes.map(s => s.toLowerCase())),
        prefixes: new Set(data.prefixes.map(p => p.toLowerCase())),
      };
      setIsLoaded(true);
      loadingPromise = null;
    }).catch((error) => {
      console.error('Failed to load morphemes:', error);
      loadingPromise = null;
    });
  }, []);

  /**
   * Check if a term exists in the morpheme cache.
   *
   * @param term - The term to check (suffix: -er, prefix: un-, word: teacher)
   * @returns
   *   - `true` if the suffix/prefix exists in cache
   *   - `false` if the suffix does NOT exist in cache
   *   - `null` if term is a regular word (should use API) or cache not loaded
   *          or if prefix not in cache (fallback to API with hyphen removed)
   */
  const existsInCache = (term: string): boolean | null => {
    if (!morphemeCache) return null; // Cache not loaded yet

    const normalized = term.toLowerCase().trim();

    // Suffix: starts with "-" (e.g., "-er", "-ing")
    if (normalized.startsWith('-')) {
      return morphemeCache.suffixes.has(normalized);
    }

    // Prefix: ends with "-" (e.g., "un-", "re-")
    // If not in cache, return null to fallback to API (with hyphen removed)
    if (normalized.endsWith('-')) {
      if (morphemeCache.prefixes.has(normalized)) {
        return true;
      }
      // Not a known prefix - fallback to API validation
      return null;
    }

    // Regular word: return null to indicate API should be used
    return null;
  };

  return { isLoaded, existsInCache };
}
