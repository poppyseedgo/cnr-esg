// ============================================================================
// PendingOrderBar.tsx — 결제 대기 주문 상단 알림바
//
// [변경 이력]
//   2026-06-25  최초 작성.
//   2026-06-25  [개선] 카운트다운 제거 · 문구 "N건" · 클릭 액션만 · 스타일 지정값.
//   2026-06-25  [버그수정] 만료/완료 반영을 스토어로 일원화 → useNowTick 제거.
//     getPendingExpiries 가 "활성(미만료)분"만 반환하므로(스토어가 타이머로 재평가),
//     여기선 그 개수만 표시. 바·dot 이 동일 데이터 → 만료/완료 시 둘 다 동시에 사라짐.
//
// [설계]
//   - useMyPendingOrders(공유 스토어) 의 활성 결제대기 개수만 표시. 0건이면 렌더 안 함.
//   - 클릭 시 /mypage/pending 이동.
// ============================================================================

import { useNavigate } from 'react-router-dom';
import { useMyPendingOrders } from '@/hooks/useMyPendingOrders';

export function PendingOrderBar() {
  const { expiries } = useMyPendingOrders(); // 스토어가 이미 "활성(미만료)분"만 제공
  const navigate = useNavigate();

  const count = expiries.length;
  if (count === 0) return null; // 결제대기 없음 → 표시 안 함

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate('/mypage/pending')}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/mypage/pending'); }}
      style={{
        // ← [2026-06-29] sticky/풀블리드는 AppLayout sticky 스택 래퍼가 담당(바자회 공지바와 겹침 방지)
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
