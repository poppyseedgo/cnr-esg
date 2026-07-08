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
import { createPortal } from 'react-dom'; // ← [2026-07-08] 모달/오버레이 뷰포트 이스케이프
import { useNavigate } from 'react-router-dom'; // ← [2026-07-08] 성사 후 마이페이지 이동
import { loadFundingProgress, createFundingPledge, loadMyFundingPledgeCount } from '@/lib/orders';
import { subscribeProducts } from '@/lib/products'; // ← [2026-07-08] 관리자 편집/확정 실시간 반영
import { getDisplayPrice } from '@/lib/products';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { signInWithMicrosoft } from '@/lib/auth';
import { FundingConfirmModal } from '@/components/goods/FundingConfirmModal'; // ← [2026-07-08] 참여 확인 모달
import { burstConfetti } from '@/lib/confetti'; // ← [2026-07-08] 성공 컨페티
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
  const navigate = useNavigate(); // ← [2026-07-08]
  const [prog, setProg] = useState<Progress | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [confirmOpen, setConfirmOpen] = useState(false); // ← [2026-07-08] 참여 확인 모달
  const [success, setSuccess] = useState(false);         // ← [2026-07-08] 성공 오버레이

  const reload = () => { loadFundingProgress(product.id).then(setProg).catch(() => {}); };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [product.id]);

  // ← [2026-07-08] 내 참여 횟수(1회 이상 시 제목 위 문구) — 로그인·상품 변경·참여 후 갱신
  const [myCount, setMyCount] = useState(0);
  const loadMyCount = () => {
    if (!currentUser) { setMyCount(0); return; }
    loadMyFundingPledgeCount(product.id).then(setMyCount).catch(() => {});
  };
  useEffect(() => { loadMyCount(); /* eslint-disable-next-line */ }, [product.id, currentUser]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const unit = getDisplayPrice(product);
  const goalType = product.funding_goal_type ?? 'quantity';
  const goal = goalType === 'amount' ? (product.funding_goal_amount ?? 0) : (product.funding_goal_quantity ?? 0);
  const achieved = prog ? (goalType === 'amount' ? prog.pledged_amount : prog.pledged_quantity) : 0;
  const pct = goal > 0 ? Math.round((achieved / goal) * 100) : 0; // ← [2026-07-08] 100% 초과 표기(예: 170%)
  const barPct = Math.min(100, pct); // 진행바 채움은 100%까지
  const status = prog?.funding_status ?? product.funding_status ?? 'live';
  const deadlineMs = product.funding_deadline ? new Date(product.funding_deadline).getTime() : 0;
  const timeLeft = deadlineMs - now;
  const isOpen = status === 'live' && timeLeft > 0;

  // ← [2026-07-08] 실시간 반영:
  //   (1) esg_products 구독 — 관리자 편집(가격/목표/마감/썸네일)·확정(funding_status) 즉시 반영
  //   (2) 진행 중(live)·집계 중 동안 폴링 — 타 사용자 참여로 달성률 변동 + 확정 감지
  useEffect(() => {
    const off = subscribeProducts(() => { loadFundingProgress(product.id).then(setProg).catch(() => {}); });
    return off;
  }, [product.id]);
  useEffect(() => {
    if (status !== 'live') return; // 종료(succeeded/failed)면 폴링 불필요
    const t = setInterval(() => { loadFundingProgress(product.id).then(setProg).catch(() => {}); }, 10000);
    return () => clearInterval(t);
  }, [status, product.id]);

  // "펀딩 참여하기" 클릭 → 확인 모달 (비로그인은 로그인 유도)
  const openConfirm = () => {
    if (!currentUser) { void signInWithMicrosoft(); return; }
    setConfirmOpen(true);
  };

  // 모달 '확인' → 참여 처리 → 성공 연출(컨페티 + 오버레이) → 수량 초기화 + 달성률 갱신
  const doPledge = async () => {
    setBusy(true);
    try {
      await createFundingPledge(product.id, qty);
      setConfirmOpen(false);
      setBusy(false);
      burstConfetti();                 // 전체화면 컨페티
      setSuccess(true);                // "펀딩 참여 성공!" 오버레이
      setQty(1);                       // 수량 초기화
      reload();                        // 달성률 즉시 갱신
      loadMyCount();                   // ← [2026-07-08] 내 참여 횟수 갱신(문구)
      window.setTimeout(() => setSuccess(false), 2800); // 자동 소멸(링크 클릭 여유)
    } catch (e) {
      setBusy(false);
      alert(e instanceof Error ? e.message : '펀딩 참여에 실패했습니다.');
    }
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

      {/* ← [2026-07-08] 1회 이상 참여 시 문구 (Figma 2341:208) — 초록 #0fe654 + 회색 #ccd3df, SemiBold 13 */}
      {myCount >= 1 && (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.2, fontWeight: 600 }}>
          <span style={{ color: '#0fe654' }}>{myCount}회 참여한 펀딩입니다. </span>
          <span style={{ color: '#ccd3df' }}>중복 참여도 가능해요.</span>
        </p>
      )}

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
            position: 'absolute', inset: 0, width: `${barPct}%`,
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
            {isOpen ? fmtCountdown(timeLeft)
              : status === 'succeeded' ? '🎉 펀딩 성공'
              : status === 'failed' ? '펀딩 무산'
              : '마감 집계 중'}
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

      {/* 10) CTA — 상태별 플로우
            진행중        : 펀딩 참여하기 / 로그인하고 참여하기 (참여 가능)
            집계 중        : 마감 집계 중… (비활성, 확정 대기)
            성사(succeeded): 🎉 펀딩 성공 — 마이페이지에서 입금하기 (클릭 시 이동)
            무산(failed)   : 펀딩 종료 (무산) (비활성) */}
      {(() => {
        const succeeded = status === 'succeeded';
        const clickable = !busy && (isOpen || succeeded);
        const label = busy ? '참여 중…'
          : succeeded ? '🎉 펀딩 성공 — 마이페이지에서 입금하기'
          : status === 'failed' ? '펀딩 종료 (무산)'
          : isOpen ? (currentUser ? '펀딩 참여하기' : '로그인하고 참여하기')
          : '마감 집계 중…';
        return (
          <button
            type="button"
            onClick={() => { if (succeeded) { navigate('/mypage'); } else if (isOpen) { openConfirm(); } }}
            disabled={!clickable}
            style={{
              width: '100%', padding: '20px 16px', border: '1px solid #000',
              background: succeeded ? '#0f7b3f' : '#000', // 성사 시 초록 강조
              color: '#fff', fontSize: 20, lineHeight: 1.4,
              cursor: clickable ? 'pointer' : 'not-allowed',
              opacity: clickable ? 1 : 0.55,
            }}
          >
            {label}
          </button>
        );
      })()}

      {/* 참여 확인 모달 (Figma 2341:126) */}
      <FundingConfirmModal
        open={confirmOpen}
        qty={qty}
        totalAmount={unit * qty}
        busy={busy}
        onConfirm={doPledge}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* 성공 오버레이 — Portal(뷰포트 중앙) + 컨페티, 후 자동 소멸 */}
      {success && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 1101, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', pointerEvents: 'auto', animation: 'cnrSuccessPop 0.35s cubic-bezier(0.2,1.3,0.4,1) both' }}>
            <div style={{ fontSize: 72, lineHeight: 1 }}>🎉</div>
            <div style={{ marginTop: 14, fontSize: 34, fontWeight: 400, color: '#46FF68' }}>{/* ← [2026-07-08] 'Thank you' + confetti 색(#46FF68) */}
              Thank you
            </div>
            {/* ← [2026-07-08] (A) 페이지 유지 + 마이페이지 바로가기 */}
            <button
              type="button"
              onClick={() => navigate('/mypage')}
              style={{
                marginTop: 16, padding: '8px 16px', border: 'none', background: 'rgba(15,123,63,0.1)',
                color: '#0f7b3f', fontSize: 14, fontWeight: 600, borderRadius: 999, cursor: 'pointer',
              }}
            >
              마이페이지에서 확인 →
            </button>
          </div>
        </div>,
        document.body,
      )}
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
