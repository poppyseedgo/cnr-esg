// ============================================================================
// BazaarPage — 바자회 상품 그리드 (두 단계 사이드바의 '메인 콘텐츠')
//
// [변경 이력]
//   2026-06-24  [Task 1] 본문 인라인 필터(검색·품절제외·태그칩) 제거 → 공용
//               BazaarFilters로 이관(데스크톱=2차 사이드바 / 모바일=최상단).
//               필터 상태를 URL 파라미터(cat/brand/q/soldout/sort)로 단일화.
//               브레드크럼(Home›Bazaar) + 정렬 행(등록순/높은가격/낮은가격) 추가.
//   이전:       상품 목록 / 활동 가드 / Realtime / 태그 2축 필터
//
// 기능:
//   - 상품 목록 (정렬: 등록순 기본 / 가격 오름·내림차순)
//   - 활동 상태 가드 (active일 때만 구매 가능, 시각만 안내)
//   - Realtime 갱신 (재고 변경 즉시 반영)
//   - 필터는 BazaarFilters(URL 파라미터)와 동기화
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom'; // ← [2026-06-22] 필터 URL / [2026-06-24] 브레드크럼
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'; // ← [2026-06-04] 무한 스크롤
import { loadProducts, subscribeProducts } from '@/lib/products';
import { listTagsWithCount } from '@/lib/tags'; // ← [2026-06-22] slug→id 해석용 태그
import { loadProductTagsBatch } from '@/lib/tags'; // ← [2026-06-23] 카드 태그 배치
import { BazaarFilters } from '@/components/bazaar/BazaarFilters'; // ← [2026-06-24] 필터는 공용 컴포넌트로 이관(모바일 최상단/데스크톱 사이드바)
import { ProductCard } from '@/components/ProductCard';
import { InfiniteScrollFooter } from '@/components/InfiniteScrollFooter'; // ← [2026-06-04]
import { FormModal } from '@/components/FormModal';
import { CreateProductForm } from '@/components/admin/CreateProductForm';
import type { EsgProductRow, EsgTagWithCount } from '@/types/esg'; // ← [2026-06-22] EsgTagWithCount

