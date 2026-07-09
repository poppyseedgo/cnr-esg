// ============================================================================
// GoodsNormalSidebar — 굿즈 '일반 구매' 상세 사이드바 (FundingSidebar 플랫 스타일 반영)
//
// [2026-07-09] 신규. 펀딩 사이드바(FundingSidebar, Figma 2320:55)의 플랫 스타일
//   (둥근모서리·컬러박스 없음 / 큰 타이포 / 헤어라인 구분선 / 검정 CTA)을 그대로
//   일반 구매(purchase_type='normal')에 적용. 굿즈 비펀딩 경로에서만 렌더한다.
//   · FundingSidebar 는 무손상(별도 컴포넌트, 프리미티브만 동일 스펙으로 재현).
//   · 구매 로직(수량/장바구니/바로구매/재고·입금대기 상태)은 BazaarProductPage 가
//     보유 → 이 컴포넌트는 props 로 받아 그리기만 하는 프레젠테이션 컴포넌트.
//   · CTA: 단일 'Cart'(전폭, 검정) — 담고 /cart(담긴 상품 페이지)로 이동. 바로구매 없음. // ← [2026-07-09]
//
// [타이포] 숫자 = Instrument Sans, 그 외 = Pretendard (FundingSidebar 와 동일 스택).
// ============================================================================

import { Link } from 'react-router-dom';
import { getDisplayPrice, isNewProduct } from '@/lib/products';
import type { EsgProductRow } from '@/types/esg';

// FundingSidebar 와 동일 스펙(플랫 스타일 재현) — 숫자 폰트 스택 / 색 토큰
const NUM = "'Instrument Sans', 'Pretendard Variable', 'Pretendard', sans-serif";
const C = { text: '#111', muted: '#8e97a8', info: '#96a0b3', line: '#e5e5e5' };

const won = (n: number) => n.toLocaleString('ko-KR');

interface GoodsNormalSidebarProps {
  product: EsgProductRow;
  quantity: number;
  onQtyChange: (q: number) => void; // 부모 setQuantity
  available: number;
  soldOut: boolean;
  paymentPending: boolean;
  canPurchase: boolean;
  blockReason: string | null;       // 굿즈는 null(상시), 하위호환 위해 수신
  actionLoading: boolean;
  actionMessage: { type: 'success' | 'error'; text: string } | null;
  onCart: () => void; // ← [2026-07-09] 장바구니에 담고 /cart 로 이동
}

