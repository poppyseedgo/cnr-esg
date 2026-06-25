// ============================================================================
// PendingOrderBar.tsx — 결제 대기 주문 상단 알림바
//
// [변경 이력]
//   2026-06-25  최초 작성. 결제대기(바자회) 주문이 있으면 콘텐츠 최상단에 표시.
//   2026-06-25  [개선] 카운트다운 제거(맥락상 불필요) · 문구 "N건" · 클릭 액션만(문구 제거)
//               · 스타일 지정값 적용. 라이브 반영은 onOrdersChanged 즉시 신호로 보장
//               (pendingOrders 스토어가 주문 생성 직후 reload → 새로고침 불필요).
//
// [설계]
//   - useMyPendingOrders(공유 스토어) 로 결제대기 주문 목록을 구독.
//   - useNowTick(공유 1초틱)은 "만료 지난 건 제외" 필터에만 사용(표시는 안 함) →
//     N건 카운트 정확 + 만료 순간 자동 사라짐.
//   - 활성(미만료) 결제대기가 0건이면 렌더 안 함(null). 클릭 시 /mypage/pending 이동.
// ============================================================================

import { useNavigate } from 'react-router-dom';
import { useMyPendingOrders } from '@/hooks/useMyPendingOrders';
import { useNowTick } from '@/hooks/useNowTick';

export function PendingOrderBar() {
  const { expiries } = useMyPendingOrders();
  const nowMs = useNowTick();
  const navigate = useNavigate();

  // 활성(미만료) 결제대기 건수 — 만료 지난 건은 제외(자연 사라짐)
  const count = expiries.filter((e) => {
    const ms = new Date(e).getTime();
    return Number.isFinite(ms) && ms > nowMs;
  }).length;

  if (count === 0) return null; // 결제대기 없음 → 표시 안 함

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate('/mypage/pending')}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/mypage/pending'); }}
      style={{
        margin: '0 -20px',
        position: 'sticky',
        top: 0,
        zIndex: 30,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: '8px 16px',
        background: 'rgb(255 239 242)',
        color: 'rgb(212 39 70)',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        borderBottom: 0,
      }}
    >
      <span>결제 대기 중인 주문이 {count}건 있습니다</span>
    </div>
  );
}
