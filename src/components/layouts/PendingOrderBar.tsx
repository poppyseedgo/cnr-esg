// ============================================================================
// PendingOrderBar.tsx — 결제 대기 주문 상단 알림바
//
// [변경 이력]
//   2026-06-25  최초 작성. 결제대기(바자회) 주문이 있으면 콘텐츠 최상단에 표시.
//
// [설계]
//   - useMyPendingOrders(공유 스토어) + useNowTick(공유 1초틱)으로 가장 이른 만료까지
//     실시간 카운트다운(MM:SS) 표시. 활성(미만료) pending 이 없으면 렌더 안 함(null).
//   - 클릭 시 /mypage/pending 이동.
//   - 만료 통과(now ≥ expires_at)한 주문은 즉시 제외(낙관) → 카운트다운 0 직후 자연 사라짐.
//     (cron/자가치유가 status=expired 로 바꾸면 Realtime 으로도 목록에서 빠짐)
// ============================================================================

import { useNavigate } from 'react-router-dom';
import { useMyPendingOrders } from '@/hooks/useMyPendingOrders';
import { useNowTick } from '@/hooks/useNowTick';
import { formatShortCountdown } from '@/lib/orders';

export function PendingOrderBar() {
  const { expiries } = useMyPendingOrders();
  const nowMs = useNowTick();
  const navigate = useNavigate();

  // 활성(미만료) 만료시각만 → 가장 이른 것(가장 급한 건)의 남은 시간
  const activeMs = expiries
    .map((e) => new Date(e).getTime())
    .filter((ms) => Number.isFinite(ms) && ms > nowMs);

  if (activeMs.length === 0) return null; // 결제대기 없음 → 표시 안 함

  const soonest = Math.min(...activeMs);
  const leftMs = soonest - nowMs;
  const count = activeMs.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate('/mypage/pending')}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/mypage/pending'); }}
      style={{
        margin: '0 -20px',            // app-main 의 좌우 패딩(20px) 탈출 → 콘텐츠 폭 풀블리드
        position: 'sticky',
        top: 0,
        zIndex: 30,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: '12px 20px',
        background: '#FCE8EC',         // 연분홍
        color: '#B4374E',             // 로즈
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        borderBottom: '1px solid #F6D0D8',
      }}
    >
      <span>
        결제 대기 중인 주문이 있습니다{count > 1 ? ` (${count}건)` : ''}
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
        ⏰ {formatShortCountdown(leftMs)}
      </span>
      <span style={{ fontWeight: 700 }}>
        클릭하면 My Account 이동 →
      </span>
    </div>
  );
}
