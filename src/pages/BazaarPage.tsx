// ============================================================================
// BazaarPage — 바자회 상품 그리드
//
// 기능:
//   - 상품 목록 (sort_order 순)
//   - 활동 상태 가드 (active일 때만 구매 가능, 시각만 안내)
//   - Realtime 갱신 (재고 변경 즉시 반영)
// ============================================================================

import { useEffect, useState } from 'react';
import { useEventPhase } from '@/hooks/useEventPhase';
import { loadProducts, subscribeProducts } from '@/lib/products';
import { formatKSTDate } from '@/utils/time';
import { ProductCard } from '@/components/ProductCard';
import type { EsgProductRow } from '@/types/esg';

export function BazaarPage() {
  const { getActivity } = useEventPhase();
  const { period, status } = getActivity('bazaar');

  const [products, setProducts] = useState<EsgProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setError(null);
      const list = await loadProducts({ scope: 'all' });
      setProducts(list);
    } catch (e) {
      console.error('[BazaarPage] load error:', e);
      setError(e instanceof Error ? e.message : '상품을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
  }, []);

  // Realtime — 재고 변경 / 신규 상품 즉시 반영
  useEffect(() => {
    const cleanup = subscribeProducts(() => {
      void reload();
    });
    return cleanup;
  }, []);

  return (
    <div>
      <h1>🛍 ESG 온라인 바자회</h1>
      <p style={{ color: '#666' }}>굿즈 판매 수익금 전부 생명의 숲에 기부됩니다.</p>

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

      {/* 상품 그리드 */}
      {loading ? (
        <BazaarSkeleton />
      ) : error ? (
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          }}
        >
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
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
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      }}
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
