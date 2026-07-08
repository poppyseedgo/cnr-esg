// ============================================================================
// FundingSidebar — 굿즈 펀딩 상세 '구매 사이드바' (Figma 2320:55 정밀 반영)
//
// [2026-07-08] 신규. 기존 FundingPanel 의 데이터 로직(loadFundingProgress /
//   createFundingPledge / 카운트다운)을 재사용하되, Figma 디자인대로 라벨~CTA
//   전체를 이 컴포넌트가 담당한다. 펀딩 상품일 때 BazaarProductPage 우측 컬럼이
//   이 컴포넌트만 렌더(바자회 공용 헤더/재고/수량/버튼은 렌더 안 함).
//
// [타이포] 숫자 = Instrument Sans, 그 외 = Pretendard.
//   숫자+한글 혼합(카운트다운·"현재 33개")은 폰트 스택으로 숫자는 Instrument,
//   한글은 Pretendard fallback 되게 처리.
//
// [Phase 2 예정] 라벨 카테고리 체계(현재 배지2는 label_text 로 바인딩),
//   상태별(집계중/성사/무산) 디자인 정교화.
// ============================================================================

import { useEffect, useState } from 'react';
import { loadFundingProgress, createFundingPledge } from '@/lib/orders';
import { getDisplayPrice } from '@/lib/products';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { signInWithMicrosoft } from '@/lib/auth';
import type { EsgProductRow } from '@/types/esg';

type Progress = NonNullable<Awaited<ReturnType<typeof loadFundingProgress>>>;

// 숫자 폰트 스택: 숫자는 Instrument Sans, 한글은 Pretendard fallback
const NUM = "'Instrument Sans', 'Pretendard Variable', 'Pretendard', sans-serif";
const C = { text: '#111', muted: '#8e97a8', info: '#96a0b3', line: '#e5e5e5', accent: '#0cff39' };

const won = (n: number) => n.toLocaleString('ko-KR');

