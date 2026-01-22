/**
 * Morpheme Validator
 *
 * LLM이 생성한 잘못된 접사(예: "-ew", "-eview")를 필터링하기 위한 검증 모듈.
 * MorphyNet(https://github.com/kbatsuren/MorphyNet) 기반 유효 형태소 목록 사용.
 *
 * 동적 로딩으로 초기 번들 크기 최적화.
 */

import { useState, useEffect } from 'react';
import type { EtymologyComponent } from '@/types/word';

// 캐시된 데이터 (싱글톤)
let cachedPrefixes: Set<string> | null = null;
let cachedSuffixes: Set<string> | null = null;
let loadingPromise: Promise<void> | null = null;

/**
 * 형태소 데이터를 동적으로 로드합니다.
 */
async function loadMorphemeData(): Promise<void> {
  if (cachedPrefixes && cachedSuffixes) {
    return;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    const [prefixesData, suffixesData] = await Promise.all([
      import('@/data/morphemes/prefixes.json').then((m) => m.default),
      import('@/data/morphemes/suffixes.json').then((m) => m.default),
    ]);

    cachedPrefixes = new Set(prefixesData as string[]);
    cachedSuffixes = new Set(suffixesData as string[]);
  })();

  return loadingPromise;
}

/**
 * 접사의 유효성을 검증합니다 (동기 버전, 데이터 로드 후 사용).
 */
function isValidAffixSync(part: string): boolean {
  if (!part || part === '-') {
    return false;
  }

  // 데이터가 로드되지 않았으면 일단 통과 (fallback)
  if (!cachedPrefixes || !cachedSuffixes) {
    return true;
  }

  const normalized = part.toLowerCase().trim();
  const startsWithDash = normalized.startsWith('-');
  const endsWithDash = normalized.endsWith('-');

  // 어근 (하이픈 없음): 항상 유효 (클릭 시 words.txt로 검증)
  if (!startsWithDash && !endsWithDash) {
    return true;
  }

  // 접미사 (`-`로 시작): suffixes.json에서 검증
  if (startsWithDash && !endsWithDash) {
    return cachedSuffixes.has(normalized);
  }

  // 접두사 (`-`로 끝남): prefixes.json에서 검증
  if (endsWithDash && !startsWithDash) {
    return cachedPrefixes.has(normalized);
  }

  // 양쪽에 dash가 있는 경우 (embedded morpheme): prefixes.json에서 검증
  if (startsWithDash && endsWithDash) {
    return cachedPrefixes.has(normalized);
  }

  return false;
}

/**
 * 유효한 컴포넌트만 필터링합니다 (동기 버전).
 */
function filterValidComponentsSync(
  components: EtymologyComponent[] | undefined
): EtymologyComponent[] {
  if (!components) {
    return [];
  }
  return components.filter((c) => isValidAffixSync(c.part));
}

/**
 * 유효한 컴포넌트가 하나 이상 있는지 확인합니다 (동기 버전).
 */
function hasValidComponentsSync(
  components: EtymologyComponent[] | undefined
): boolean {
  return filterValidComponentsSync(components).length > 0;
}

/**
 * 형태소 검증기를 위한 React Hook.
 * 동적으로 형태소 데이터를 로드하고 검증 함수를 제공합니다.
 */
export function useMorphemeValidator() {
  const [isLoaded, setIsLoaded] = useState(
    !!(cachedPrefixes && cachedSuffixes)
  );

  useEffect(() => {
    if (!isLoaded) {
      loadMorphemeData().then(() => setIsLoaded(true));
    }
  }, [isLoaded]);

  return {
    isLoaded,
    isValidAffix: isValidAffixSync,
    filterValidComponents: filterValidComponentsSync,
    hasValidComponents: hasValidComponentsSync,
  };
}

// 레거시 호환용 동기 함수 (deprecated, 초기 번들에 포함됨)
// 새 코드에서는 useMorphemeValidator hook 사용 권장
export const isValidAffix = isValidAffixSync;
export const filterValidComponents = filterValidComponentsSync;
export const hasValidComponents = hasValidComponentsSync;
