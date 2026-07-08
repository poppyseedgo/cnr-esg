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

import { useState, useEffect } from 'react';
import { updateProduct, deleteProduct, finalizeFunding } from '@/lib/adminProducts'; // ← [2026-07-07] finalizeFunding
import { pushNoteToLinkedIntake } from '@/lib/bazaarIntake'; // ← [2026-06-17] 상품 상세 → 검수 메모 밀어넣기
import { getAvailableStock } from '@/lib/products';
import { getProductTags, setProductTags, splitTagsByKind } from '@/lib/tags'; // ← [2026-06-23] 카테고리/브랜드 분리
import { TagInput } from '@/components/admin/TagInput'; // ← [2026-06-22] 태그 입력 UI
import { ThumbnailUploader, DetailImagesUploader } from '@/components/ImageUploader';
import { RichEditor } from '@/components/RichEditor';
import { CustomLabelEditor, type CustomLabelValue } from '@/components/admin/CustomLabelEditor'; // ← [2026-07-06] 커스텀 라벨
import type { EsgProductRow, EsgProductStatus, EsgTagRow } from '@/types/esg'; // ← [2026-06-22] EsgTagRow

interface ProductEditFormProps {
  product: EsgProductRow;
  onSuccess: () => void;
  onCancel: () => void;
  /** 삭제 후 처리 (예: 페이지 이동) */
  onDeleted?: () => void;
  /** 삭제 버튼 표시 여부 (기본 true) */
  showDelete?: boolean;
  /** 현재 고정된 상품 수 (체크박스에 N/8 표시용, 선택) */   // ← [2026-06-17]
  pinnedCount?: number;
}

