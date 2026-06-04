// ============================================================================
// CHANGELOG
//   2026-06-04
//     - [수정] 이미지 fit 정확도 개선: <img>에 display:block (inline baseline
//         갭 제거 → 이미지가 원 안에서 줄어 보이던 현상 해결), width/height 100%,
//         object-fit:cover (정사각 프로필 사진 기준 잘림 없이 정확히 채움).
//     - [수정] flex 레이아웃에서 찌그러짐 방지: flexShrink 0 + min-w/h = size 고정.
// ============================================================================

// ============================================================================
// Avatar — 공통 아바타 컴포넌트
//
// 사용:
//   <Avatar name="고현정" avatarUrl="https://..." size={36} />
//
// 동작:
//   - avatarUrl 있으면 이미지 표시
//   - 없으면 이름 첫 글자 + 색깔 배경 (이름 해시 기반)
//   - 이미지 로드 실패해도 이니셜 fallback
// ============================================================================

import { useState } from 'react';

interface AvatarProps {
  name: string | null | undefined;
  avatarUrl?: string | null;
  size?: number;
  /** 본인일 때 강조 테두리 */
  isMe?: boolean;
  /** 익명 모드 — 회색 배경 + 마스크 아이콘 */
  anonymous?: boolean;
}

// 이름 해시 → 색깔 (일관성 + 다양성)
const COLORS = [
  { bg: '#dbeafe', color: '#1e40af' }, // blue
  { bg: '#dcfce7', color: '#166534' }, // green
  { bg: '#fef3c7', color: '#92400e' }, // amber
  { bg: '#fce7f3', color: '#9d174d' }, // pink
  { bg: '#ede9fe', color: '#6b21a8' }, // purple
  { bg: '#cffafe', color: '#155e75' }, // cyan
  { bg: '#fed7aa', color: '#9a3412' }, // orange
];

function hashColor(name: string): { bg: string; color: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function Avatar({ name, avatarUrl, size = 36, isMe = false, anonymous = false }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const displayName = name?.trim() || '?';
  const initial = displayName.slice(0, 1);
  const palette = hashColor(displayName);
  const showImage = !anonymous && !!avatarUrl && !imgError;

  // 익명 모드: 회색 배경 + 마스크 아이콘
  if (anonymous) {
    return (
      <div
        style={{
          width: size,
          height: size,
          minWidth: size,   // ← [추가] flex 내 축소 방지
          minHeight: size,  // ← [추가]
          borderRadius: '50%',
          background: '#e5e7eb',
          color: '#6b7280',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.max(13, Math.floor(size * 0.5)),
          lineHeight: 1,    // ← [추가]
          flexShrink: 0,
          boxSizing: 'border-box',  // ← [추가]
          boxShadow: isMe ? '0 0 0 2px #0ea5e9' : undefined,
        }}
        aria-label="익명 입찰자"
      >
        🕶
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        minWidth: size,   // ← [추가] flex 내 가로 축소 방지
        minHeight: size,  // ← [추가] flex 내 세로 축소 방지
        borderRadius: '50%',
        background: showImage ? '#fff' : palette.bg,
        color: palette.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(11, Math.floor(size * 0.4)),
        fontWeight: 700,
        lineHeight: 1,    // ← [추가] 이니셜 baseline 갭 제거
        flexShrink: 0,
        overflow: 'hidden',
        boxSizing: 'border-box',  // ← [추가] isMe 테두리가 크기에 영향 주지 않도록
        boxShadow: isMe ? '0 0 0 2px #0ea5e9' : undefined,
      }}
      aria-label={displayName}
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt={displayName}
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',  // 정사각 프로필 사진 → 잘림 없이 원에 정확히 채움
            display: 'block',    // ← [수정] inline 이미지 baseline 갭 제거 (줄어 보이던 현상 해결)
          }}
        />
      ) : (
        initial
      )}
    </div>
  );
}
