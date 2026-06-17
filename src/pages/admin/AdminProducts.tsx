// ============================================================================
// AdminProducts — 바자회 상품 어드민 페이지
//
// 편집 폼은 ProductEditForm 공통 컴포넌트 사용 (상세 페이지와 코드 공유).
//
// 변경 이력:
//   2026-06-17  [정책㉠] 카드에 숨김/숨김해제 1-click CTA 추가 (수정 폼 진입 불필요).
//               완료 주문/Q&A 상품은 하드삭제 대신 숨김으로 유도.
//   2026-06-17  [고정/정렬] 전체 리스트 드래그 재정렬(sort_order 일괄) + 📌 고정 배지.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadAllProducts, hideProduct, unhideProduct, reorderProducts } from '@/lib/adminProducts'; // ← [고정/정렬] reorderProducts
import { subscribeProducts, getAvailableStock } from '@/lib/products';
import { ProductEditForm } from '@/components/admin/ProductEditForm';
import { CreateProductForm } from '@/components/admin/CreateProductForm';
import type { EsgProductRow, EsgProductStatus } from '@/types/esg';

const STATUS_LABELS: Record<EsgProductStatus, string> = {
  on_sale: '판매 중',
  sold_out: '품절',
  hidden: '숨김',
};

const STATUS_COLORS: Record<EsgProductStatus, { bg: string; color: string }> = {
  on_sale: { bg: '#dcfce7', color: '#166534' },
  sold_out: { bg: '#fef3c7', color: '#92400e' },
  hidden: { bg: '#f0f0f0', color: '#666' },
};

