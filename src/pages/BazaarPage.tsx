// ============================================================================
// BazaarPage — 바자회 상품 그리드
//
// 기능:
//   - 상품 목록 (sort_order 순)
//   - 활동 상태 가드 (active일 때만 구매 가능, 시각만 안내)
//   - Realtime 갱신 (재고 변경 즉시 반영)
//   - 태그 메뉴 필터 (?tag=slug, 칩 클릭 → 해당 태그 상품만)   // ← [2026-06-22]
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom'; // ← [2026-06-22] 태그 필터 URL 동기화
import { useEventPhase } from '@/hooks/useEventPhase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'; // ← [2026-06-04] 무한 스크롤
import { loadProducts, subscribeProducts } from '@/lib/products';
import { listTagsWithCount } from '@/lib/tags'; // ← [2026-06-22] 태그 메뉴
import { loadProductTagsBatch } from '@/lib/tags'; // ← [2026-06-23] 카드 태그 배치
import { SearchBar } from '@/components/SearchBar'; // ← [2026-06-17] 상품 이름 검색
import { formatKSTDate } from '@/utils/time';
import { ProductCard } from '@/components/ProductCard';
import { InfiniteScrollFooter } from '@/components/InfiniteScrollFooter'; // ← [2026-06-04]
import { FormModal } from '@/components/FormModal';
import { CreateProductForm } from '@/components/admin/CreateProductForm';
import type { EsgProductRow, EsgTagWithCount } from '@/types/esg'; // ← [2026-06-22] EsgTagWithCount

