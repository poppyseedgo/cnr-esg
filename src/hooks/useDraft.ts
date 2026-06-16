// ============================================================================
// useDraft — 폼 임시저장(localStorage) 훅
//
//   편집 내용을 자동 저장해 새로고침/실수 닫힘에도 보존.
//     - load()  : 저장된 draft 반환(없으면 null) — useState 초기값에 사용
//     - save(d) : 즉시 저장(호출부에서 디바운스). enabled=false면 무시
//     - clear() : 저장 삭제(제출 성공/명시적 새로작성 시)
//   File 객체 등 직렬화 불가 값은 draft에 담지 말 것(텍스트/URL/숫자/플래그만).
//
//   2026-06-16  최초 작성
// ============================================================================

import { useCallback } from 'react';

interface DraftWrap<T> {
  v: T;
  t: number;
}

export interface DraftApi<T> {
  load: () => T | null;
  save: (data: T) => void;
  clear: () => void;
}

export function useDraft<T>(key: string, enabled = true): DraftApi<T> {
  const save = useCallback(
    (data: T) => {
      if (!enabled) return;
      try {
        localStorage.setItem(key, JSON.stringify({ v: data, t: Date.now() } as DraftWrap<T>));
      } catch {
        /* quota 초과 등은 무시 */
      }
    },
    [key, enabled]
  );

  const load = useCallback((): T | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DraftWrap<T>;
      return parsed?.v ?? null;
    } catch {
      return null;
    }
  }, [key]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* 무시 */
    }
  }, [key]);

  return { load, save, clear };
}