export function AdminProducts() {
  const [products, setProducts] = useState<EsgProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // ← [고정/정렬] 드래그 재정렬 상태
  const dragIndexRef = useRef<number | null>(null);          // 드래그 시작 인덱스 (리렌더 불필요 → ref)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null); // 드롭 위치 표시선
  const [reordering, setReordering] = useState(false);       // 재정렬 저장 중

  const pinnedCount = products.filter((p) => p.is_pinned).length; // ← [고정] N/8 표시용

  const reload = async () => {
    try {
      setError(null);
      setProducts(await loadAllProducts());
    } catch (e) {
      console.error('[AdminProducts]', e);
      setError(e instanceof Error ? e.message : '상품을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // ← [고정/정렬] 드롭 → 로컬 낙관적 재배열 후 sort_order 일괄 저장
  const handleDrop = async (targetIndex: number) => {
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    if (from === null || from === targetIndex) return;

    const next = [...products];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    setProducts(next);                                       // 낙관적 갱신 (깜빡임 방지)

    setReordering(true);
    try {
      await reorderProducts(next.map((p) => p.id));          // sort_order 1..N 재할당
    } catch (e) {
      alert(e instanceof Error ? e.message : '순서 저장 실패');
      void reload();                                         // 실패 시 서버 상태로 복구
    } finally {
      setReordering(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
  }, []);

  useEffect(() => {
    const cleanup = subscribeProducts(() => {
      void reload();
    });
    return cleanup;
  }, []);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>;
  if (error) return <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>⚠️ {error}</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>🛍 바자회 상품 관리</h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          style={{
            padding: '8px 14px',
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ➕ 새 상품 등록
        </button>
      </div>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        이미지, 가격, 재고를 관리할 수 있습니다. 왼쪽 <strong>⠿ 핸들을 드래그</strong>해 순서를 바꾸면
        전체 리스트 순서(정렬 순서)가 저장됩니다. 고정(📌) 상품은 공개 페이지에서 맨 앞에 노출됩니다.
        {reordering && <span style={{ color: '#16a34a', marginLeft: 8 }}>· 순서 저장 중…</span>}
      </p>

      {creating && (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            border: '2px solid #111',
          }}
        >
          <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#111' }}>➕ 새 상품 등록</h3>
          <CreateProductForm
            onCancel={() => setCreating(false)}
            onSuccess={() => {
              setCreating(false);
              void reload();
            }}
          />
        </div>
      )}

      {products.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🛍</div>
          <p style={{ margin: '0 0 8px', color: '#888' }}>등록된 상품이 없습니다.</p>
          <p style={{ margin: 0, fontSize: 12, color: '#bbb' }}>
            우측 상단 "➕ 새 상품 등록" 버튼으로 추가하세요.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {products.map((p, i) => (
            // ← [고정/정렬] 행 = 드롭 타깃, 왼쪽 ⠿ 핸들만 draggable
            <div
              key={p.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverIndex !== i) setDragOverIndex(i);
              }}
              onDrop={() => handleDrop(i)}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'stretch',
                borderTop: dragOverIndex === i ? '2px solid #16a34a' : '2px solid transparent',
                borderRadius: 4,
              }}
            >
              <div
                draggable
                onDragStart={() => {
                  dragIndexRef.current = i;
                }}
                onDragEnd={() => {
                  dragIndexRef.current = null;
                  setDragOverIndex(null);
                }}
                title="드래그하여 순서 변경"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 6px',
                  cursor: 'grab',
                  color: '#c4c4c4',
                  fontSize: 20,
                  userSelect: 'none',
                  flexShrink: 0,
                }}
              >
                ⠿
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <ProductAdminCard product={p} onChange={reload} pinnedCount={pinnedCount} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 개별 상품 카드 (ProductEditForm 사용)
// ============================================================================

function ProductAdminCard({
  product,
  onChange,
  pinnedCount,
}: {
  product: EsgProductRow;
  onChange: () => void;
  pinnedCount?: number;   // ← [고정] N/8 표시용 전달
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);                    // ← [정책㉠] 숨김/해제 처리 중 잠금
  const statusColor = STATUS_COLORS[product.status];
  const available = getAvailableStock(product);

  // ← [정책㉠] 숨김 처리 (소프트삭제) — 1-click
  const handleHide = async () => {
    if (!confirm(`"${product.name}"을(를) 숨김 처리할까요?\n사용자 화면에서 보이지 않지만 주문·Q&A 이력은 보존됩니다.`)) return;
    setBusy(true);
    try {
      await hideProduct(product.id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '숨김 처리 실패');
    } finally {
      setBusy(false);
    }
  };

  // ← [정책㉠] 숨김 해제 — 가용재고에 따라 on_sale/sold_out 복귀
  const handleUnhide = async () => {
    setBusy(true);
    try {
      await unhideProduct(product.id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '숨김 해제 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        border: '1px solid #eee',
        opacity: product.status === 'hidden' ? 0.6 : 1,
      }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: editing ? 16 : 0 }}>
        <Link
          to={`/bazaar/${product.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            width: 56,
            height: 56,
            flexShrink: 0,
            borderRadius: 8,
            background: product.thumbnail_url ? `url(${product.thumbnail_url}) center / cover` : '#f5f5f5',
            display: 'block',
          }}
          aria-label="사용자 화면으로 보기"
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ padding: '2px 8px', background: statusColor.bg, color: statusColor.color, borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
              {STATUS_LABELS[product.status]}
            </span>
            {/* ← [고정] 고정 배지 */}
            {product.is_pinned && (
              <span style={{ padding: '2px 8px', background: '#fef9c3', color: '#854d0e', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                📌 고정
              </span>
            )}
            <span style={{ fontSize: 11, color: '#bbb', fontFamily: 'monospace' }}>
              ID: {product.id.slice(0, 8)}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{product.name}</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            <strong>{product.price.toLocaleString()}원</strong>
            <span style={{ marginLeft: 8 }}>
              재고: <strong>{available}</strong>
              <span style={{ color: '#aaa' }}> / {product.stock} (선점 {product.reserved_stock})</span>
            </span>
          </div>
        </div>

        {!editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={{
                padding: '4px 10px',
                background: '#fff',
                border: '1px solid #111',
                color: '#111',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                whiteSpace: 'nowrap',
              }}
            >
              ✏️ 수정
            </button>
            {/* ← [정책㉠] 숨김/숨김해제 1-click CTA (수정 폼 진입 불필요) */}
            {product.status === 'hidden' ? (
              <button
                type="button"
                onClick={handleUnhide}
                disabled={busy}
                style={{
                  padding: '4px 10px',
                  background: '#fff',
                  border: '1px solid #16a34a',
                  color: '#16a34a',
                  borderRadius: 4,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                }}
              >
                ↩️ 숨김 해제
              </button>
            ) : (
              <button
                type="button"
                onClick={handleHide}
                disabled={busy}
                style={{
                  padding: '4px 10px',
                  background: '#fff',
                  border: '1px solid #999',
                  color: '#555',
                  borderRadius: 4,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                }}
              >
                🙈 숨김
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <ProductEditForm
          product={product}
          pinnedCount={pinnedCount}
          onSuccess={() => {
            setEditing(false);
            onChange();
          }}
          onCancel={() => setEditing(false)}
          onDeleted={() => {
            setEditing(false);
            onChange();
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// 공통 UI
// ============================================================================

const emptyStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 48,
  textAlign: 'center',
  border: '1px dashed #ddd',
};
