// ============================================================================
// CreateAuctionForm — 새 경매 등록 폼 (공통)
//
// 사용처:
//   - AdminAuctions 페이지 (어드민)
//   - AuctionPage (어드민 권한일 때 "새 경매 등록" 모달)
// ============================================================================

import { useState } from 'react';
import { createAuction, type CreateAuctionInput } from '@/lib/adminAuctions';
import { kstInputToUtcIso } from '@/lib/settings';
import { ThumbnailUploader, DetailImagesUploader } from '@/components/ImageUploader';
import { MarkdownEditor } from '@/components/MarkdownEditor';

interface CreateAuctionFormProps {
  onCancel: () => void;
  onSuccess: () => void;
}

export function CreateAuctionForm({ onCancel, onSuccess }: CreateAuctionFormProps) {
  const [tempId] = useState(() => `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [startPrice, setStartPrice] = useState(10000);
  const [bidUnit, setBidUnit] = useState(1000);
  const [startsAtKst, setStartsAtKst] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 16);
  });
  const [endsAtKst, setEndsAtKst] = useState(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 16);
  });
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [detailImages, setDetailImages] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!productName.trim()) {
      alert('상품명을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const input: CreateAuctionInput = {
        product_name: productName,
        description: description || null,
        thumbnail_url: thumbnailUrl,
        detail_images: detailImages,
        start_price: startPrice,
        bid_unit: bidUnit,
        starts_at: kstInputToUtcIso(startsAtKst),
        ends_at: kstInputToUtcIso(endsAtKst),
        status: 'scheduled',
        sort_order: sortOrder,
      };
      await createAuction(input);
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
        <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="예: 🌳 (한정판) C&R 29주년 식수 명패" disabled={saving} style={inputStyle} />
      </Field>
      <Field label="상세 설명 (마크다운)">
        <MarkdownEditor
          value={description}
          onChange={setDescription}
          uploaderKind="auction"
          uploaderOwnerId={tempId}
          disabled={saving}
          minHeight={200}
          placeholder="경매 상품의 상세 설명을 입력하세요. 마크다운 문법 지원."
        />
      </Field>
      <Field label="썸네일">
        <ThumbnailUploader kind="auction" ownerId={tempId} value={thumbnailUrl} onChange={setThumbnailUrl} disabled={saving} />
      </Field>
      <Field label="상세 이미지">
        <DetailImagesUploader kind="auction" ownerId={tempId} values={detailImages} onChange={setDetailImages} maxCount={5} disabled={saving} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
        <Field label="시작가 (원) *">
          <input type="number" value={startPrice} onChange={(e) => setStartPrice(Number(e.target.value) || 0)} disabled={saving} step={1000} min={0} style={inputStyle} />
        </Field>
        <Field label="호가 단위 (원) *">
          <input type="number" value={bidUnit} onChange={(e) => setBidUnit(Number(e.target.value) || 0)} disabled={saving} step={100} min={100} style={inputStyle} />
        </Field>
        <Field label="시작 시각 (KST) *">
          <input type="datetime-local" value={startsAtKst} onChange={(e) => setStartsAtKst(e.target.value)} disabled={saving} style={inputStyle} />
        </Field>
        <Field label="종료 시각 (KST) *">
          <input type="datetime-local" value={endsAtKst} onChange={(e) => setEndsAtKst(e.target.value)} disabled={saving} style={inputStyle} />
        </Field>
        <Field label="정렬 순서">
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} disabled={saving} step={1} style={inputStyle} />
        </Field>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
        <button type="button" onClick={save} disabled={saving} style={{ flex: 1, padding: '10px 12px', background: saving ? '#ccc' : '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
          {saving ? '등록 중…' : '경매 등록'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} style={{ padding: '10px 16px', background: '#fff', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          취소
        </button>
      </div>
    </div>
  );
}

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