export function BazaarPage() {
  const { isAdmin } = useCurrentUser();

  // ── [2026-06-24] 필터 상태의 단일 소스 = URL 파라미터 ─────────────────────
  //  검색(q)·품절제외(soldout)·정렬(sort)도 cat/brand 와 함께 URL로 통일.
  //  필터 UI는 BazaarFilters(사이드바/모바일)가 이 파라미터를 쓰고, 여기선 읽기만.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCatSlug = searchParams.get('cat') ?? '';
  const activeBrandSlug = searchParams.get('brand') ?? '';
  const legacyTagSlug = searchParams.get('tag') ?? ''; // 이전 ?tag= 링크 호환
  const search = (searchParams.get('q') ?? '').trim();          // ← [2026-06-24] 검색어 URL화
  const hideSoldOut = searchParams.get('soldout') === '1';      // ← [2026-06-24] 품절제외 URL화
  const sortParam = searchParams.get('sort');                   // ← [2026-06-24] 정렬 URL화
  const sort: 'reg' | 'price_desc' | 'price_asc' =
    sortParam === 'price_desc' ? 'price_desc' : sortParam === 'price_asc' ? 'price_asc' : 'reg';

  // 정렬 변경(URL sort 갱신). 기본(reg)은 파라미터 제거.
  const setSort = (next: 'reg' | 'price_desc' | 'price_asc') => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'reg') p.delete('sort'); else p.set('sort', next);
      return p;
    }, { replace: true });
  };

  // 태그 목록 — slug→id 해석에 필요(필터 칩 렌더는 BazaarFilters가 담당)
  const [tags, setTags] = useState<EsgTagWithCount[]>([]);
  const reloadTags = useCallback(() => {
    listTagsWithCount().then(setTags).catch(() => {/* 실패는 조용히(필터 없이 동작) */});
  }, []);
  useEffect(() => { reloadTags(); }, [reloadTags]);

  // slug → 태그(종류 구분). legacy ?tag= 는 종류에 따라 해당 축으로 흡수.
  const legacyTag = legacyTagSlug ? tags.find((t) => t.slug === legacyTagSlug) : undefined;
  const activeCat = tags.find((t) => t.kind !== 'brand' && t.slug === (activeCatSlug || (legacyTag?.kind !== 'brand' ? legacyTagSlug : '')));
  const activeBrand = tags.find((t) => t.kind === 'brand' && t.slug === (activeBrandSlug || (legacyTag?.kind === 'brand' ? legacyTagSlug : '')));
  const activeCatId = activeCat?.id;
  const activeBrandId = activeBrand?.id;
  const tagIds = [activeCatId, activeBrandId].filter((x): x is string => !!x);
  const anyActive = !!(activeCat || activeBrand);

  // 무한 스크롤 — 12개씩 누적 로드 (고정 먼저 → sort_order → created_at)
  const fetchPage = useCallback(
    async (offset: number, limit: number) => {
      const rows = await loadProducts({ scope: hideSoldOut ? 'on_sale_only' : 'all', offset, limit, search, tagIds, sort }); // ← [2026-06-24] sort 반영
      const tagMap = await loadProductTagsBatch(rows.map((r) => r.id)); // ← [2026-06-23] 카드 표시용 태그 배치 주입
      return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
    },
    [hideSoldOut, search, activeCatId, activeBrandId, sort]
  );
  const {
    items: products,
    initialLoading,
    loadingMore,
    error,
    sentinelRef,
    reload,
    refresh,
  } = useInfiniteScroll<EsgProductRow>(fetchPage, { pageSize: 12, deps: [hideSoldOut, search, activeCatId, activeBrandId, sort] }); // ← [2026-06-24] sort 변경 시 리셋

  const [createOpen, setCreateOpen] = useState(false);

  // Realtime — 재고 변경 / 신규 상품 조용히 제자리 갱신(깜빡임 없음)
  useEffect(() => {
    const cleanup = subscribeProducts(() => {
      refresh();
      reloadTags(); // ← [2026-06-22] 상품 변경 시 태그 카운트도 갱신
    });
    return cleanup;
  }, [refresh, reloadTags]);

  return (
    <div>
      {/* ← [2026-06-24] 모바일(<1024) 전용 필터: 페이지 최상단. 데스크톱은 2차 사이드바가 대신(index.css 분기) */}
      <div className="bazaar-mobile-filters" style={{ marginBottom: 16 }}>
        <BazaarFilters />
      </div>

      {/* ← [2026-06-24] 브레드크럼(Home › Bazaar) + 어드민 등록 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <nav aria-label="breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, lineHeight: 1.4 }}>
          <Link to="/" style={{ color: '#848484', textDecoration: 'none' }}>Home</Link>
          <span style={{ color: '#b8b8b8' }}>›</span>
          <span style={{ color: '#111' }}>Bazaar</span>
        </nav>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            style={{
              padding: '10px 16px',
              background: '#0ea5e9',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            ➕ 새 상품 등록
          </button>
        )}
      </div>

      {/* 새 상품 등록 모달 (어드민만) */}
      <FormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="➕ 새 상품 등록"
        maxWidth={720}
      >
        <CreateProductForm
          onCancel={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            refresh();
          }}
        />
      </FormModal>

      {/* ← [2026-06-24] 상단 구매가능 상태 배너 제거 (요청) */}

      {/* ← [2026-06-24] 정렬 행 (Figma: 등록 순 / 높은 가격 순 / 낮은 가격 순) — 우측 정렬 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
        <SortOption label="등록 순" active={sort === 'reg'} onClick={() => setSort('reg')} />
        <SortOption label="높은 가격 순" active={sort === 'price_desc'} onClick={() => setSort('price_desc')} />
        <SortOption label="낮은 가격 순" active={sort === 'price_asc'} onClick={() => setSort('price_asc')} />
      </div>

      {/* 상품 그리드 */}
      {initialLoading ? (
        <BazaarSkeleton />
      ) : error && products.length === 0 ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : products.length === 0 ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 48,
            textAlign: 'center',
            border: '1px dashed #ddd',
            marginTop: 24,
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🛍</div>
          <p style={{ margin: 0, color: '#888' }}>
            {search
              ? '검색 결과가 없습니다.'
              : anyActive
                ? `${[activeCat, activeBrand].filter(Boolean).map((t) => `#${t!.name}`).join(' ')} 조건의 상품이 없습니다.`
                : '아직 등록된 상품이 없습니다.'}
          </p>
        </div>
      ) : (
        <div
          style={{
            marginTop: 24,
            display: 'grid',
            gap: 16,
            // 4컬럼 (데스크탑) → 3컬럼 (태블릿) → 2컬럼 (모바일)
            gridTemplateColumns: 'repeat(2, 1fr)',
          }}
          className="bazaar-grid"
        >
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
      {!initialLoading && products.length > 0 && (
        <InfiniteScrollFooter
          sentinelRef={sentinelRef}
          loadingMore={loadingMore}
          error={error}
          onRetry={reload}
        />
      )}
      {/* 반응형 그리드: 768px+ 3컬럼, 1024px+ 4컬럼 */}
      <style>{`
        @media (min-width: 768px) {
          .bazaar-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (min-width: 1024px) {
          .bazaar-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

// ← [2026-06-24] 정렬 옵션 (Figma: 14px 라디오 + 라벨 20px). 선택=검은 점
function SortOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit',
      }}
    >
      <span style={{
        width: 14, height: 14, flexShrink: 0, borderRadius: 999,
        border: '1px solid #000',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {active && <span style={{ width: 8, height: 8, borderRadius: 999, background: '#000' }} />}
      </span>
      <span style={{ fontSize: 16, lineHeight: 1.4, color: active ? '#111' : '#848484', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );
}

function BazaarSkeleton() {
  return (
    <div
      style={{
        marginTop: 24,
        display: 'grid',
        gap: 16,
        gridTemplateColumns: 'repeat(2, 1fr)',
      }}
      className="bazaar-grid"
    >
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            background: '#fff',
            borderRadius: 12,
            border: '1px solid #eee',
            overflow: 'hidden',
          }}
        >
          <div style={{ aspectRatio: '1 / 1', background: '#f5f5f5' }} />
          <div style={{ padding: 16 }}>
            <div style={{ height: 14, background: '#f0f0f0', borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 16, background: '#f0f0f0', borderRadius: 4, width: '50%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      style={{
        marginTop: 24,
        background: '#fee2e2',
        color: '#991b1b',
        padding: 16,
        borderRadius: 8,
        textAlign: 'center',
      }}
    >
      <div style={{ marginBottom: 8 }}>⚠️ {message}</div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: '6px 14px',
          background: '#fff',
          border: '1px solid #fecaca',
          color: '#991b1b',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        다시 시도
      </button>
    </div>
  );
}
