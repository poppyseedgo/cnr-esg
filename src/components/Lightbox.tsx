// ============================================================================
// Lightbox — 범용 이미지 확대 뷰어
//
// 기능:
//   - 전체화면 오버레이로 이미지 원본 비율 전체 표시(object-fit: contain)
//   - 여러 장: 좌우 화살표 + 카운터(n / N) + 키보드 ← →
//   - 닫기: ✕ 버튼 / 배경(dim) 클릭 / ESC
//   - 열려 있는 동안 body 스크롤 잠금
//
// 사용:
//   {lightboxIdx !== null && (
//     <Lightbox images={urls} index={lightboxIdx} onClose={() => setLightboxIdx(null)} />
//   )}
//
// 변경 이력:
//   2026-06-22  최초 작성 — 검수 사진 등 이미지 확대(긴급 요구)
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface LightboxProps {
  images: string[];
  index: number;       // 시작 인덱스
  onClose: () => void;
}

export function Lightbox({ images, index, onClose }: LightboxProps) {
  const [cur, setCur] = useState(index);

  // 열 때 전달된 index로 동기화
  useEffect(() => setCur(index), [index]);

  const count = images.length;
  const go = useCallback(
    (delta: number) => setCur((c) => (c + delta + count) % count), // 순환 이동
    [count]
  );

  // 키보드: ESC 닫기, ← → 이동
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && count > 1) go(-1);
      else if (e.key === 'ArrowRight' && count > 1) go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, go, count]);

  // body 스크롤 잠금
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (count === 0) return null;
  const safeCur = Math.min(Math.max(cur, 0), count - 1); // 인덱스 방어

  return createPortal(
    <div
      onClick={onClose}  // 배경 클릭 닫기
      role="dialog"
      aria-modal="true"
      aria-label="이미지 확대 보기"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* 닫기 ✕ */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="닫기"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 20,
          lineHeight: 1,
        }}
      >
        ✕
      </button>

      {/* 카운터 */}
      {count > 1 && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            background: 'rgba(0,0,0,0.4)',
            padding: '4px 12px',
            borderRadius: 999,
          }}
        >
          {safeCur + 1} / {count}
        </div>
      )}

      {/* 이전 */}
      {count > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); go(-1); }}
          aria-label="이전 이미지"
          style={navBtnStyle('left')}
        >
          ‹
        </button>
      )}

      {/* 이미지 (클릭해도 안 닫히게 stopPropagation) */}
      <img
        src={images[safeCur]}
        alt={`확대 이미지 ${safeCur + 1}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          borderRadius: 4,
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        }}
      />

      {/* 다음 */}
      {count > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); go(1); }}
          aria-label="다음 이미지"
          style={navBtnStyle('right')}
        >
          ›
        </button>
      )}
    </div>,
    document.body
  );
}

function navBtnStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    [side]: 16,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontSize: 30,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}
