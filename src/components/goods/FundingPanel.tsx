// ============================================================================
// FundingPanel — 굿즈 펀딩 상세 참여 영역
//
// 상태별:
//   live + 마감 전  → 진행률 + 마감 카운트다운 + 수량 + "펀딩 참여하기"(create_funding_pledge)
//   live + 마감 후  → "마감 집계 중"(크론/관리자 확정 대기)
//   succeeded       → "🎉 목표 달성! 결제 안내는 마이페이지에서"
//   failed          → "무산(미달성)"
//
// 참여=예약(pledged). 결제는 마감 달성 후 마이페이지 주문(입금 대기)에서 계좌이체.
//
// [2026-07-07] 신규 — 굿즈 Funding Phase 3b.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadFundingProgress, createFundingPledge } from '@/lib/orders';
import { getDisplayPrice } from '@/lib/products';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { signInWithMicrosoft } from '@/lib/auth';
import type { EsgProductRow } from '@/types/esg';

type Progress = NonNullable<Awaited<ReturnType<typeof loadFundingProgress>>>;

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

function fmtLeft(ms: number): string {
  if (ms <= 0) return '마감';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${d}일 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function FundingPanel({ product }: { product: EsgProductRow }) {
  const { currentUser } = useCurrentUser();
  const [prog, setProg] = useState<Progress | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const reload = () => { loadFundingProgress(product.id).then(setProg).catch(() => {/* noop */}); };
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
  const isCounting = status === 'live' && timeLeft <= 0; // 마감됐지만 확정 전

  const participate = async () => {
    if (!currentUser) { void signInWithMicrosoft(); return; }
    setBusy(true);
    try {
      const res = await createFundingPledge(product.id, qty);
      alert(`펀딩 참여 완료! (${res.quantity}개 · ${won(res.total_amount)})\n\n목표 달성 시 마이페이지에서 입금 안내를 드립니다. (지금은 결제 전이에요)`);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '펀딩 참여에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 진행률 */}
      <div style={{ padding: 16, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#7c3aed' }}>{pct}%</span>
          <span style={{ fontSize: 13, color: '#6b21a8' }}>
            목표 {goalType === 'amount' ? won(goal) : `${goal.toLocaleString()}개`}
          </span>
        </div>
        {/* 바 */}
        <div style={{ height: 10, background: '#ede9fe', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#a855f7,#7c3aed)', transition: 'width .4s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, color: '#555' }}>
          <span>
            현재 <strong style={{ color: '#111' }}>{goalType === 'amount' ? won(achieved) : `${achieved.toLocaleString()}개`}</strong>
          </span>
          <span>👥 {prog?.backers ?? 0}명 참여</span>
        </div>
      </div>

      {/* 상태/카운트다운 */}
      {isOpen && (
        <div style={{ textAlign: 'center', padding: '10px 12px', background: '#111', color: '#fff', borderRadius: 10 }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>펀딩 마감까지</div>
          <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtLeft(timeLeft)}</div>
        </div>
      )}
      {isCounting && (
        <div style={{ padding: 12, background: '#fef3c7', color: '#92400e', borderRadius: 10, fontSize: 13, textAlign: 'center' }}>
          마감되어 결과를 집계 중입니다. 잠시 후 목표 달성 여부가 반영됩니다.
        </div>
      )}
      {status === 'succeeded' && (
        <div style={{ padding: 14, background: '#dcfce7', color: '#166534', borderRadius: 10, fontSize: 13 }}>
          🎉 <strong>목표 달성!</strong> 펀딩이 성사되었습니다. 결제(입금) 안내는{' '}
          <Link to="/mypage" style={{ color: '#166534', fontWeight: 700, textDecoration: 'underline' }}>마이페이지 &gt; 주문</Link>
          에서 확인해 각자 계좌이체로 결제해 주세요.
        </div>
      )}
      {status === 'failed' && (
        <div style={{ padding: 14, background: '#fee2e2', color: '#991b1b', borderRadius: 10, fontSize: 13 }}>
          아쉽게 목표에 도달하지 못해 <strong>무산</strong>되었습니다. 참여 건은 자동 취소되며 결제되지 않습니다.
        </div>
      )}

      {/* 참여(수량 + 버튼) — 진행 중일 때만 */}
      {isOpen && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 13, color: '#666' }}>수량:</label>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #ddd', borderRadius: 6 }}>
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} style={qtyBtn(qty <= 1)} aria-label="수량 감소">−</button>
              <span style={{ minWidth: 40, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))} disabled={qty >= 99} style={qtyBtn(qty >= 99)} aria-label="수량 증가">+</button>
            </div>
            <span style={{ fontSize: 12, color: '#888' }}>예상 결제액 {won(unit * qty)}</span>
          </div>
          <button
            type="button"
            onClick={participate}
            disabled={busy}
            style={{
              width: '100%', padding: '14px 16px', border: 'none', borderRadius: 10,
              background: busy ? '#c4b5fd' : '#7c3aed', color: '#fff', fontSize: 15, fontWeight: 800,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? '참여 중…' : currentUser ? '🎯 펀딩 참여하기 (지금은 결제 전)' : '로그인하고 참여하기'}
          </button>
          <p style={{ margin: 0, fontSize: 11, color: '#999', textAlign: 'center' }}>
            참여 시점엔 결제되지 않아요. 마감일까지 목표를 달성하면 참여자에게 입금 안내가 갑니다. (All-or-Nothing)
          </p>
        </>
      )}
    </div>
  );
}

function qtyBtn(disabled: boolean): React.CSSProperties {
  return { width: 32, height: 32, border: 'none', background: '#fff', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 18 };
}
