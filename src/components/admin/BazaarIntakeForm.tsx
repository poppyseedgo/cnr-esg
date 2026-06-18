// ============================================================================
// BazaarIntakeForm — 바자회 물품 접수 등록/수정 폼
//
// 입력 필드(요구사항):
//   물건 이름 / 물건 카테고리 / 기증자(임직원 검색) / 원래 가격 / 책정 가격 /
//   수량 / 검수 후 최종 게시 여부 / 물건 사진(접수) / 게시할 물건 사진(상품 썸네일)
//
// 모드:
//   - 등록(initial 없음): 저장 → (선택 시) 바로 게시
//   - 수정(initial 있음): 저장 → 이미 게시된 항목이면 "재게시"로 상품에 반영
//
// 사진:
//   - 공용 ThumbnailUploader(kind='bazaar') 재사용. ownerId 는 임시(new-*) 또는 접수 id.
//
// 사용:
//   <BazaarIntakeForm onCancel={...} onSuccess={...} />               // 등록
//   <BazaarIntakeForm initial={row} onCancel={...} onSuccess={...} /> // 수정
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { ThumbnailUploader, DetailImagesUploader } from '@/components/ImageUploader';
import { DonorPicker, type DonorValue } from '@/components/admin/DonorPicker';
import { RichEditor } from '@/components/RichEditor'; // ← [2026-06-17] 검수 메모 WYSIWYG 전환
import { updateProduct } from '@/lib/adminProducts'; // ← [2026-06-17] 검수 메모 → 상품 상세 밀어넣기
import { useDraft } from '@/hooks/useDraft'; // ← [2026-06-16] 작성 내용 자동 임시저장
import { UNSAVED_CONFIRM_MSG } from '@/hooks/useUnsavedGuard'; // ← [2026-06-16] 취소 확인 메시지
import {
  createIntake,
  updateIntake,
  publishIntake,
  BAZAAR_CATEGORIES,
} from '@/lib/bazaarIntake';
import type { EsgBazaarIntakeRow, BazaarCategory } from '@/types/esg';

interface BazaarIntakeFormProps {
  initial?: EsgBazaarIntakeRow;
  onCancel: () => void;
  onSuccess: () => void;
  /** 작성 중 여부 변경 통지 — 부모(ModalShell)가 닫기 가드에 사용 */
  onDirtyChange?: (dirty: boolean) => void;
}

