// ============================================================================
// CHANGELOG
//   2026-06-11
//     - [신규] ImageFocusEditor — 썸네일 크롭 기준점(focal point) 조정 모달.
//         배경: 상세 썸네일이 object-fit:cover + 중앙 고정이라 세로/가로 사진의
//           끝이 잘림. 프로필 사진 크롭처럼 "보여줄 영역"을 사용자가 지정.
//         방식(WYSIWYG): 정사각 뷰포트 = 실제 썸네일 결과. 이미지를 드래그하면
//           object-position(focus_x/focus_y, 0~100%)이 바뀜. 크롭이 일어나는 축에
//           맞춰 상/중/하(세로) 또는 좌/중/우(가로) 프리셋 제공.
//         · 드래그 매핑: 자연 크기→cover 오버플로 계산 → 픽셀 이동을 % 로 정확 환산.
//         · 잘리지 않는 축(오버플로 0)은 드래그/프리셋이 동작하지 않음(정상).
//         · 포인터 이벤트(마우스+터치 공용) + setPointerCapture.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ImageFocusEditorProps {
  /** 미리보기 이미지 src (blob: 또는 https:) */
  src: string;
  /** 초기 기준점 (0~100) */
  initialX: number;
  initialY: number;
  onCancel: () => void;
  onSave: (focusX: number, focusY: number) => void;
}

const SIZE = 288; // 정사각 뷰포트 한 변(px) — 실제 썸네일 결과와 동일 비율

const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

export function ImageFocusEditor({ src, initialX, initialY, onCancel, onSave }: ImageFocusEditorProps) {
  const [x, setX] = useState(clamp(initialX)); // focus_x (0~100)
  const [y, setY] = useState(clamp(initialY)); // focus_y (0~100)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null); // 자연 크기

  // cover 오버플로(잘리는 양, px) — 자연 크기 기준으로 계산
  const scale = nat ? Math.max(SIZE / nat.w, SIZE / nat.h) : 1;
  const overflowX = nat ? Math.max(0, nat.w * scale - SIZE) : 0; // 가로로 잘리는 양
  const overflowY = nat ? Math.max(0, nat.h * scale - SIZE) : 0; // 세로로 잘리는 양
  const canX = overflowX > 0.5; // 가로 크롭 존재(가로 사진)
  const canY = overflowY > 0.5; // 세로 크롭 존재(세로 사진)

  // 드래그 상태(ref로 관리 — 리렌더 불필요)
  const drag = useRef<{ px: number; py: number; sx: number; sy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canX && !canY) return;                 // 정사각 → 조정 불가
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, sx: x, sy: y }; // 시작점 + 시작 focus
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.px; // 이동 픽셀
    const dy = e.clientY - drag.current.py;
    // 이미지를 오른쪽으로 끌면 왼쪽이 보임 → focus 감소 (오버플로로 정확 환산)
    if (canX) setX(clamp(drag.current.sx - (dx / overflowX) * 100));
    if (canY) setY(clamp(drag.current.sy - (dy / overflowY) * 100));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  // ESC 닫기
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onCancel]);

  // 프리셋: 잘리는 축에 맞춰 노출 (세로 크롭 우선)
  const presets = canY
    ? [{ label: '상단', v: 0 }, { label: '중앙', v: 50 }, { label: '하단', v: 100 }]
    : canX
    ? [{ label: '좌측', v: 0 }, { label: '중앙', v: 50 }, { label: '우측', v: 100 }]
    : [];
  const applyPreset = (v: number) => (canY ? setY(v) : setX(v));
  const activePreset = canY ? y : x;

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        zIndex: 1100, // ← 작성/수정 모달(1000)보다 위
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: 20,
          width: '100%',
          maxWidth: 360,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div style={{ alignSelf: 'flex-start', fontSize: 15, fontWeight: 600, color: '#111' }}>
          커버 썸네일 위치 조정
        </div>
        <p style={{ alignSelf: 'flex-start', margin: 0, fontSize: 12, color: '#888', lineHeight: 1.5 }}>
          {canX || canY
            ? '목록 카드 커버에 보일 부분을 드래그로 맞춰주세요.'
            : '정사각형 이미지라 잘리지 않습니다.'}
        </p>

        {/* 정사각 뷰포트 = 실제 썸네일 결과(WYSIWYG) */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            width: SIZE,
            height: SIZE,
            maxWidth: '100%',
            borderRadius: 16,
            overflow: 'hidden',
            background: '#f2f2f2',
            position: 'relative',
            cursor: canX || canY ? 'grab' : 'default',
            touchAction: 'none', // 터치 드래그 시 스크롤 방지
            userSelect: 'none',
          }}
        >
          <img
            src={src}
            alt="썸네일 미리보기"
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              setNat({ w: el.naturalWidth, h: el.naturalHeight }); // 자연 크기 확보
            }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: `${x}% ${y}%`, // ← 드래그 결과 그대로 반영
              display: 'block',
              pointerEvents: 'none', // 드래그는 컨테이너가 받음
            }}
          />
        </div>

        {/* 크롭축 프리셋 */}
        {presets.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignSelf: 'stretch' }}>
            {presets.map((p) => {
              const active = activePreset === p.v;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.v)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 10,
                    border: active ? '1px solid #111' : '1px solid #e5e7eb',
                    background: active ? '#111' : '#fff',
                    color: active ? '#fff' : '#444',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}

        {/* 취소 / 적용 */}
        <div style={{ display: 'flex', gap: 8, alignSelf: 'stretch', marginTop: 2 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              border: '1px solid #ddd',
              background: '#fff',
              color: '#444',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onSave(x, y)}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              border: 'none',
              background: '#1a1a1a',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            적용
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