// 카운트다운: Figma 포맷 "34시간:20분:01초" (총 시간 기준)
function fmtCountdown(ms: number): string {
  if (ms <= 0) return '마감';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}시간:${String(m).padStart(2, '0')}분:${String(sec).padStart(2, '0')}초`;
}

// 마감일: "7월 13일 월요일 오후 12시" (KST)
function fmtDeadline(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long', hour: 'numeric', hour12: true,
  }).format(d);
  return parts.replace(/\.\s*$/, ''); // 뒤 마침표 제거
}

export function FundingSidebar({ product }: { product: EsgProductRow }) {
  const { currentUser } = useCurrentUser();
  const [prog, setProg] = useState<Progress | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const reload = () => { loadFundingProgress(product.id).then(setProg).catch(() => {}); };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [product.id]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const unit = getDisplayPrice(product);
  const goalType = product.funding_goal_type ?? 'quantity';
  const goal = goalType === 'amount' ? (product.funding_goal_amount ?? 0) : (product.funding_goal_quantity ?? 0);
  const achieved = prog ? (goalType === 'amount' ? prog.pledged_amount : prog.pledged_quantity) : 0;
  const pct = goal > 0 ? Math.min(100, Math.round((achieved / goal) * 100)) : 0;
  const status = prog?.funding_status ?? product.funding_status ?? 'live';
  const deadlineMs = product.funding_deadline ? new Date(product.funding_deadline).getTime() : 0;
  const timeLeft = deadlineMs - now;
  const isOpen = status === 'live' && timeLeft > 0;

  const participate = async () => {
    if (!currentUser) { void signInWithMicrosoft(); return; }
    setBusy(true);
    try {
      const res = await createFundingPledge(product.id, qty);
      alert(`펀딩 참여 완료! (${res.quantity}개 · ${won(res.total_amount)}원)\n\n목표 달성 시 참여자에게 입금 안내가 갑니다. (지금은 결제 전이에요)`);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '펀딩 참여에 실패했습니다.');
    } finally { setBusy(false); }
  };

  const Divider = () => <div style={{ width: '100%', height: 1, background: C.line }} />;

  const goalLabel = goalType === 'amount' ? `${won(goal)}원` : `${won(goal)}개`;
  const achievedLabel = goalType === 'amount' ? `${won(achieved)}원` : `${won(achieved)}개`;

  return (
    <div style={{
      background: '#fff', display: 'flex', flexDirection: 'column', gap: 24,
      padding: '24px 24px 80px', alignItems: 'flex-start',
    }}>
      {/* 1) 라벨: Pre-Order(black) + 커스텀 라벨(green) ── Phase 2: 카테고리 체계 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <span style={badgeStyle('#000', '#fff')}>Pre-Order</span>
        {product.label_text && product.label_text.trim() && (
          <span style={badgeStyle(product.label_bg || '#a6ff6d', product.label_color || '#000')}>
            {product.label_text}
          </span>
        )}
      </div>

      {/* 2) 제목 (풀, 줄임 없음) */}
      <p style={{ margin: 0, width: '100%', fontSize: 30, lineHeight: 1.2, color: C.text, wordBreak: 'break-word' }}>
        {product.name}
      </p>

      {/* 3) 가격 */}
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', lineHeight: 1.2, color: C.text }}>
        <span style={{ fontFamily: NUM, fontSize: 28 }}>{won(unit)}</span>
        <span style={{ fontSize: 28, fontWeight: 300 }}>원</span>
      </div>

      {/* 4) 간단 설명 (short_description) — 없으면 미표시 */}
      {product.short_description && product.short_description.trim() && (
        <p style={{ margin: 0, width: '100%', fontSize: 20, lineHeight: 1.2, color: C.text, wordBreak: 'break-word' }}>
          {product.short_description}
        </p>
      )}

      <Divider />

      {/* 5) 달성률 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 14, lineHeight: 1.2, color: C.text }}>달성률</span>
        <span style={{ fontFamily: NUM, fontSize: 24, lineHeight: 1.2, color: C.text }}>{pct}%</span>
        {/* 진행바: 검정 트랙 + 초록 글로우 채움(진행률 폭) */}
        <div style={{ position: 'relative', width: '100%', height: 32, background: '#000', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: 0, width: `${pct}%`,
            background: `linear-gradient(to right, ${C.accent} 0%, ${C.accent} 60%, rgba(12,255,57,0) 100%)`,
            transition: 'width .4s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontFamily: NUM, fontSize: 14, lineHeight: 1.2, color: C.text }}>
          <span>현재 {achievedLabel}</span>
          <span>목표 {goalLabel}</span>
        </div>
      </div>

      <Divider />

      {/* 6) 마감까지 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', lineHeight: 1.2 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, color: C.text, width: '100%' }}>
          <span style={{ fontSize: 14 }}>마감까지</span>
          <span style={{ fontFamily: NUM, fontSize: 24, letterSpacing: 0.72 }}>
            {isOpen ? fmtCountdown(timeLeft) : status === 'live' ? '마감 집계 중' : status === 'succeeded' ? '목표 달성' : '무산'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, fontSize: 14, width: '100%' }}>
          <span style={{ color: C.text }}>{fmtDeadline(product.funding_deadline)}</span>
          <span style={{ color: C.muted }}>마감</span>
        </div>
      </div>

      <Divider />

      {/* 7) 수량 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ fontSize: 14, lineHeight: 1.2, color: C.text }}>수량</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StepBtn kind="minus" disabled={!isOpen || qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 40 }}>
            <span style={{ fontFamily: NUM, fontSize: 32, lineHeight: 1.2, color: C.text }}>{qty}</span>
          </div>
          <StepBtn kind="plus" disabled={!isOpen || qty >= 99} onClick={() => setQty((q) => Math.min(99, q + 1))} />
        </div>
      </div>

      {/* 8) 결제액 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', lineHeight: 1.2, color: C.text }}>
        <span style={{ fontSize: 14 }}>결제액</span>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <span style={{ fontFamily: NUM, fontSize: 32 }}>{won(unit * qty)}</span>
          <span style={{ fontSize: 30, fontWeight: 300 }}>원</span>
        </div>
      </div>

      {/* 9) 안내 문구 */}
      <div style={{ width: '100%', fontSize: 14, lineHeight: 1.4, color: C.info }}>
        <p style={{ margin: 0 }}>참여 시점에는 결제되지 않아요.</p>
        <p style={{ margin: 0 }}>펀딩에 참여하시면 취소가 불가능하니 신중하게 참여해주세요.</p>
        <p style={{ margin: 0 }}>목표를 달성하면 참여자에게 입금 안내를 드립니다.</p>
      </div>

      {/* 10) CTA */}
      <button
        type="button"
        onClick={participate}
        disabled={!isOpen || busy}
        style={{
          width: '100%', padding: '20px 16px', border: '1px solid #000', background: '#000',
          color: '#fff', fontSize: 20, lineHeight: 1.4, cursor: !isOpen || busy ? 'not-allowed' : 'pointer',
          opacity: !isOpen || busy ? 0.55 : 1,
        }}
      >
        {busy ? '참여 중…' : !currentUser && isOpen ? '로그인하고 참여하기' : isOpen ? '펀딩 참여하기' : status === 'succeeded' ? '펀딩 종료 (목표 달성)' : status === 'failed' ? '펀딩 종료 (무산)' : '마감 집계 중'}
      </button>
    </div>
  );
}

// 라벨 배지 — px8 py4, 14px, leading 1.3, capitalize
function badgeStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg, border: `1px solid ${bg}`, color,
    padding: '4px 8px', fontSize: 14, lineHeight: 1.3, textTransform: 'capitalize',
    whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
}

// 수량 스텝 버튼 — 32px, 인라인 SVG(minus/plus)
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
