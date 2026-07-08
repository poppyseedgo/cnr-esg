// ============================================================================
// FundingConfirmModal — 펀딩 참여 확인 모달 (Figma 2349:315 정밀 반영)
//   [2026-07-08] 나무 SVG · 순서(아이콘→헤딩→요약→안내) · 버튼 16 · border-radius 0
//   [2026-07-08] (심각) 배경(dimmed) 클릭으로 닫히지 않음 — '확인' 액션 외 절대 안 닫힘.
//   Portal 사유: StickyPanel(translateY) 안에서 position:fixed 가 패널 기준이 되는 문제
//   → document.body 로 이스케이프해 뷰포트 전체 중앙 커버.
//   숫자는 전역 .num(Instrument Sans) 클래스 사용.
// ============================================================================

import { createPortal } from 'react-dom';

function fmt(n: number) { return n.toLocaleString('ko-KR'); }

export function FundingConfirmModal({
  open, qty, totalAmount, busy, onConfirm,
}: {
  open: boolean;
  qty: number;
  totalAmount: number;
  busy: boolean;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return createPortal(
    // 배경: 클릭해도 닫히지 않음(onClick 없음) — 확인 버튼만 모달을 닫는다.
    <div
      role="dialog" aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      {/* 모달 카드: pt24 pb12 px12 gap12 · 직각(radius 0) */}
      <div
        style={{
          background: '#fff', width: '100%', maxWidth: 360, borderRadius: 0,
          padding: '24px 12px 12px', display: 'flex', flexDirection: 'column',
          gap: 12, alignItems: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        {/* 나무 아이콘 (Figma 2354:333, 41×49) — 초록 원 + 검정 기둥 */}
        <svg width="41" height="49" viewBox="0 0 42 49" fill="none" aria-hidden style={{ display: 'block', flexShrink: 0 }}>
          <circle cx="21" cy="21" r="21" fill="#8FFF73" />
          <rect x="18" y="21" width="6" height="28" fill="#111" />
        </svg>

        {/* 헤딩 2줄 20 */}
        <div style={{ fontSize: 20, lineHeight: 1.3, color: '#111', textAlign: 'center' }}>
          <p style={{ margin: 0 }}>나무 심는 굿즈에</p>
          <p style={{ margin: 0 }}>참여해주셔서 감사합니다.</p>
        </div>

        {/* 요약: 2개 * 14,000원 (py8, gap4) — 24px, 개/원 Regular */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center', padding: '8px 0', width: '100%' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1.2, color: '#111', fontSize: 24 }}>
            <span className="num">{fmt(qty)}</span>
            <span>개</span>
          </span>
          {/* 구분자 * (Figma vector 10px) */}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden style={{ display: 'block', flexShrink: 0 }}>
            <g stroke="#111" strokeWidth="1.2" strokeLinecap="round">
              <line x1="5" y1="1.6" x2="5" y2="8.4" />
              <line x1="2" y1="3.3" x2="8" y2="6.7" />
              <line x1="8" y1="3.3" x2="2" y2="6.7" />
            </g>
          </svg>
          <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1.2, color: '#111', fontSize: 24 }}>
            <span className="num">{fmt(totalAmount)}</span>
            <span>원</span>
          </span>
        </div>

        {/* 안내 문구 14 / #8e97a8 / 2줄 */}
        <div style={{ width: '100%', fontSize: 14, lineHeight: 1.4, color: '#8e97a8', textAlign: 'center' }}>
          <p style={{ margin: 0 }}>지금은 결제 전이에요.</p>
          <p style={{ margin: 0 }}>펀딩 목표 달성 시, 입금 안내를 드립니다.</p>
        </div>

        {/* 버튼: 확인 단일 16px (pt12, flex1, px16 py12) */}
        <div style={{ display: 'flex', alignItems: 'stretch', paddingTop: 12, width: '100%' }}>
          <button
            type="button" onClick={onConfirm} disabled={busy}
            style={{
              flex: '1 0 0', minWidth: 0, padding: '12px 16px', border: '1px solid #00ff2f',
              background: '#46ff68', color: '#000', fontSize: 16, lineHeight: 1.4,
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? '참여 중…' : '확인'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