export function ProductEditForm({
  product,
  onSuccess,
  onCancel,
  onDeleted,
  showDelete = true,
  pinnedCount,                                                // ← [2026-06-17]
}: ProductEditFormProps) {
  const [busy, setBusy] = useState(false);
  const [pushing, setPushing] = useState(false); // ← [2026-06-17] 검수 메모로 밀어넣기 진행중

  // 상품 상세설명 → 연결된 검수 메모로 밀어넣기(덮어쓰기). 폼 저장과 별개로 즉시 반영.
  const pushDescToNote = async () => {
    if (
      !confirm(
        "현재 '상품 상세설명' 내용을 연결된 '검수 메모'에 덮어씁니다.\n" +
          '이 폼의 저장과는 별개로 즉시 반영됩니다.\n계속할까요?'
      )
    )
      return;
    setPushing(true);
    try {
      const ok = await pushNoteToLinkedIntake(product.id, description || '');
      alert(ok ? '검수 메모에 반영했습니다.' : '연결된 검수 항목이 없습니다.');
    } catch (e) {
      alert(e instanceof Error ? e.message : '반영 실패');
    } finally {
      setPushing(false);
    }
  };
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? '');
  const [shortDescription, setShortDescription] = useState(product.short_description ?? ''); // ← [2026-07-08] 간단 설명
  const [price, setPrice] = useState(product.price);
  const [stock, setStock] = useState(product.stock);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(product.thumbnail_url);
  const [detailImages, setDetailImages] = useState<string[]>(product.detail_images ?? []);
  const [status, setStatus] = useState<EsgProductStatus>(product.status);
  const [sortOrder, setSortOrder] = useState(product.sort_order);
  const [isNew, setIsNew] = useState(product.is_new);                                  // ← [2026-06-09]
  const [isPinned, setIsPinned] = useState(product.is_pinned);                         // ← [2026-06-17] 상품 고정
  const [salePrice, setSalePrice] = useState<number | ''>(product.sale_price ?? '');   // ← [2026-06-09]
  // ── [2026-07-07] 펀딩(굿즈 전용) 편집 상태 ──
  const isGoods = product.section === 'goods';
  const [purchaseType, setPurchaseType] = useState<'normal' | 'funding'>(product.purchase_type ?? 'normal');
  const [fundingGoalType, setFundingGoalType] = useState<'amount' | 'quantity'>(product.funding_goal_type ?? 'quantity');
  const [fundingGoalAmount, setFundingGoalAmount] = useState<number | ''>(product.funding_goal_amount ?? '');
  const [fundingGoalQuantity, setFundingGoalQuantity] = useState<number | ''>(product.funding_goal_quantity ?? '');
  const [fundingDeadline, setFundingDeadline] = useState<string>(isoToLocalInput(product.funding_deadline));
  const [paymentDeadline, setPaymentDeadline] = useState<string>(isoToLocalInput(product.payment_deadline)); // ← [2026-07-08] 결제 기한
  const isFunding = isGoods && purchaseType === 'funding';
  const [finalizing, setFinalizing] = useState(false);
  // 마감확정 가능: 펀딩 + 진행중(live) + 마감일 도달
  const canFinalize = isGoods && product.purchase_type === 'funding'
    && (product.funding_status ?? 'live') === 'live'
    && !!product.funding_deadline && new Date(product.funding_deadline).getTime() <= Date.now();
  // ← [2026-07-06] 커스텀 라벨(텍스트+배경/폰트색). 문자열로 보관(빈 문자열=미지정).
  const [label, setLabel] = useState<CustomLabelValue>({
    text: product.label_text ?? '',
    bg: product.label_bg ?? '',
    color: product.label_color ?? '',
  });

  // ── [2026-06-22 → 2026-06-23] 상품 태그(카테고리/브랜드 분리) ──────────────
  const [categoryTags, setCategoryTags] = useState<EsgTagRow[]>([]); // ← #유아용품 #식품
  const [brandTags, setBrandTags] = useState<EsgTagRow[]>([]);       // ← #나이키 #샤넬
  const [initialTagIds, setInitialTagIds] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    getProductTags(product.id)
      .then((rows) => {
        if (!alive) return;
        const { categories, brands } = splitTagsByKind(rows); // ← [2026-06-23] 종류별 분리
        setCategoryTags(categories);
        setBrandTags(brands);
        setInitialTagIds(rows.map((t) => t.id));
      })
      .catch(() => {/* 태그 로드 실패는 조용히(빈 상태로 시작) */});
    return () => { alive = false; };
  }, [product.id]);

  // ← [2026-06-09] 세일 유효성/할인율 미리보기
  const saleActive = salePrice !== '' && salePrice >= 0 && salePrice < price;
  const discountPct = saleActive ? Math.round(((price - (salePrice as number)) / price) * 100) : null;

  // ← [2026-06-17] 고정 8개 도달 && 현재 미고정 → 새 고정 불가(체크박스 비활성)
  const pinFull = typeof pinnedCount === 'number' && pinnedCount >= 8 && !product.is_pinned;

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
      if (shortDescription !== (product.short_description ?? '')) patch.short_description = shortDescription || null; // ← [2026-07-08]
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
      if (isPinned !== product.is_pinned) patch.is_pinned = isPinned;   // ← [2026-06-17] 고정 diff
      if (nextSale !== product.sale_price) patch.sale_price = nextSale;

      // ← [2026-07-06] 커스텀 라벨 diff. 텍스트 없으면 색까지 모두 null(미표시).
      const lt = label.text.trim() || null;
      const lb = lt ? (label.bg.trim() || null) : null;
      const lc = lt ? (label.color.trim() || null) : null;
      if (lt !== (product.label_text ?? null)) patch.label_text = lt;
      if (lb !== (product.label_bg ?? null)) patch.label_bg = lb;
      if (lc !== (product.label_color ?? null)) patch.label_color = lc;

      // ← [2026-07-07] 펀딩 diff(굿즈 전용). normal↔funding 전환 및 목표/마감 변경 반영.
      if (isGoods) {
        const nextPT: 'normal' | 'funding' = isFunding ? 'funding' : 'normal';
        if (nextPT !== (product.purchase_type ?? 'normal')) patch.purchase_type = nextPT;
        if (isFunding) {
          const gt = fundingGoalType;
          const gAmt = gt === 'amount' ? Number(fundingGoalAmount) || null : null;
          const gQty = gt === 'quantity' ? Number(fundingGoalQuantity) || null : null;
          const dlIso = fundingDeadline ? new Date(fundingDeadline).toISOString() : null;
          if (!dlIso) throw new Error('펀딩 마감일을 입력해주세요.');
          if (gt === 'amount' && !(gAmt && gAmt > 0)) throw new Error('목표 금액을 입력해주세요.');
          if (gt === 'quantity' && !(gQty && gQty > 0)) throw new Error('목표 수량을 입력해주세요.');
          if (gt !== product.funding_goal_type) patch.funding_goal_type = gt;
          if (gAmt !== product.funding_goal_amount) patch.funding_goal_amount = gAmt;
          if (gQty !== product.funding_goal_quantity) patch.funding_goal_quantity = gQty;
          if (dlIso !== product.funding_deadline) patch.funding_deadline = dlIso;
          // ← [2026-07-08] 결제 기한(절대 일시). 미입력 허용(폴백). 참여 마감 이후 권장(경고만).
          const pdIso = paymentDeadline ? new Date(paymentDeadline).toISOString() : null;
          if (pdIso && dlIso && new Date(pdIso) <= new Date(dlIso)) {
            throw new Error('결제 기한은 참여 마감일보다 이후여야 합니다.');
          }
          if (pdIso !== product.payment_deadline) patch.payment_deadline = pdIso;
        } else if ((product.purchase_type ?? 'normal') === 'funding') {
          // funding → normal 전환: 펀딩 필드 정리
          patch.funding_goal_type = null; patch.funding_goal_amount = null;
          patch.funding_goal_quantity = null; patch.funding_deadline = null;
          patch.payment_deadline = null; // ← [2026-07-08]
        }
      }

      // ← [2026-06-23] 카테고리+브랜드 합쳐서 변경 감지(정렬 후 비교). RPC는 patch와 별개로 호출.
      const allTags = [...categoryTags, ...brandTags];
      const curTagIds = allTags.map((t) => t.id).sort();
      const tagsChanged = JSON.stringify(curTagIds) !== JSON.stringify([...initialTagIds].sort());

      if (Object.keys(patch).length === 0 && !tagsChanged) {
        onCancel();
        return;
      }

      if (Object.keys(patch).length > 0) {
        await updateProduct(product.id, patch as never);
      }
      if (tagsChanged) {
        await setProductTags(product.id, allTags.map((t) => t.id)); // 원자적 교체(빈 배열=전체 해제)
      }
      onSuccess();
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusy(false);
    }
  };

  // ← [2026-07-07] 펀딩 마감 수동 확정
  const handleFinalize = async () => {
    if (!window.confirm('지금 펀딩을 마감 확정할까요?\n\n목표 달성 시 참여자 주문이 "결제 대기(pending)"로 전환되고, 미달 시 모두 취소됩니다. (되돌릴 수 없음)')) return;
    setFinalizing(true);
    try {
      const res = await finalizeFunding(product.id);
      if (res.already) alert('이미 확정된 펀딩입니다.');
      else alert(res.met ? `🎉 목표 달성! (${res.achieved?.toLocaleString()}/${res.goal?.toLocaleString()}) 참여자 ${res.affected_orders}건이 결제 대기로 전환됐습니다.`
                         : `아쉽게 미달성 (${res.achieved?.toLocaleString()}/${res.goal?.toLocaleString()}). 참여 ${res.affected_orders}건이 취소됐습니다.`);
      onSuccess();
    } catch (e) {
      alert(e instanceof Error ? e.message : '펀딩 확정 실패');
    } finally {
      setFinalizing(false);
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
      {/* ← [2026-07-08] 간단 설명 — 상세 상단(제목/가격 아래) 1~2줄. 마크다운 아님 */}
      <Field label="간단 설명 (상세 상단 노출 · 1~2줄)">
        <textarea
          value={shortDescription}
          onChange={(e) => setShortDescription(e.target.value)}
          disabled={busy}
          rows={2}
          maxLength={120}
          placeholder="상품을 한두 줄로 소개하는 문구 (예: 나무 심는 데 쓰이는 친환경 스티커팩)"
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            type="button"
            onClick={pushDescToNote}
            disabled={busy || pushing}
            title="현재 상품 상세설명 내용을 연결된 검수 메모로 복사합니다."
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid #ddd',
              borderRadius: 6,
              background: '#fff',
              color: busy || pushing ? '#bbb' : '#333',
              cursor: busy || pushing ? 'not-allowed' : 'pointer',
            }}
          >
            {pushing ? '반영 중…' : '📥 검수 메모로 보내기'}
          </button>
        </div>
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

      {/* ← [2026-07-07] 결제 방식 / 펀딩 (굿즈 전용) */}
      {isGoods && (
        <div style={{ marginTop: 12, padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa' }}>
          <Field label="결제 방식">
            <div style={{ display: 'flex', gap: 8 }}>
              {(['normal', 'funding'] as const).map((pt) => (
                <button key={pt} type="button" onClick={() => setPurchaseType(pt)} disabled={busy}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: purchaseType === pt ? '2px solid #111' : '1px solid #ddd',
                    background: purchaseType === pt ? '#111' : '#fff', color: purchaseType === pt ? '#fff' : '#333' }}>
                  {pt === 'normal' ? '일반 결제' : '🎯 Funding (선주문)'}
                </button>
              ))}
            </div>
          </Field>

          {isFunding && (
            <>
              <Field label="목표 기준">
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['quantity', 'amount'] as const).map((gt) => (
                    <button key={gt} type="button" onClick={() => setFundingGoalType(gt)} disabled={busy}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                        border: fundingGoalType === gt ? '2px solid #111' : '1px solid #ddd',
                        background: fundingGoalType === gt ? '#eef2ff' : '#fff', fontWeight: fundingGoalType === gt ? 700 : 400 }}>
                      {gt === 'quantity' ? '목표 수량' : '목표 금액'}
                    </button>
                  ))}
                </div>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {fundingGoalType === 'quantity' ? (
                  <Field label="목표 수량 (개) *">
                    <input type="number" value={fundingGoalQuantity} onChange={(e) => setFundingGoalQuantity(e.target.value === '' ? '' : (Number(e.target.value) || 0))} disabled={busy} step={1} min={1} style={inputStyle} />
                  </Field>
                ) : (
                  <Field label="목표 금액 (원) *">
                    <input type="number" value={fundingGoalAmount} onChange={(e) => setFundingGoalAmount(e.target.value === '' ? '' : (Number(e.target.value) || 0))} disabled={busy} step={10000} min={1} style={inputStyle} />
                  </Field>
                )}
                <Field label="마감일 *">
                  <input type="datetime-local" value={fundingDeadline} onChange={(e) => setFundingDeadline(e.target.value)} disabled={busy} style={inputStyle} />
                </Field>
              </div>
              {/* ← [2026-07-08] 결제 기한(절대 일시) — 성사 후 이 기한까지 입금. 자동취소 없음·미입금 시 일일 안내 메일 */}
              <Field label="결제 기한 (성사 후 입금 마감 · 절대 일시)">
                <input type="datetime-local" value={paymentDeadline} onChange={(e) => setPaymentDeadline(e.target.value)} disabled={busy} style={inputStyle} />
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#888', lineHeight: 1.5 }}>
                  펀딩 성사 시 참여자에게 표시되는 입금 마감일입니다. 참여 마감일 이후로 설정하세요.<br />
                  이 기한이 지나도 <strong>자동 취소되지 않으며</strong>, 입금 확인 전까지 매일 1회 입금 안내 메일이 발송됩니다.
                  미설정 시 기본 정책(order_expire_hours)으로 폴백합니다.
                </p>
              </Field>

              {/* 진행 상태 + 마감확정 */}
              <div style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
                진행 상태: <strong>{product.funding_status ?? 'live'}</strong>
              </div>
              {canFinalize && (
                <button type="button" onClick={handleFinalize} disabled={finalizing}
                  style={{ marginTop: 8, width: '100%', padding: '10px 12px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                    border: 'none', background: finalizing ? '#ccc' : '#7c3aed', color: '#fff', cursor: finalizing ? 'not-allowed' : 'pointer' }}>
                  {finalizing ? '확정 중…' : '⏰ 마감일 도달 — 지금 펀딩 마감 확정'}
                </button>
              )}
              {product.purchase_type === 'funding' && (product.funding_status ?? 'live') === 'live' && !canFinalize && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>마감일 이후 마감확정 버튼이 활성화됩니다. (크론이 5분 간격으로 자동 확정)</div>
              )}
            </>
          )}
        </div>
      )}

      {/* ← [2026-06-23] 태그 — 카테고리 / 브랜드 분리 입력. 사용자 페이지 필터 메뉴로 노출 */}
      <Field label="카테고리 태그 (예: 유아용품, 식품, 저당과자)">
        <TagInput
          value={categoryTags}
          onChange={setCategoryTags}
          disabled={busy}
          kind="category"
          section={product.section} // ← [2026-07-07] 이 상품의 섹션 카테고리만 제안/생성(굿즈=굿즈 카테고리)
          placeholder="카테고리 입력 후 Enter (예: 유아용품, 식품)"
        />
      </Field>
      <Field label="브랜드 태그 (예: 나이키, 샤넬)">
        <TagInput
          value={brandTags}
          onChange={setBrandTags}
          disabled={busy}
          kind="brand"
          section={product.section} // ← [2026-07-07] 섹션 스코프
          placeholder="브랜드 입력 후 Enter (예: 나이키, 샤넬)"
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
        {/* ← [2026-06-17] 상품 고정 — 체크 시 리스트 맨 앞. 순서는 위 '정렬 순서' 숫자로 결정. */}
        <Field label={`상품 고정 (리스트 맨 앞)${typeof pinnedCount === 'number' ? ` · ${pinnedCount}/8` : ''}`}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 36,
              fontSize: 13,
              color: pinFull ? '#aaa' : '#333',
            }}
            title={pinFull ? '고정은 최대 8개입니다. 다른 상품을 해제하세요.' : undefined}
          >
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              disabled={busy || pinFull}                    // ← 8개 찼고 미고정이면 체크 불가
              style={{ width: 16, height: 16 }}
            />
            📌 이 상품을 고정 {pinFull ? '(최대 8개 도달)' : ''}
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

      {/* ← [2026-07-06] 커스텀 라벨 — 리스트/상세 이미지 좌상단 오버레이 배지 */}
      <Field label="커스텀 라벨 (텍스트를 비우면 표시 안 됨)">
        <CustomLabelEditor value={label} onChange={setLabel} disabled={busy} />
      </Field>

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

// ← [2026-07-07] 펀딩 마감일 ISO → datetime-local input 값("YYYY-MM-DDTHH:mm", 로컬시각)
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
