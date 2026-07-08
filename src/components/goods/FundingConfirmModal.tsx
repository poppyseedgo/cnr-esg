// ============================================================================
// FundingConfirmModal — 펀딩 참여 확인 모달 (Figma 2349:315 정밀 반영)
//   [2026-07-08] 취소 버튼 삭제(단일 확인) · 헤딩 2줄 · Portal(뷰포트 중앙 고정).
//   숫자는 전역 .num(Instrument Sans) 클래스 사용.
//   Portal 사유: StickyPanel(translateY) 안에서 렌더되면 position:fixed 가 뷰포트가
//   아니라 패널 기준이 되어 모달이 사이드바 안에서 열림 → document.body 로 이스케이프.
// ============================================================================

import { createPortal } from 'react-dom';

function fmt(n: number) { return n.toLocaleString('ko-KR'); }

export function FundingConfirmModal({
  open, qty, totalAmount, busy, onConfirm, onCancel,
}: {
  open: boolean;
  qty: number;
  totalAmount: number;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div
      role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      {/* 모달 카드: pt24 pb12 px12 gap12 */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', width: '100%', maxWidth: 360, borderRadius: 0, // ← [2026-07-08] border-radius 삭제
          padding: '24px 12px 12px', display: 'flex', flexDirection: 'column',
          gap: 12, alignItems: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        {/* 헤딩 2줄 20 / 서브 14 */}
        <div style={{ fontSize: 20, lineHeight: 1.3, color: '#111', textAlign: 'center' }}>
          <p style={{ margin: 0 }}>나무 심는 굿즈에</p>
          <p style={{ margin: 0 }}>참여해주셔서 감사합니다.</p>
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4, color: '#8e97a8' }}>{/* ← [2026-07-08] 12→14 */}
          지금은 결제 전이에요.
        </p>

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

        {/* 경고 문구 14 / #8e97a8 / 2줄 */}
        <div style={{ width: '100%', fontSize: 14, lineHeight: 1.4, color: '#8e97a8', textAlign: 'center' }}>{/* ← [2026-07-08] 12→14 */}
          <p style={{ margin: 0 }}>프리오더 펀딩은 취소할 수 없어요.</p>
          <p style={{ margin: 0 }}>펀딩 목표 달성 시, 입금 안내를 드립니다.</p>
        </div>

        {/* 버튼: 확인 단일 (pt12, flex1, px16 py12) — Figma 2349:315 취소 삭제 */}
        <div style={{ display: 'flex', alignItems: 'stretch', paddingTop: 12, width: '100%' }}>
          <button
            type="button" onClick={onConfirm} disabled={busy}
            style={{
              flex: '1 0 0', minWidth: 0, padding: '12px 16px', border: '1px solid #00ff2f',
              background: '#46ff68', color: '#000', fontSize: 20, lineHeight: 1.4, // ← [2026-07-08] 버튼 14→20
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
