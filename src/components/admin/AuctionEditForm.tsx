// ============================================================================
// AuctionEditForm — 경매 편집 폼 (공통 컴포넌트)
//
// 사용처:
//   1. AdminAuctions 카드 인라인 편집
//   2. AuctionDetailPage 어드민 편집 모드
//
// 내부에서 updateAuction / cancelAuctionAdmin / finalizeAuctionAdmin 호출.
//
// [변경이력]
//   2026-07-06 · 기부자(기증자) 선택/변경 필드 추가(DonorPicker + setAuctionDonor RPC).
//              물품등록(BazaarIntakeForm)과 동일한 DonorPicker 재사용.
// ============================================================================

import { useState } from 'react';
import {
  updateAuction,
  cancelAuctionAdmin,
  finalizeAuctionAdmin,
  setAuctionDonor,          // ← [2026-07-06] 기부자 설정/변경
  type AuctionPatch,
} from '@/lib/adminAuctions';
import { kstInputToUtcIso, utcIsoToKstInput } from '@/lib/settings';
import { ThumbnailUploader, DetailImagesUploader } from '@/components/ImageUploader';
import { RichEditor } from '@/components/RichEditor';
import { DonorPicker, type DonorValue } from '@/components/admin/DonorPicker'; // ← [2026-07-06] 기부자 검색·선택(공용)
import { CustomLabelEditor, type CustomLabelValue } from '@/components/admin/CustomLabelEditor'; // ← [2026-07-06] 커스텀 라벨
import type { EsgAuctionRow, EsgAuctionStatus } from '@/types/esg';

interface AuctionEditFormProps {
  auction: EsgAuctionRow;
  onSuccess: () => void;
  onCancel: () => void;
  /** 종료/취소 후 처리 (예: 페이지 이동) */
  onTerminated?: () => void;
  /** 강제 종료/취소 버튼 표시 여부 (기본 true) */
  showActions?: boolean;
}

