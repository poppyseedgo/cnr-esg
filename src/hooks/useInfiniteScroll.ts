// ============================================================================
// useInfiniteScroll — 페이지네이션 없는 무한 스크롤 공용 훅
//
// 설계:
//   - offset 기반으로 pageSize개씩 누적 로드 (fetchPage(offset, limit)).
//   - 바닥 sentinel을 IntersectionObserver로 감지 → 보이면 다음 페이지 로드.
//     rootMargin(기본 400px)만큼 미리 로드해 끊김 최소화.
//   - 첫 페이지가 화면을 못 채워 sentinel이 계속 보이는 경우(짧은 목록/큰 화면)
//     items 변경 후 위치를 재확인해 화면이 찰 때까지 추가 로드(보정).
//   - 동시 로드 방지(loadingRef) / 더 없으면 중단(hasMoreRef).
//   - deps 변경 시(예: 카테고리 전환) 처음부터 reload.
//   - 낙관적 업데이트(좋아요 수 등)를 위해 setItems 노출.
//
// 반환 batch 길이 < pageSize 이면 마지막 페이지로 간주(hasMore=false).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export interface InfiniteScroll<T> {
  items: T[];
  /** 첫 페이지 로딩(스켈레톤용) */
  initialLoading: boolean;
  /** 다음 페이지 로딩 중(하단 인디케이터용) */
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  /** 바닥 감지용 콜백 ref — 그리드 아래 빈 div에 연결 */
  sentinelRef: (node: HTMLElement | null) => void;
  /** 처음부터 다시 로드(필터 변경/realtime/생성 후) */
  reload: () => void;
  /** 에러 후 현재 위치에서 재시도 */
  retry: () => void;
  /** 낙관적 업데이트용 */
  setItems: Dispatch<SetStateAction<T[]>>;
}

interface Options {
  pageSize?: number;
  /** 값이 바뀌면 자동 reload (예: [category]) */
  deps?: unknown[];
  /** 바닥 도달 전 미리 로드할 여유 거리(px) */
  rootMargin?: number;
}

export function useInfiniteScroll<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  options: Options = {}
): InfiniteScroll<T> {
  const { pageSize = 12, deps = [], rootMargin = 400 } = options;

  const [items, setItems] = useState<T[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // 최신 fetchPage 참조 — 함수 식별자 변화로 옵저버를 재생성하지 않기 위함
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  // 렌더와 무관한 제어 플래그 — loadMore/옵저버 콜백을 안정적으로 유지
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const offsetRef = useRef(0);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    const first = offsetRef.current === 0;
    if (first) setInitialLoading(true);
    else setLoadingMore(true);
    try {
      const batch = await fetchRef.current(offsetRef.current, pageSize);
      setItems((prev) => {
        const next = first ? batch : [...prev, ...batch];
        offsetRef.current = next.length;
        return next;
      });
      const more = batch.length === pageSize;
      hasMoreRef.current = more;
      setHasMore(more);
      setError(null);
    } catch (e) {
      console.error('[useInfiniteScroll] fetch error:', e);
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.');
    } finally {
      loadingRef.current = false;
      setInitialLoading(false);
      setLoadingMore(false);
    }
  }, [pageSize]);

  const reload = useCallback(() => {
    offsetRef.current = 0;
    hasMoreRef.current = true;
    loadingRef.current = false;
    setItems([]);
    setHasMore(true);
    setError(null);
    setInitialLoading(true);
    void loadMore();
  }, [loadMore]);

  const retry = useCallback(() => {
    setError(null);
    void loadMore(); // 현재 offset 유지하고 재시도
  }, [loadMore]);

  // deps 변경(또는 최초 마운트) 시 처음부터 로드
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // ── 바닥 sentinel 감지 ─────────────────────────────────────────────────
  const nodeRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      nodeRef.current = node;
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (node) {
        observerRef.current = new IntersectionObserver(
          (entries) => {
            if (entries[0]?.isIntersecting) void loadMore();
          },
          { rootMargin: `${rootMargin}px` }
        );
        observerRef.current.observe(node);
      }
    },
    [loadMore, rootMargin]
  );

  // 짧은 콘텐츠 보정: 로드 후에도 sentinel이 화면 안에 있으면 화면이 찰 때까지 더 로드.
  // (IntersectionObserver는 '교차 상태 변화'에만 발화하므로, 계속 보이는 경우 누락 방지)
  useEffect(() => {
    if (initialLoading || loadingMore || !hasMore) return;
    const node = nodeRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.top <= window.innerHeight + rootMargin) void loadMore();
  }, [items, initialLoading, loadingMore, hasMore, loadMore, rootMargin]);

  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  return {
    items,
    initialLoading,
    loadingMore,
    error,
    hasMore,
    sentinelRef,
    reload,
    retry,
    setItems,
  };
}