export function GoodsNormalSidebar({
  product,
  quantity,
  onQtyChange,
  available,
  soldOut,
  paymentPending,
  canPurchase,
  blockReason,
  actionLoading,
  actionMessage,
  onCart,
}: GoodsNormalSidebarProps) {
  const unit = getDisplayPrice(product);
  const onSale = product.sale_price != null && product.sale_price < product.price;
  const discountPct = onSale ? Math.round(((product.price - unit) / product.price) * 100) : 0;

  // 라벨 배지: 새 제품 + 커스텀 라벨(라벨1 + extra_labels)
  const chips = [
    { text: product.label_text, bg: product.label_bg, color: product.label_color },
    ...(product.extra_labels ?? []),
  ].filter((l) => (l.text ?? '').trim().length > 0);

  const Divider = () => <div style={{ width: '100%', height: 1, background: C.line }} />;

  return (
    <div style={{
      background: '#fff', display: 'flex', flexDirection: 'column', gap: 24,
      padding: '24px 24px 80px', alignItems: 'flex-start',
    }}>
      {/* 1) 라벨 배지 */}
      {(isNewProduct(product) || chips.length > 0) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {isNewProduct(product) && <span style={badgeStyle('#fff', '#000', true)}>새 제품</span>}
          {chips.map((l, i) => (
            <span key={i} style={badgeStyle((l.bg ?? '').trim() || '#a6ff6d', (l.color ?? '').trim() || '#000')}>
              {l.text}
            </span>
          ))}
        </div>
      )}

      {/* 2) 제목 */}
      <p style={{ margin: 0, width: '100%', fontSize: 30, lineHeight: 1.2, color: C.text, wordBreak: 'break-word' }}>
        {product.name}
      </p>

      {/* 3) 가격 (세일이면 원가 취소선 + 할인%) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {onSale && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', lineHeight: 1.2 }}>
            <span style={{ fontFamily: NUM, fontSize: 16, color: C.muted, textDecoration: 'line-through' }}>{won(product.price)}원</span>
            <span style={{ fontFamily: NUM, fontSize: 16, color: '#ff5959' }}>{discountPct}%</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 2, alignItems: 'baseline', lineHeight: 1.2, color: C.text }}>
          <span style={{ fontFamily: NUM, fontSize: 28 }}>{won(unit)}</span>
          <span style={{ fontSize: 28, fontWeight: 300 }}>원</span>
        </div>
      </div>

      {/* 4) 간단 설명 — 없으면 미표시. 엔터/문단 줄바꿈 + Pretendard 400 // ← [2026-07-09] */}
      {product.short_description && product.short_description.trim() && (
        <p style={{ margin: 0, width: '100%', fontSize: 20, lineHeight: 1.3, color: C.text, wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontFamily: "'Pretendard Variable', 'Pretendard', system-ui, sans-serif", fontWeight: 400 }}>{/* ← [2026-07-09] pre-wrap(엔터/문단) + Pretendard 400 */}
          {product.short_description}
        </p>
      )}

      {/* 구매 가능 시: 수량 / 결제액 (재고 섹션 삭제 — [2026-07-09]) */}
      {canPurchase && (
        <>
          <Divider />

          {/* 수량 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span style={{ fontSize: 14, lineHeight: 1.2, color: C.text }}>수량</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StepBtn kind="minus" disabled={quantity <= 1} onClick={() => onQtyChange(Math.max(1, quantity - 1))} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 40 }}>
                <span style={{ fontFamily: NUM, fontSize: 32, lineHeight: 1.2, color: C.text }}>{quantity}</span>
              </div>
              <StepBtn kind="plus" disabled={quantity >= available} onClick={() => onQtyChange(Math.min(available, quantity + 1))} />
            </div>
          </div>

          {/* 결제액 */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', width: '100%', lineHeight: 1.2, color: C.text }}>
            <span style={{ fontSize: 14 }}>결제액</span>
            <div style={{ display: 'flex', gap: 2, alignItems: 'baseline' }}>
              <span style={{ fontFamily: NUM, fontSize: 32 }}>{won(unit * quantity)}</span>
              <span style={{ fontSize: 30, fontWeight: 300 }}>원</span>
            </div>
          </div>
        </>
      )}

      {/* 액션 메시지(성공/실패) */}
      {actionMessage && (
        <div style={{
          width: '100%', fontSize: 14, lineHeight: 1.4,
          color: actionMessage.type === 'success' ? '#0f7b3f' : '#c0392b',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <span>{actionMessage.text}</span>
          {actionMessage.type === 'success' && (
            <Link to="/cart" style={{ color: 'inherit', textDecoration: 'underline', whiteSpace: 'nowrap' }}>장바구니 보기 →</Link>
          )}
        </div>
      )}

      {/* CTA — 단일 'Cart': 담고 /cart(담긴 상품 페이지)로 이동. 바로구매 삭제 — [2026-07-09] */}
      {canPurchase ? (
        <button
          type="button"
          onClick={onCart}
          disabled={actionLoading}
          style={{
            width: '100%', padding: '20px 16px', border: '1px solid #000', borderRadius: 0, // ← [2026-07-09] 라운드 제거
            background: '#000', color: '#fff', fontSize: 20, lineHeight: 1.4,
            cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.55 : 1,
          }}
        >
          Cart
        </button>
      ) : (
        // 구매 불가(품절/입금대기/차단) — 플랫 안내 박스
        <div style={{
          width: '100%', padding: '20px 16px', border: `1px solid ${C.line}`, borderRadius: 0, // ← [2026-07-09] 라운드 제거
          background: '#fafafa', color: C.muted, fontSize: 16, lineHeight: 1.4, textAlign: 'center',
        }}>
          {soldOut ? '품절된 상품입니다' : paymentPending ? '다른 분이 입금 대기 중입니다' : blockReason ?? '지금은 구매할 수 없습니다'}
        </div>
      )}
    </div>
  );
}

// 라벨 배지 — px8 py4, 14px (FundingSidebar badgeStyle 동일 스펙). outline=흰 배경+검정 테두리.
function badgeStyle(bg: string, color: string, outline = false): React.CSSProperties {
  return {
    background: bg, border: `1px solid ${outline ? '#000' : bg}`, color,
    padding: '4px 8px', fontSize: 14, lineHeight: 1.3,
    whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
}

// 수량 스텝 버튼 — 32px, 인라인 SVG(minus/plus) (FundingSidebar StepBtn 동일 스펙)
function StepBtn({ kind, disabled, onClick }: { kind: 'minus' | 'plus'; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-label={kind === 'minus' ? '수량 감소' : '수량 증가'}
      style={{
        width: 32, height: 32, padding: 0, border: 'none', background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.3 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="8" y1="16" x2="24" y2="16" stroke="#111" strokeWidth="2" strokeLinecap="round" />
        {kind === 'plus' && <line x1="16" y1="8" x2="16" y2="24" stroke="#111" strokeWidth="2" strokeLinecap="round" />}
      </svg>
    </button>
  );
}
