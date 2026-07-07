// ============================================================================
// GoodsPage — 굿즈 스토어프론트(목록)
//
// [설계] BazaarPage 재사용 규칙을 그대로 따르되 굿즈 특성 반영:
//   · 상시 판매 → 선판매/운영시간 게이트 없음(useBazaarSale 미사용). canQuickAdd 항상 true.
//     (품절/입금대기 차단은 ProductCard 내부 displayStatus 가 담당 → 재사용)
//   · 그리드 3컬럼(.goods-grid): 모바일 2 → 768+ 3 (바자회의 4컬럼과 유일한 차이)
//   · 카테고리 필터만(브랜드 미사용). URL ?cat=slug,slug (GoodsSidebar와 동일 계약)
//   · loadProducts({ section:'goods', ... }) — Phase 1 section 필터 사용
//   · ProductCard basePath="/goods" → 카드 클릭 시 /goods/:id
//
// [2026-07-07] 신규 — 굿즈 섹션 Phase 2(스토어프론트).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { loadProducts, subscribeProducts } from '@/lib/products';
import { loadReservationStatus } from '@/lib/reservations';
import { listAllTags, loadProductTagsBatch } from '@/lib/tags';
import { GoodsSidebar } from '@/components/goods/GoodsSidebar';
import { ProductCard } from '@/components/ProductCard';
import { InfiniteScrollFooter } from '@/components/InfiniteScrollFooter';
import type { EsgProductRow, EsgTagRow } from '@/types/esg';

