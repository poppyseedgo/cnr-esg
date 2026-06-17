// ============================================================================
// BazaarPage — 바자회 상품 그리드
//
// 기능:
//   - 상품 목록 (sort_order 순)
//   - 활동 상태 가드 (active일 때만 구매 가능, 시각만 안내)
//   - Realtime 갱신 (재고 변경 즉시 반영)
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useEventPhase } from '@/hooks/useEventPhase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'; // ← [2026-06-04] 무한 스크롤
import { loadProducts, subscribeProducts } from '@/lib/products';
import { formatKSTDate } from '@/utils/time';
import { ProductCard } from '@/components/ProductCard';
import { InfiniteScrollFooter } from '@/components/InfiniteScrollFooter'; // ← [2026-06-04]
import { FormModal } from '@/components/FormModal';
import { CreateProductForm } from '@/components/admin/CreateProductForm';
import type { EsgProductRow } from '@/types/esg';

export function BazaarPage() {
  const { getActivity } = useEventPhase();
  const { period, status } = getActivity('bazaar');
  const { isAdmin } = useCurrentUser();

  // ← [2026-06-17] 품절 제외 필터
  const [hideSoldOut, setHideSoldOut] = useState(false);

  // 무한 스크롤 — 12개씩 누적 로드 (고정 먼저 → sort_order → created_at)
  const fetchPage = useCallback(
    (offset: number, limit: number) =>
      loadProducts({ scope: hideSoldOut ? 'on_sale_only' : 'all', offset, limit }), // ← 필터 ON이면 on_sale만
    [hideSoldOut]
  );
  const {
    items: products,
    initialLoading,
    loadingMore,
    error,
    sentinelRef,
    reload,
    refresh,
  } = useInfiniteScroll<EsgProductRow>(fetchPage, { pageSize: 12, deps: [hideSoldOut] }); // ← deps로 토글 시 리셋

  const [createOpen, setCreateOpen] = useState(false);

  // Realtime — 재고 변경 / 신규 상품 조용히 제자리 갱신(깜빡임 없음)
  useEffect(() => {
    const cleanup = subscribeProducts(() => {
      refresh();
    });
    return cleanup;
  }, [refresh]);

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

      {/* ← [2026-06-17] 품절 제외 필터 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
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
          <p style={{ margin: 0, color: '#888' }}>아직 등록된 상품이 없습니다.</p>
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
