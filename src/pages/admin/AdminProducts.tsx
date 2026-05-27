// ============================================================================
// AdminProducts — 바자회 상품 어드민 페이지
//
// 편집 폼은 ProductEditForm 공통 컴포넌트 사용 (상세 페이지와 코드 공유).
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadAllProducts, createProduct } from '@/lib/adminProducts';
import { subscribeProducts, getAvailableStock } from '@/lib/products';
import { ThumbnailUploader, DetailImagesUploader } from '@/components/ImageUploader';
import { ProductEditForm } from '@/components/admin/ProductEditForm';
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
            background: '#0ea5e9',
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
        이미지, 가격, 재고를 관리할 수 있습니다. 상세 페이지에서도 동일하게 편집 가능합니다.
      </p>

      {creating && (
        <CreateProductForm
          onCancel={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false);
            void reload();
          }}
        />
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
          {products.map((p) => (
            <ProductAdminCard key={p.id} product={p} onChange={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 새 상품 등록 폼
// ============================================================================

function CreateProductForm({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: () => void }) {
  const [tempId] = useState(() => `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(10000);
  const [stock, setStock] = useState(10);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [detailImages, setDetailImages] = useState<string[]>([]);
  const [status, setStatus] = useState<EsgProductStatus>('on_sale');
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      alert('상품명을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      await createProduct({
        name,
        description: description || null,
        price,
        stock,
        thumbnail_url: thumbnailUrl,
        detail_images: detailImages,
        status,
        sort_order: sortOrder,
      });
      onSuccess();
    } catch (e) {
      alert(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        border: '2px solid #0ea5e9',
      }}
    >
      <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#0ea5e9' }}>➕ 새 상품 등록</h3>

      <Field label="상품명 *">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 🌱 친환경 텀블러" disabled={saving} style={inputStyle} />
      </Field>
      <Field label="설명">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="상품 설명" disabled={saving} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
      </Field>
      <Field label="썸네일">
        <ThumbnailUploader kind="bazaar" ownerId={tempId} value={thumbnailUrl} onChange={setThumbnailUrl} disabled={saving} />
      </Field>
      <Field label="상세 이미지">
        <DetailImagesUploader kind="bazaar" ownerId={tempId} values={detailImages} onChange={setDetailImages} maxCount={5} disabled={saving} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
        <Field label="가격 (원) *">
          <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} disabled={saving} step={1000} min={0} style={inputStyle} />
        </Field>
        <Field label="재고 (개) *">
          <input type="number" value={stock} onChange={(e) => setStock(Number(e.target.value) || 0)} disabled={saving} step={1} min={0} style={inputStyle} />
        </Field>
        <Field label="상태">
          <select value={status} onChange={(e) => setStatus(e.target.value as EsgProductStatus)} disabled={saving} style={inputStyle}>
            <option value="on_sale">판매 중</option>
            <option value="sold_out">품절</option>
            <option value="hidden">숨김</option>
          </select>
        </Field>
        <Field label="정렬 순서">
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} disabled={saving} step={1} style={inputStyle} />
        </Field>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
        <button type="button" onClick={save} disabled={saving} style={{ flex: 1, padding: '10px 12px', background: saving ? '#ccc' : '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
          {saving ? '등록 중…' : '상품 등록'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} style={{ padding: '10px 16px', background: '#fff', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          취소
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 개별 상품 카드 (ProductEditForm 사용)
// ============================================================================

function ProductAdminCard({ product, onChange }: { product: EsgProductRow; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const statusColor = STATUS_COLORS[product.status];
  const available = getAvailableStock(product);

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
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              padding: '4px 10px',
              background: '#fff',
              border: '1px solid #0ea5e9',
              color: '#0ea5e9',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            ✏️ 수정
          </button>
        )}
      </div>

      {editing && (
        <ProductEditForm
          product={product}
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: 13,
  boxSizing: 'border-box',
};

const emptyStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 48,
  textAlign: 'center',
  border: '1px dashed #ddd',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}
