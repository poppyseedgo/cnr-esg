// ============================================================================
// CreateProductForm — 새 바자회 상품 등록 폼 (공통)
//
// 사용처:
//   - AdminProducts 페이지 (어드민)
//   - BazaarPage (어드민 권한일 때 "새 상품 등록" 모달)
//
// 권한:
//   - 호출 측에서 isAdmin 체크 필요. RLS도 차단 (이중 안전).
// ============================================================================

import { useState } from 'react';
import { createProduct } from '@/lib/adminProducts';
import { ThumbnailUploader, DetailImagesUploader } from '@/components/ImageUploader';
import { RichEditor } from '@/components/RichEditor';
import type { EsgProductStatus } from '@/types/esg';

interface CreateProductFormProps {
  onCancel: () => void;
  onSuccess: () => void;
}

export function CreateProductForm({ onCancel, onSuccess }: CreateProductFormProps) {
  const [tempId] = useState(() => `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(10000);
  const [stock, setStock] = useState(10);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [detailImages, setDetailImages] = useState<string[]>([]);
  const [status, setStatus] = useState<EsgProductStatus>('on_sale');
  const [sortOrder, setSortOrder] = useState(0);
  const [isNew, setIsNew] = useState(false);                       // ← [2026-06-09] "새 상품" 라벨
  const [salePrice, setSalePrice] = useState<number | ''>('');     // ← [2026-06-09] 세일가(빈값=세일 없음)
  const [saving, setSaving] = useState(false);

  // ← [2026-06-09] 세일가 유효성/할인율 미리보기 (정상가 미만일 때만 세일)
  const saleActive = salePrice !== '' && salePrice >= 0 && salePrice < price;
  const discountPct = saleActive ? Math.round(((price - (salePrice as number)) / price) * 100) : null;

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
        is_new: isNew,                                        // ← [2026-06-09]
        sale_price: saleActive ? (salePrice as number) : null, // ← [2026-06-09] 정상가 미만일 때만 저장
      });
      onSuccess();
    } catch (e) {
      alert(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Field label="상품명 *">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 🌱 친환경 텀블러" disabled={saving} style={inputStyle} />
      </Field>
      <Field label="상세 설명">
        <RichEditor
          value={description}
          onChange={setDescription}
          uploaderKind="bazaar"
          uploaderOwnerId={tempId}
          disabled={saving}
          minHeight={200}
          placeholder="상품의 상세 설명을 입력하세요."
        />
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

      {/* ← [2026-06-09] 새 상품 라벨 + 세일가 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12, alignItems: 'end' }}>
        <Field label="새 상품 라벨">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, fontSize: 13, color: '#333' }}>
            <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} disabled={saving} style={{ width: 16, height: 16 }} />
            "새 상품" 뱃지 표시
          </label>
        </Field>
        <Field label="세일가 (원) · 비우면 세일 없음">
          <input
            type="number"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value === '' ? '' : (Number(e.target.value) || 0))}
            disabled={saving}
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
        <button type="button" onClick={save} disabled={saving} style={{ flex: 1, padding: '10px 12px', background: saving ? '#ccc' : '#111', color: '#fff', border: 'none', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
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
// 내부 헬퍼
// ============================================================================

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #ddd',
  borderRadius: 6,
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
