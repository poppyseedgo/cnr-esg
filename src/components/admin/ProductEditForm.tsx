// ============================================================================
// ProductEditForm — 바자회 상품 편집 폼 (공통 컴포넌트)
//
// 사용처:
//   1. AdminProducts 카드 인라인 편집
//   2. BazaarProductPage 어드민 편집 모드
//
// 내부에서 updateProduct / deleteProduct 호출.
// 부모는 onSuccess / onCancel만 제공.
// ============================================================================

import { useState } from 'react';
import { updateProduct, deleteProduct } from '@/lib/adminProducts';
import { getAvailableStock } from '@/lib/products';
import { ThumbnailUploader, DetailImagesUploader } from '@/components/ImageUploader';
import { RichEditor } from '@/components/RichEditor';
import type { EsgProductRow, EsgProductStatus } from '@/types/esg';

interface ProductEditFormProps {
  product: EsgProductRow;
  onSuccess: () => void;
  onCancel: () => void;
  /** 삭제 후 처리 (예: 페이지 이동) */
  onDeleted?: () => void;
  /** 삭제 버튼 표시 여부 (기본 true) */
  showDelete?: boolean;
}

export function ProductEditForm({
  product,
  onSuccess,
  onCancel,
  onDeleted,
  showDelete = true,
}: ProductEditFormProps) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? '');
  const [price, setPrice] = useState(product.price);
  const [stock, setStock] = useState(product.stock);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(product.thumbnail_url);
  const [detailImages, setDetailImages] = useState<string[]>(product.detail_images ?? []);
  const [status, setStatus] = useState<EsgProductStatus>(product.status);
  const [sortOrder, setSortOrder] = useState(product.sort_order);
  const [isNew, setIsNew] = useState(product.is_new);                                  // ← [2026-06-09]
  const [salePrice, setSalePrice] = useState<number | ''>(product.sale_price ?? '');   // ← [2026-06-09]

  // ← [2026-06-09] 세일 유효성/할인율 미리보기
  const saleActive = salePrice !== '' && salePrice >= 0 && salePrice < price;
  const discountPct = saleActive ? Math.round(((price - (salePrice as number)) / price) * 100) : null;

  const save = async () => {
    if (!name.trim()) {
      alert('상품명을 입력해주세요.');
      return;
    }
    if (price < 0 || stock < 0) {
      alert('가격과 재고는 0 이상이어야 합니다.');
      return;
    }
    if (stock < product.reserved_stock) {
      const ok = confirm(
        `재고를 ${product.reserved_stock}개 미만으로 설정합니다. ` +
          `이미 선점된 주문(${product.reserved_stock}개)이 있어 데이터 정합성에 문제가 생길 수 있습니다.\n` +
          `계속하시겠습니까?`
      );
      if (!ok) return;
    }

    setBusy(true);
    try {
      const patch: Record<string, unknown> = {};
      if (name !== product.name) patch.name = name;
      if (description !== (product.description ?? '')) patch.description = description || null;
      if (price !== product.price) patch.price = price;
      if (stock !== product.stock) patch.stock = stock;
      if (thumbnailUrl !== product.thumbnail_url) patch.thumbnail_url = thumbnailUrl;
      if (JSON.stringify(detailImages) !== JSON.stringify(product.detail_images ?? [])) {
        patch.detail_images = detailImages;
      }
      if (status !== product.status) patch.status = status;
      if (sortOrder !== product.sort_order) patch.sort_order = sortOrder;
      // ← [2026-06-09] 새 상품 / 세일가 diff. 세일가는 정상가 미만일 때만 적용, 아니면 null.
      const nextSale = saleActive ? (salePrice as number) : null;
      if (isNew !== product.is_new) patch.is_new = isNew;
      if (nextSale !== product.sale_price) patch.sale_price = nextSale;

      if (Object.keys(patch).length === 0) {
        onCancel();
        return;
      }

      await updateProduct(product.id, patch as never);
      onSuccess();
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    const ok = confirm(
      `"${product.name}"을(를) 영구 삭제합니다. 되돌릴 수 없습니다.\n\n` +
        `완료된 주문·Q&A·진행 중 주문이 있으면 삭제할 수 없습니다. 이 경우 "숨김" 처리하세요.\n계속하시겠습니까?` // ← [정책㉠] 문구 정정
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deleteProduct(product.id);
      onDeleted ? onDeleted() : onSuccess();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setBusy(false);
    }
  };

  const available = getAvailableStock({ stock, reserved_stock: product.reserved_stock });

  return (
    <div style={{ background: '#f0f9ff', padding: 16, borderRadius: 8 }}>
      <Field label="상품명 *">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          style={inputStyle}
        />
      </Field>
      <Field label="상세 설명">
        <RichEditor
          value={description}
          onChange={setDescription}
          uploaderKind="bazaar"
          uploaderOwnerId={product.id}
          disabled={busy}
          minHeight={200}
          placeholder="상품의 상세 설명을 입력하세요."
        />
      </Field>
      <Field label="썸네일">
        <ThumbnailUploader
          kind="bazaar"
          ownerId={product.id}
          value={thumbnailUrl}
          onChange={setThumbnailUrl}
          disabled={busy}
        />
      </Field>
      <Field label="상세 이미지">
        <DetailImagesUploader
          kind="bazaar"
          ownerId={product.id}
          values={detailImages}
          onChange={setDetailImages}
          maxCount={5}
          disabled={busy}
        />
      </Field>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          marginTop: 12,
        }}
      >
        <Field label="가격 (원)">
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value) || 0)}
            disabled={busy}
            step={1000}
            min={0}
            style={inputStyle}
          />
        </Field>
        <Field label={`재고 (개) · 가용 ${available}/${stock}`}>
          <input
            type="number"
            value={stock}
            onChange={(e) => setStock(Number(e.target.value) || 0)}
            disabled={busy}
            step={1}
            min={0}
            style={inputStyle}
          />
        </Field>
        <Field label="상태">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EsgProductStatus)}
            disabled={busy}
            style={inputStyle}
          >
            <option value="on_sale">판매 중</option>
            <option value="sold_out">품절</option>
            <option value="hidden">숨김</option>
          </select>
        </Field>
        <Field label="정렬 순서">
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
            disabled={busy}
            step={1}
            style={inputStyle}
          />
        </Field>
      </div>

      {/* ← [2026-06-09] 새 상품 라벨 + 세일가 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          marginTop: 12,
          alignItems: 'end',
        }}
      >
        <Field label="새 상품 라벨">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, fontSize: 13, color: '#333' }}>
            <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} disabled={busy} style={{ width: 16, height: 16 }} />
            "새 상품" 뱃지 표시
          </label>
        </Field>
        <Field label="세일가 (원) · 비우면 세일 없음">
          <input
            type="number"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value === '' ? '' : (Number(e.target.value) || 0))}
            disabled={busy}
            step={1000}
            min={0}
            placeholder="예: 8000"
            style={inputStyle}
          />
        </Field>
        <Field label="할인율(자동 계산)">
          <div style={{ height: 36, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600, color: discountPct ? '#dc2626' : '#999' }}>
            {salePrice === '' ? '—' : discountPct ? `${discountPct}% 할인 (${(salePrice as number).toLocaleString()}원)` : '세일가가 정상가보다 낮아야 함'}
          </div>
        </Field>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          style={{
            flex: 1,
            padding: '10px 12px',
            background: busy ? '#ccc' : '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: busy ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {busy ? '저장 중…' : '저장'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            padding: '10px 16px',
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          취소
        </button>
        {showDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            style={{
              padding: '10px 16px',
              background: '#fff',
              border: '1px solid #fecaca',
              color: '#dc2626',
              borderRadius: 6,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            🗑 삭제
          </button>
        )}
      </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}
