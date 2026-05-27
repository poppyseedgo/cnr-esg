// ============================================================================
// Footer — 하단 정보
// ============================================================================

import { useEventPhase } from '@/hooks/useEventPhase';

const phaseLabels: Record<string, string> = {
  prelude: '이벤트 준비 중',
  shop_open: '진행 중',
  shop_closed: '구매·경매 종료 (결과 공개)',
  archived: '이벤트 종료',
};

export function Footer() {
  const { phase } = useEventPhase();

  return (
    <footer
      style={{
        borderTop: '1px solid #eee',
        padding: '24px 20px',
        marginTop: 64,
        background: '#fafafa',
        color: '#888',
        fontSize: 12,
      }}
    >
      <div
        style={{
          maxWidth: 1360,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          textAlign: 'center',
        }}
      >
        <div>
          <strong style={{ color: '#444' }}>C&R 29주년 ESG 이벤트</strong>
          <span style={{ margin: '0 8px' }}>·</span>
          2026. 06. 30 — 07. 10
          <span style={{ margin: '0 8px' }}>·</span>
          <span style={{ color: '#0ea5e9' }}>{phaseLabels[phase] ?? phase}</span>
        </div>
        <div>굿즈 판매 수익금은 전부 생명의 숲에 기부됩니다.</div>
        <div style={{ color: '#bbb' }}>© C&R Research</div>
      </div>
    </footer>
  );
}