export function AuctionEditForm({
  auction,
  onSuccess,
  onCancel,
  onTerminated,
  showActions = true,
}: AuctionEditFormProps) {
  const [busy, setBusy] = useState(false);

  const [productName, setProductName] = useState(auction.product_name);
  const [description, setDescription] = useState(auction.description ?? '');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(auction.thumbnail_url);
  const [detailImages, setDetailImages] = useState<string[]>(auction.detail_images ?? []);
  const [bidUnit, setBidUnit] = useState(auction.bid_unit);
  const [startPrice, setStartPrice] = useState(auction.start_price);
  const [startsAtKst, setStartsAtKst] = useState(utcIsoToKstInput(auction.starts_at));
  const [endsAtKst, setEndsAtKst] = useState(utcIsoToKstInput(auction.ends_at));
  const [status, setStatus] = useState<EsgAuctionStatus>(auction.status);
  const [sortOrder, setSortOrder] = useState(auction.sort_order);
  const [isNew, setIsNew] = useState(auction.is_new);   // ← [2026-06-09] "새 상품" 라벨
  // ← [2026-07-06] 커스텀 라벨(텍스트+배경/폰트색). 문자열로 보관(빈 문자열=미지정).
  const [label, setLabel] = useState<CustomLabelValue>({
    text: auction.label_text ?? '',
    bg: auction.label_bg ?? '',
    color: auction.label_color ?? '',
  });
  // ← [2026-07-06] 기부자: 경매 컬럼 스냅샷으로 초기화(아바타는 client-augment donor 에서)
  const [donor, setDonor] = useState<DonorValue | null>(
    auction.donor_name_snapshot
      ? {
          id: auction.donor_id,
          name: auction.donor_name_snapshot,
          dept: auction.donor_dept_snapshot,
          avatar_url: auction.donor?.avatar_url ?? null,
        }
      : null,
  );

  const save = async () => {
    if (!productName.trim()) {
      alert('상품명을 입력해주세요.');
      return;
    }
    if (bidUnit < 100) {
      alert('호가 단위는 100원 이상이어야 합니다.');
      return;
    }
    if (startPrice < 0) {
      alert('시작가는 0 이상이어야 합니다.');
      return;
    }
    if (!startsAtKst || !endsAtKst) {
      alert('시작/종료 시각을 모두 입력해주세요.');
      return;
    }
    const startsUtc = kstInputToUtcIso(startsAtKst);
    const endsUtc = kstInputToUtcIso(endsAtKst);
    if (new Date(endsUtc) <= new Date(startsUtc)) {
      alert('종료 시각은 시작 시각보다 뒤여야 합니다.');
      return;
    }

    if (auction.status === 'active' && bidUnit !== auction.bid_unit) {
      const ok = confirm(
        `진행 중인 경매의 호가 단위를 ${auction.bid_unit.toLocaleString()}원 → ${bidUnit.toLocaleString()}원으로 변경합니다.\n\n` +
          `현재가에 새 호가 단위가 적용되어 다음 최소 입찰가가 즉시 바뀝니다.\n계속하시겠습니까?`
      );
      if (!ok) return;
    }

    const patch: AuctionPatch = {};
    if (productName !== auction.product_name) patch.product_name = productName;
    if (description !== (auction.description ?? '')) patch.description = description || null;
    if (thumbnailUrl !== auction.thumbnail_url) patch.thumbnail_url = thumbnailUrl;
    if (JSON.stringify(detailImages) !== JSON.stringify(auction.detail_images ?? [])) {
      patch.detail_images = detailImages;
    }
    if (bidUnit !== auction.bid_unit) patch.bid_unit = bidUnit;
    if (startPrice !== auction.start_price) patch.start_price = startPrice;
    if (startsUtc !== auction.starts_at) patch.starts_at = startsUtc;
    if (endsUtc !== auction.ends_at) patch.ends_at = endsUtc;
    if (status !== auction.status) patch.status = status;
    if (sortOrder !== auction.sort_order) patch.sort_order = sortOrder;
    if (isNew !== auction.is_new) patch.is_new = isNew;   // ← [2026-06-09]

    // ← [2026-07-06] 커스텀 라벨 diff. 텍스트 없으면 색까지 모두 null(미표시).
    const lt = label.text.trim() || null;
    const lb = lt ? (label.bg.trim() || null) : null;
    const lc = lt ? (label.color.trim() || null) : null;
    if (lt !== (auction.label_text ?? null)) patch.label_text = lt;
    if (lb !== (auction.label_bg ?? null)) patch.label_bg = lb;
    if (lc !== (auction.label_color ?? null)) patch.label_color = lc;

    // ← [2026-07-06] 기부자 변경 감지 (id/이름/부서 중 하나라도 달라지면 변경)
    const donorChanged =
      (donor?.id ?? null) !== (auction.donor_id ?? null) ||
      (donor?.name ?? null) !== (auction.donor_name_snapshot ?? null) ||
      (donor?.dept ?? null) !== (auction.donor_dept_snapshot ?? null);

    if (Object.keys(patch).length === 0 && !donorChanged) { // ← [2026-07-06] 변경 없음 판정에 기부자 포함
      onCancel();
      return;
    }

    setBusy(true);
    try {
      if (Object.keys(patch).length > 0) await updateAuction(auction.id, patch); // ← [2026-07-06] 필드 변경 시에만
      if (donorChanged) await setAuctionDonor(auction.id, donor);                 // ← [2026-07-06] 기부자 변경 시에만
      onSuccess();
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusy(false);
    }
  };

  const handleForceFinalize = async () => {
    if (auction.status !== 'active') return;
    const ok = confirm(
      `"${auction.product_name}" 경매를 즉시 종료합니다.\n\n` +
        `현재 최고 입찰자가 자동 낙찰되며 입금 주문이 생성됩니다 (당일 23:59 KST 만료).\n계속하시겠습니까?`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const result = await finalizeAuctionAdmin(auction.id);
      if (result.hasWinner) {
        alert(
          `✅ 낙찰 처리 완료\n낙찰가: ${result.finalPrice?.toLocaleString()}원\n주문번호: ${result.orderNumber}`
        );
      } else {
        alert('✅ 경매 종료 (입찰자 없음)');
      }
      onTerminated ? onTerminated() : onSuccess();
    } catch (e) {
      alert(e instanceof Error ? e.message : '종료 처리 실패');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelAuction = async () => {
    if (auction.status === 'ended' || auction.status === 'cancelled') return;
    const reason = prompt(
      `"${auction.product_name}" 경매를 취소합니다.\n취소 사유를 입력하세요 (선택):`,
      ''
    );
    if (reason === null) return;
    setBusy(true);
    try {
      await cancelAuctionAdmin(auction.id, reason ?? '');
      onTerminated ? onTerminated() : onSuccess();
    } catch (e) {
      alert(e instanceof Error ? e.message : '취소 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: '#f0f9ff', padding: 16, borderRadius: 8 }}>
      <Field label="상품명 *">
        <input
          type="text"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          disabled={busy}
          style={inputStyle}
        />
      </Field>
      {/* ← [2026-07-06] 기부자(기증자) 선택/변경 — 물품등록과 동일한 DonorPicker */}
      <Field label="기부자 (기증자)">
        <DonorPicker value={donor} onChange={setDonor} disabled={busy} />
        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
          임직원 이름으로 검색해 선택하세요. 변경 시 연결된 접수대장에도 자동 반영됩니다.
        </div>
      </Field>
      <Field label="상세 설명">
        <RichEditor
          value={description}
          onChange={setDescription}
          uploaderKind="auction"
          uploaderOwnerId={auction.id}
          disabled={busy}
          minHeight={200}
          placeholder="경매 상품의 상세 설명을 입력하세요."
        />
      </Field>
      <Field label="썸네일">
        <ThumbnailUploader
          kind="auction"
          ownerId={auction.id}
          value={thumbnailUrl}
          onChange={setThumbnailUrl}
          disabled={busy}
        />
      </Field>
      <Field label="상세 이미지">
        <DetailImagesUploader
          kind="auction"
          ownerId={auction.id}
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
        <Field label="호가 단위 (원)">
          <input
            type="number"
            value={bidUnit}
            onChange={(e) => setBidUnit(Number(e.target.value) || 0)}
            disabled={busy}
            step={100}
            min={100}
            style={inputStyle}
          />
        </Field>
        <Field label="시작가 (원)">
          <input
            type="number"
            value={startPrice}
            onChange={(e) => setStartPrice(Number(e.target.value) || 0)}
            disabled={busy}
            step={1000}
            min={0}
            style={inputStyle}
          />
        </Field>
        <Field label="시작 시각 (KST)">
          <input
            type="datetime-local"
            value={startsAtKst}
            onChange={(e) => setStartsAtKst(e.target.value)}
            disabled={busy}
            style={inputStyle}
          />
        </Field>
        <Field label="종료 시각 (KST)">
          <input
            type="datetime-local"
            value={endsAtKst}
            onChange={(e) => setEndsAtKst(e.target.value)}
            disabled={busy}
            style={inputStyle}
          />
        </Field>
        <Field label="상태">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EsgAuctionStatus)}
            disabled={busy}
            style={inputStyle}
          >
            <option value="scheduled">예정</option>
            <option value="active">진행 중</option>
            <option value="ended">종료</option>
            <option value="cancelled">취소됨</option>
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

      {/* ← [2026-06-09] 새 상품 라벨 */}
      <Field label="새 상품 라벨">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#333' }}>
          <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} disabled={busy} style={{ width: 16, height: 16 }} />
          "새 상품" 뱃지 표시
        </label>
      </Field>

      {/* ← [2026-07-06] 커스텀 라벨 — 리스트/상세 이미지 좌상단 오버레이 배지 */}
      <Field label="커스텀 라벨 (텍스트를 비우면 표시 안 됨)">
        <CustomLabelEditor value={label} onChange={setLabel} disabled={busy} />
      </Field>

      <div style={{ display: 'flex', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          style={{
            flex: 1,
            minWidth: 120,
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
        {showActions && auction.status === 'active' && (
          <button
            type="button"
            onClick={handleForceFinalize}
            disabled={busy}
            style={{
              padding: '10px 16px',
              background: '#fff',
              border: '1px solid #10b981',
              color: '#10b981',
              borderRadius: 6,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            🏁 즉시 종료
          </button>
        )}
        {showActions && (auction.status === 'scheduled' || auction.status === 'active') && (
          <button
            type="button"
            onClick={handleCancelAuction}
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
            🚫 경매 취소
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
