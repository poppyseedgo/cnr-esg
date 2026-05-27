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
          borderRadius: '50%',
          background: '#e5e7eb',
          color: '#6b7280',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.max(13, Math.floor(size * 0.5)),
          flexShrink: 0,
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
        borderRadius: '50%',
        background: showImage ? '#fff' : palette.bg,
        color: palette.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(11, Math.floor(size * 0.4)),
        fontWeight: 700,
        flexShrink: 0,
        overflow: 'hidden',
        boxShadow: isMe ? '0 0 0 2px #0ea5e9' : undefined,
      }}
      aria-label={displayName}
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt={displayName}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initial
      )}
    </div>
  );
}