export function GoodsPage() {
  // ── 필터 상태 단일 소스 = URL 파라미터 (cat/q/sort) ──
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCatSlugs = (searchParams.get('cat') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const search = (searchParams.get('q') ?? '').trim();
  const sortParam = searchParams.get('sort');
  const sort: 'reg' | 'price_desc' | 'price_asc' =
    sortParam === 'price_desc' ? 'price_desc' : sortParam === 'price_asc' ? 'price_asc' : 'reg';

  const setSort = (next: 'reg' | 'price_desc' | 'price_asc') => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'reg') p.delete('sort'); else p.set('sort', next);
      return p;
    }, { replace: true });
  };

  // 굿즈 카테고리 태그 — slug→id 해석용(칩 렌더는 GoodsSidebar가 담당)
  const [cats, setCats] = useState<EsgTagRow[]>([]);
  const reloadCats = useCallback(() => {
    listAllTags('goods').then((rows) => setCats(rows.filter((t) => t.kind === 'category'))).catch(() => {/* noop */});
  }, []);
  useEffect(() => { reloadCats(); }, [reloadCats]);

  const catTagsSel = activeCatSlugs.map((s) => cats.find((t) => t.slug === s)).filter((t): t is EsgTagRow => !!t);
  const catIds = catTagsSel.map((t) => t.id);
  const tagGroups = catIds.length > 0 ? [catIds] : []; // 카테고리 OR 묶음(단일 그룹)
  const anyActive = catIds.length > 0;
  const catKey = activeCatSlugs.join(',');

  // 무한 스크롤 — 12개씩 (section='goods' 고정)
  const fetchPage = useCallback(
    async (offset: number, limit: number) => {
      const rows = await loadProducts({ section: 'goods', scope: 'all', offset, limit, search, tagGroups, sort });
      const tagMap = await loadProductTagsBatch(rows.map((r) => r.id));
      return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, catKey, sort],
  );
  const {
    items: products, initialLoading, loadingMore, error, sentinelRef, reload, refresh,
  } = useInfiniteScroll<EsgProductRow>(fetchPage, { pageSize: 12, deps: [search, catKey, sort] });

  // ← [2026-07-08] 검색/필터 없이 등록 굿즈가 0이면 "Coming soon" 화면(Figma 2292-56)
  const showComingSoon = !initialLoading && !error && products.length === 0 && !search && !anyActive;

  // Realtime — 재고/신규 상품 제자리 갱신
  useEffect(() => {
    void loadReservationStatus();
    const cleanup = subscribeProducts(() => {
      refresh();
      reloadCats();
      void loadReservationStatus();
    });
    return cleanup;
  }, [refresh, reloadCats]);

  return (
    <div>
      {/* 모바일(<1024) 전용 필터: 페이지 최상단 (데스크톱은 2차 사이드바가 대신) */}
      <div className="bazaar-mobile-filters" style={{ marginBottom: 16 }}>
        <GoodsSidebar variant="mobile" />
      </div>

      {/* 브레드크럼 (Home › Goods) */}
      <nav aria-label="breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, lineHeight: 1.4 }}>
        <Link to="/" style={{ color: '#848484', textDecoration: 'none' }}>Home</Link>
        <span style={{ color: '#b8b8b8' }}>›</span>
        <span style={{ color: '#111' }}>Goods</span>
      </nav>

      {/* 정렬 행 (Coming soon 상태에선 숨김) */}
      {!showComingSoon && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
          <SortOption label="등록 순" active={sort === 'reg'} onClick={() => setSort('reg')} />
          <SortOption label="높은 가격 순" active={sort === 'price_desc'} onClick={() => setSort('price_desc')} />
          <SortOption label="낮은 가격 순" active={sort === 'price_asc'} onClick={() => setSort('price_asc')} />
        </div>
      )}

      {/* 그리드 / Coming soon */}
      {initialLoading ? (
        <GoodsSkeleton />
      ) : error && products.length === 0 ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : showComingSoon ? (
        // ← [2026-07-08] 아직 등록된 굿즈가 없으면 "C&R Goods / Coming soon"(Figma 2292:126)
        <div className="goods-coming">
          <img className="goods-coming__bg" src="/home/goods-comingsoon.jpg" alt="" aria-hidden="true" />
          <div className="goods-coming__txt">
            <p>C&amp;R Goods</p>
            <p>Coming soon</p>
          </div>
        </div>
      ) : products.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: 48, textAlign: 'center', border: '1px dashed #ddd', marginTop: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🎁</div>
          <p style={{ margin: 0, color: '#888' }}>
            {search
              ? '검색 결과가 없습니다.'
              : `${catTagsSel.map((t) => `#${t.name}`).join(' ')} 조건의 굿즈가 없습니다.`}
          </p>
        </div>
      ) : (
        <div
          className="goods-grid"
          style={{ marginTop: 24, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(2, 1fr)' }}
        >
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              basePath="/goods"
              canQuickAdd={p.purchase_type !== 'funding'} // ← [2026-07-07] 펀딩은 상세에서 참여(빠른담기 X)
              quickAddBlockReason={p.purchase_type === 'funding' ? '펀딩 상품 — 상세에서 참여' : null}
            />
          ))}
        </div>
      )}

      {!initialLoading && products.length > 0 && (
        <InfiniteScrollFooter sentinelRef={sentinelRef} loadingMore={loadingMore} error={error} onRetry={reload} />
      )}

      {/* 반응형 그리드: 모바일 2컬럼 → 768px+ 3컬럼 (바자회 4컬럼과의 유일한 차이) */}
      <style>{`
        @media (min-width: 768px) {
          .goods-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        /* ← [2026-07-08] Coming soon (Figma 2292:126): 풀블리드 사진 + 흰 텍스트 상단 중앙 */
        .goods-coming {
          position: relative;
          overflow: clip;
          background: #fff;
          margin-top: 24px;
          border-radius: 12px;
          min-height: min(72vh, 1013px);
        }
        .goods-coming__bg {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; pointer-events: none;
        }
        .goods-coming__txt {
          position: absolute; top: 51px; left: 0; right: 0;
          text-align: center; color: #fff;
          font-family: 'Instrument Sans', sans-serif; font-weight: 400;
          font-size: 44px; line-height: 1; text-transform: uppercase;
        }
        .goods-coming__txt p { margin: 0; }
        .goods-coming__txt p + p { margin-top: 0; }
        @media (max-width: 767px) {
          .goods-coming { min-height: 60vh; }
          .goods-coming__txt { top: 32px; font-size: 30px; }
        }
      `}</style>
    </div>
  );
}

// ── 정렬 옵션 (바자회와 동일 UI) ──
function SortOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}
    >
      <span style={{ width: 14, height: 14, flexShrink: 0, borderRadius: 999, border: '1px solid #000', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {active && <span style={{ width: 8, height: 8, borderRadius: 999, background: '#000' }} />}
      </span>
      <span style={{ fontSize: 16, lineHeight: 1.4, color: active ? '#111' : '#848484', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

function GoodsSkeleton() {
  return (
    <div className="goods-grid" style={{ marginTop: 24, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(2, 1fr)' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', overflow: 'hidden' }}>
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
    <div style={{ marginTop: 24, background: '#fee2e2', color: '#991b1b', padding: 16, borderRadius: 8, textAlign: 'center' }}>
      <div style={{ marginBottom: 8 }}>⚠️ {message}</div>
      <button type="button" onClick={onRetry} style={{ padding: '6px 14px', background: '#fff', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
        다시 시도
      </button>
    </div>
  );
}