export function BazaarPage() {
  const { getActivity } = useEventPhase();
  const { period, status } = getActivity('bazaar');
  const { isAdmin } = useCurrentUser();

  // ← [2026-06-17] 품절 제외 필터
  const [hideSoldOut, setHideSoldOut] = useState(false);

  // ← [2026-06-17] 상품 이름 검색 (입력 → 300ms 디바운스 → 서버 재조회)
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── [2026-06-23] 태그 필터 — 카테고리/브랜드 2축 동시 필터 ────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCatSlug = searchParams.get('cat') ?? '';
  const activeBrandSlug = searchParams.get('brand') ?? '';
  const legacyTagSlug = searchParams.get('tag') ?? ''; // 이전 ?tag= 링크 호환
  const [tags, setTags] = useState<EsgTagWithCount[]>([]);
  const reloadTags = useCallback(() => {
    listTagsWithCount().then(setTags).catch(() => {/* 메뉴 로드 실패는 조용히(필터 없이 동작) */});
  }, []);
  useEffect(() => { reloadTags(); }, [reloadTags]);

  // slug → 태그(종류 구분). legacy ?tag= 는 종류에 따라 해당 축으로 흡수.
  const legacyTag = legacyTagSlug ? tags.find((t) => t.slug === legacyTagSlug) : undefined;
  const activeCat = tags.find((t) => t.kind !== 'brand' && t.slug === (activeCatSlug || (legacyTag?.kind !== 'brand' ? legacyTagSlug : '')));
  const activeBrand = tags.find((t) => t.kind === 'brand' && t.slug === (activeBrandSlug || (legacyTag?.kind === 'brand' ? legacyTagSlug : '')));
  const activeCatId = activeCat?.id;
  const activeBrandId = activeBrand?.id;
  // AND 필터용 태그 id 배열(선택된 것만)
  const tagIds = [activeCatId, activeBrandId].filter((x): x is string => !!x);

  // 축별 칩 클릭: 같은 슬러그 재클릭=해제, 다른 슬러그=교체. (cat/brand 독립)
  const selectAxis = (axis: 'cat' | 'brand', slug: string, currentSlug: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('tag'); // legacy 파라미터 정리
      if (slug && slug !== currentSlug) next.set(axis, slug);
      else next.delete(axis);
      return next;
    });
  };
  const selectCat = (slug: string) => selectAxis('cat', slug, activeCat?.slug ?? '');
  const selectBrand = (slug: string) => selectAxis('brand', slug, activeBrand?.slug ?? '');
  const clearAll = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('cat'); next.delete('brand'); next.delete('tag');
      return next;
    });
  };
  const anyActive = !!(activeCat || activeBrand);

  // 무한 스크롤 — 12개씩 누적 로드 (고정 먼저 → sort_order → created_at)
  const fetchPage = useCallback(
    async (offset: number, limit: number) => {
      const rows = await loadProducts({ scope: hideSoldOut ? 'on_sale_only' : 'all', offset, limit, search, tagIds }); // ← [2026-06-23] 다중 AND 필터
      const tagMap = await loadProductTagsBatch(rows.map((r) => r.id)); // ← [2026-06-23] 카드 표시용 태그 배치 주입
      return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
    },
    [hideSoldOut, search, activeCatId, activeBrandId]
  );
  const {
    items: products,
    initialLoading,
    loadingMore,
    error,
    sentinelRef,
    reload,
    refresh,
  } = useInfiniteScroll<EsgProductRow>(fetchPage, { pageSize: 12, deps: [hideSoldOut, search, activeCatId, activeBrandId] }); // ← [2026-06-23] 필터 변경 시 리셋

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🛍 ESG 온라인 바자회</h1>
          <p style={{ color: '#666', margin: '4px 0 0' }}>굿즈 판매 수익금 전부 생명의 숲에 기부됩니다.</p>
        </div>
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

      {/* 상태 안내 */}
      {period && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background:
              status === 'active' ? '#dcfce7' : status === 'before' ? '#fef3c7' : '#f0f0f0',
            color:
              status === 'active' ? '#166534' : status === 'before' ? '#92400e' : '#666',
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {status === 'active' && (
            <>
              ✅ <strong>판매 진행 중</strong> · {formatKSTDate(period.ends_at_utc)}까지
            </>
          )}
          {status === 'before' && (
            <>⏳ {formatKSTDate(period.starts_at_utc)}부터 구매 가능합니다 (구경은 가능)</>
          )}
          {status === 'closed' && '🏁 바자회가 종료되었습니다.'}
          {period.note && (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{period.note}</div>
          )}
        </div>
      )}

      {/* ← [2026-06-17] 검색 + 품절 제외 필터 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginTop: 16,
        }}
      >
        <SearchBar value={searchInput} onChange={setSearchInput} placeholder="상품 이름 검색" width={320} />
        <button
          type="button"
          onClick={() => setHideSoldOut((v) => !v)}
          aria-pressed={hideSoldOut}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 999,
            border: `1px solid ${hideSoldOut ? '#16a34a' : '#ddd'}`,
            background: hideSoldOut ? '#16a34a' : '#fff',
            color: hideSoldOut ? '#fff' : '#555',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {hideSoldOut ? '☑' : '☐'} 품절 제외
        </button>
      </div>

      {/* ← [2026-06-23] 태그 필터 — 카테고리/브랜드 동시(AND). 그룹별 단일 활성 */}
      {tags.some((t) => t.product_count > 0) && (() => {
        const catTags = tags.filter((t) => t.kind !== 'brand' && t.product_count > 0);
        const brandTags = tags.filter((t) => t.kind === 'brand' && t.product_count > 0);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <TagChip label="전체" active={!anyActive} onClick={clearAll} />
            </div>
            {catTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={tagGroupLabel}>카테고리</span>
                {catTags.map((t) => (
                  <TagChip key={t.id} label={`#${t.name} ${t.product_count}`} active={t.slug === (activeCat?.slug ?? '')} onClick={() => selectCat(t.slug)} />
                ))}
              </div>
            )}
            {brandTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={tagGroupLabel}>브랜드</span>
                {brandTags.map((t) => (
                  <TagChip key={t.id} label={`#${t.name} ${t.product_count}`} active={t.slug === (activeBrand?.slug ?? '')} onClick={() => selectBrand(t.slug)} />
                ))}
              </div>
            )}
          </div>
        );
      })()}

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

// ← [2026-06-22] 태그 메뉴 칩
// ← [2026-06-23] 필터 그룹(카테고리/브랜드) 라벨 스타일
const tagGroupLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#888',
  minWidth: 44,
};

function TagChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        border: `1px solid ${active ? '#111' : '#ddd'}`,
        background: active ? '#111' : '#fff',
        color: active ? '#fff' : '#555',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
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