export function BazaarIntakeForm({ initial, onCancel, onSuccess, onDirtyChange }: BazaarIntakeFormProps) {
  const { currentUser } = useCurrentUser();
  const isEdit = !!initial;

  // 사진 업로드용 owner id (수정이면 실제 id, 신규면 임시)
  const [ownerId] = useState(() => initial?.id ?? `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  // ── [2026-06-16] 작성 내용 자동 임시저장(localStorage) ──────────────────
  type BazaarDraft = {
    name: string; category: BazaarCategory; donor: DonorValue | null;
    originalPrice: number | ''; listedPrice: number | ''; quantity: number | '';
    intakePhotos: string[]; publishPhoto: string | null; note: string;
    isNew: boolean;
  };
  const draftKey = `esg:draft:bazaar:${initial?.id ?? 'new'}`;
  const draft = useDraft<BazaarDraft>(draftKey);
  const d0 = useMemo(() => draft.load(), [draft]);

  const [name, setName] = useState(d0?.name ?? initial?.name ?? '');
  const [category, setCategory] = useState<BazaarCategory>(d0?.category ?? initial?.category ?? 'clothing');
  const [donor, setDonor] = useState<DonorValue | null>(
    d0?.donor ??
      (initial
        ? { id: initial.donor_id, name: initial.donor_name_snapshot, dept: initial.donor_dept_snapshot, avatar_url: null }
        : null)
  );
  // 숫자 입력은 number | '' 로 둬야 비우고(=공백) 자유롭게 타이핑 가능. // ← [모바일 버그수정]
  // (이전 `Number(value) || 0` 패턴은 값을 지우면 즉시 0으로 되돌려 입력이 막혔음)
  const [originalPrice, setOriginalPrice] = useState<number | ''>(d0?.originalPrice ?? initial?.original_price ?? '');
  const [listedPrice, setListedPrice] = useState<number | ''>(d0?.listedPrice ?? initial?.listed_price ?? ''); // ← [수정] 0 기본 → 빈값(타이핑 가능)
  const [quantity, setQuantity] = useState<number | ''>(d0?.quantity ?? initial?.quantity ?? 1);             // ← [수정] number → number|''
  const [intakePhotos, setIntakePhotos] = useState<string[]>(d0?.intakePhotos ?? initial?.intake_photos ?? []); // ← [수정] 단일→배열(최대 5장)
  const [publishPhoto, setPublishPhoto] = useState<string | null>(d0?.publishPhoto ?? initial?.publish_photo_url ?? null);
  const [note, setNote] = useState(d0?.note ?? initial?.note ?? '');
  const [isNew, setIsNew] = useState(d0?.isNew ?? initial?.is_new ?? false); // ← [2026-06-17] 완전 새 상품

  // 게시 여부:
  //  - 신규: 'pending'(검수 대기) | 'publish'(바로 게시)
  //  - 수정(이미 게시됨): 저장 후 상품에 반영(재게시) 체크
  const [publishNow, setPublishNow] = useState(false);
  const [reflectOnSave, setReflectOnSave] = useState(initial?.publish_status === 'published');

  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false); // ← [2026-06-17] 상품 상세로 밀어넣기 진행중

  // 검수 메모 → 연결된 상품의 상세설명으로 밀어넣기(덮어쓰기). 폼 저장과 별개로 즉시 반영.
  const pushNoteToProduct = async () => {
    if (!initial?.product_id) return;
    if (
      !confirm(
        "현재 '검수 메모' 내용을 이 물품의 '상품 상세설명'에 덮어씁니다.\n" +
          '상품 페이지에 즉시 반영되며, 이 폼의 저장과는 별개입니다.\n계속할까요?'
      )
    )
      return;
    setPushing(true);
    try {
      await updateProduct(initial.product_id, { description: note || null });
      alert('상품 상세설명에 반영했습니다.');
    } catch (e) {
      alert(e instanceof Error ? e.message : '반영 실패');
    } finally {
      setPushing(false);
    }
  };

  // ── [2026-06-16] dirty 판정 + 부모 통지 + 자동 임시저장 ─────────────────
  const isDirty =
    !saving &&
    (name.trim() !== (initial?.name ?? '') ||
      category !== (initial?.category ?? 'clothing') ||
      (donor?.name ?? '') !== (initial?.donor_name_snapshot ?? '') ||
      String(originalPrice) !== String(initial?.original_price ?? '') ||
      String(listedPrice) !== String(initial?.listed_price ?? '') ||
      String(quantity) !== String(initial?.quantity ?? 1) ||
      note.trim() !== (initial?.note ?? '') ||
      intakePhotos.length !== (initial?.intake_photos?.length ?? 0) ||
      (publishPhoto ?? '') !== (initial?.publish_photo_url ?? '') ||
      isNew !== (initial?.is_new ?? false));

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]); // 언마운트 시 해제

  useEffect(() => {
    const id = setTimeout(() => {
      if (saving) return;
      if (isDirty)
        draft.save({ name, category, donor, originalPrice, listedPrice, quantity, intakePhotos, publishPhoto, note, isNew });
      else draft.clear();
    }, 600);
    return () => clearTimeout(id);
  }, [isDirty, name, category, donor, originalPrice, listedPrice, quantity, intakePhotos, publishPhoto, note, isNew, saving, draft]);

  const validate = (forPublish: boolean): string | null => {
    if (!name.trim()) return '물건 이름을 입력해주세요.';
    if (!donor || !donor.name.trim()) return '기증자를 선택해주세요.';
    if (listedPrice === '' || Number(listedPrice) < 0) return '책정 가격을 0 이상으로 입력해주세요.'; // ← [수정] 빈값 검증
    if (quantity === '' || Number(quantity) < 1) return '수량을 1개 이상으로 입력해주세요.';            // ← [수정] 빈값 검증
    if (originalPrice !== '' && Number(originalPrice) < 0) return '원래 가격은 0 이상이어야 합니다.';
    if (forPublish && !publishPhoto) return '게시하려면 "게시할 물건 사진"이 필요합니다.';
    return null;
  };

  const save = async () => {
    const willPublish = isEdit ? reflectOnSave : publishNow;
    const err = validate(willPublish);
    if (err) {
      alert(err);
      return;
    }
    setSaving(true);
    try {
      let intakeId = initial?.id;

      // validate()에서 빈값/음수는 이미 차단됨 → 여기서는 확정 숫자로 변환 // ← [수정]
      const listedNum = Number(listedPrice);
      const qtyNum = Number(quantity);
      const originalNum = originalPrice === '' ? null : Number(originalPrice);

      if (isEdit && initial) {
        await updateIntake(initial.id, {
          name,
          category,
          donor_id: donor!.id,
          donor_name_snapshot: donor!.name,
          donor_dept_snapshot: donor!.dept,
          original_price: originalNum,
          listed_price: listedNum,
          quantity: qtyNum,
          intake_photos: intakePhotos,
          publish_photo_url: publishPhoto,
          note: note.trim() || null,
          is_new: isNew,
        });
      } else {
        const row = await createIntake({
          name,
          category,
          donor_id: donor!.id,
          donor_name_snapshot: donor!.name,
          donor_dept_snapshot: donor!.dept,
          original_price: originalNum,
          listed_price: listedNum,
          quantity: qtyNum,
          intake_photos: intakePhotos,
          publish_photo_url: publishPhoto,
          note: note.trim() || null,
          is_new: isNew,
          created_by: currentUser?.id ?? null,
        });
        intakeId = row.id;
      }

      // 게시(또는 재게시) — 상품 생성/반영은 DB RPC가 처리
      if (willPublish && intakeId) {
        await publishIntake(intakeId);
      }

      draft.clear(); // ← [2026-06-16] 저장 성공 → 임시저장 삭제
      onSuccess();
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Field label="물건 이름 *">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 무지 텀블러 (거의 새것)"
          disabled={saving}
          style={inputStyle}
        />
      </Field>

      <Field label="물건 카테고리 *">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as BazaarCategory)}
          disabled={saving}
          style={inputStyle}
        >
          {BAZAAR_CATEGORIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="기증자 (임직원 검색) *">
        <DonorPicker value={donor} onChange={setDonor} disabled={saving} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Field label="원래 가격 (원)">
          <input
            type="number"
            inputMode="numeric"
            value={originalPrice}
            onChange={(e) => setOriginalPrice(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="선택 입력"
            disabled={saving}
            step={1000}
            min={0}
            style={inputStyle}
          />
        </Field>
        <Field label="책정 가격 (원) *">
          <input
            type="number"
            inputMode="numeric"
            value={listedPrice}
            onChange={(e) => setListedPrice(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="예: 5000"
            disabled={saving}
            step={500}
            min={0}
            style={inputStyle}
          />
        </Field>
        <Field label="수량 (개) *">
          <input
            type="number"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="예: 1"
            disabled={saving}
            step={1}
            min={1}
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="물건 사진 (접수·검수 기록용) — 최대 3장">
        <DetailImagesUploader
          kind="bazaar"
          ownerId={ownerId}
          values={intakePhotos}
          onChange={setIntakePhotos}
          maxCount={3}
          disabled={saving}
          compress
          compressMaxDimension={1280}
          compressQuality={0.75}
        />
        <span style={{ fontSize: 11, color: '#888' }}>
          폰으로 바로 촬영해 올릴 수 있어요. 내부 검수 기록용이라 더 가볍게(최대 1280px) 저장합니다.
        </span>
      </Field>

      <Field label="게시할 물건 사진 (상품 썸네일)">
        <ThumbnailUploader kind="bazaar" ownerId={ownerId} value={publishPhoto} onChange={setPublishPhoto} disabled={saving} compress />
      </Field>

      <Field label="새 상품 여부">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, fontSize: 13, color: '#333' }}>
          <input
            type="checkbox"
            checked={isNew}
            onChange={(e) => setIsNew(e.target.checked)}
            disabled={saving}
            style={{ width: 16, height: 16 }}
          />
          완전 새 상품(미사용)입니다 — 게시 시 상품에 "새 상품" 뱃지 표시
        </label>
      </Field>

      <Field label="검수 메모 (선택)">
        <RichEditor
          value={note}
          onChange={setNote}
          uploaderKind="bazaar"
          uploaderOwnerId={ownerId}
          minHeight={220}
          disabled={saving}
          placeholder="상태/하자/검수 결과, 상세 사이즈, 링크 등을 입력하세요."
        />
        {isEdit && initial?.product_id && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              onClick={pushNoteToProduct}
              disabled={saving || pushing || !note.trim()}
              title="현재 검수 메모 내용을 연결된 상품의 상세설명으로 복사합니다."
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid #ddd',
                borderRadius: 6,
                background: '#fff',
                color: saving || pushing || !note.trim() ? '#bbb' : '#333',
                cursor: saving || pushing || !note.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {pushing ? '반영 중…' : '📤 상품 상세설명으로 보내기'}
            </button>
          </div>
        )}
      </Field>

      {/* 검수 후 최종 게시 여부 */}
      {!isEdit ? (
        <Field label="검수 후 최종 게시 여부">
          <select
            value={publishNow ? 'publish' : 'pending'}
            onChange={(e) => setPublishNow(e.target.value === 'publish')}
            disabled={saving}
            style={inputStyle}
          >
            <option value="pending">검수 대기 (접수만, 게시 안 함)</option>
            <option value="publish">바로 게시 (상품 페이지에 즉시 공개)</option>
          </select>
          {publishNow && !publishPhoto && (
            <span style={{ fontSize: 11, color: '#dc2626' }}>※ 게시하려면 "게시할 물건 사진"을 먼저 등록하세요.</span>
          )}
        </Field>
      ) : initial?.publish_status === 'published' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0', fontSize: 13, color: '#0369a1' }}>
          <input
            type="checkbox"
            checked={reflectOnSave}
            onChange={(e) => setReflectOnSave(e.target.checked)}
            disabled={saving}
          />
          저장 후 상품 페이지에 즉시 반영(재게시) — 이름·가격·수량·썸네일이 덮어쓰기 됩니다
        </label>
      ) : (
        <p style={{ fontSize: 12, color: '#888', margin: '10px 0' }}>
          현재 미게시 상태입니다. 저장 후 목록에서 "게시"를 눌러 상품 페이지에 공개할 수 있습니다.
        </p>
      )}

      <div
        style={{
          display: 'flex',
          gap: 6,
          marginTop: 16,
          position: 'sticky',     // ← [2026-06-16] 모달 바텀에 고정(스크롤해도 항상 보임)
          bottom: 0,
          background: '#fff',
          paddingTop: 12,
          paddingBottom: 4,
          borderTop: '1px solid #eee',
          zIndex: 1,
        }}
      >
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            flex: 1,
            padding: '10px 12px',
            background: saving ? '#ccc' : '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {saving ? '저장 중…' : isEdit ? '저장' : '접수 등록'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!isDirty || window.confirm(UNSAVED_CONFIRM_MSG)) onCancel();
          }}
          disabled={saving}
          style={{ padding: '10px 16px', background: '#fff', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
        >
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
  padding: '10px 12px',
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 16,            // ← [모바일] 16px 미만이면 iOS가 입력 시 화면을 확대함 → 16px 고정
  boxSizing: 'border-box',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}
