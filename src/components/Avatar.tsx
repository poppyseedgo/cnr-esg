// ============================================================================
// CHANGELOG
//   2026-06-04 (clover)
//     - [변경] 아바타 형태를 원형 → 클로버(canvas) 모양으로 교체 (clover.svg 기준).
//         · 사진: 클로버 path로 clip + cover(잘림 없이 모양에 정확히 채움)
//         · 이니셜/익명: 클로버 배경 위 표시
//         · 공통 컴포넌트라 사용처(카드·댓글·마이페이지·경매) 전체 일관 적용
//   2026-06-04
//     - [수정] 이미지 fit 정확도 개선(이전: <img> display:block 등) — SVG 전환으로 대체.
// ============================================================================

// ============================================================================
// Avatar — 공통 아바타 컴포넌트 (클로버 canvas 형태)
//
// 사용:
//   <Avatar name="고현정" avatarUrl="https://..." size={36} />
//
// 동작:
//   - avatarUrl 있으면 클로버 모양으로 clip 한 사진 표시
//   - 없으면 이름 첫 글자 + 색깔 배경(이름 해시 기반)
//   - 이미지 로드 실패해도 이니셜 fallback
//   - anonymous: 회색 클로버 + 사람 실루엣
// ============================================================================

import { useId, useState } from 'react';

interface AvatarProps {
  name: string | null | undefined;
  avatarUrl?: string | null;
  size?: number;
  /** 본인일 때 강조 테두리(클로버 외곽선) */
  isMe?: boolean;
  /** 익명 모드 — 회색 배경 + 실루엣 */
  anonymous?: boolean;
}

// 클로버(canvas) path — clover.svg 원본 (viewBox 0 0 210 210)
const CLOVER_PATH =
  'M147.5 1C180.913 1 208 28.0868 208 61.5C208 78.8368 200.707 94.4695 189.022 105.5C200.707 116.531 208 132.163 208 149.5C208 182.913 180.913 210 147.5 210C131.186 210 116.381 203.542 105.5 193.044C94.6187 203.542 79.8139 210 63.5 210C30.0868 210 3 182.913 3 149.5C3 132.163 10.2924 116.53 21.9766 105.5C10.2924 94.4695 3 78.8365 3 61.5C3 28.0868 30.0868 1 63.5 1C79.8137 1 94.6187 7.45748 105.5 17.9551C116.381 7.45748 131.186 1 147.5 1Z';

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
  const rawId = useId();
  const clipId = `clv${rawId.replace(/:/g, '')}`; // url(#..) 참조용 — 콜론 제거
  const displayName = name?.trim() || '?';
  const initial = displayName.slice(0, 1);
  const palette = hashColor(displayName);
  const showImage = !anonymous && !!avatarUrl && !imgError;

  const bg = anonymous ? '#e5e7eb' : palette.bg;
  const fg = anonymous ? '#6b7280' : palette.color;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 210 210"
      style={{ display: 'block', flexShrink: 0 }} // flex 내 찌그러짐 방지
      role="img"
      aria-label={anonymous ? '익명' : displayName}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={CLOVER_PATH} />
        </clipPath>
      </defs>

      {showImage ? (
        <>
          {/* 투명 이미지 대비 흰 배경 */}
          <path d={CLOVER_PATH} fill="#fff" />
          {/* 사진을 클로버 모양으로 clip + cover (잘림 없이 모양에 정확히 채움) */}
          <image
            href={avatarUrl ?? undefined}
            x="0"
            y="0"
            width="210"
            height="210"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
            onError={() => setImgError(true)}
          />
        </>
      ) : (
        <>
          <path d={CLOVER_PATH} fill={bg} />
          {anonymous ? (
            // 사람 실루엣 (익명)
            <g fill={fg}>
              <circle cx="105" cy="84" r="33" />
              <path d="M52 170 C52 130 158 130 158 170 Z" />
            </g>
          ) : (
            <text
              x="105"
              y="105"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="96"
              fontWeight={700}
              fill={fg}
              fontFamily="inherit"
            >
              {initial}
            </text>
          )}
        </>
      )}

      {/* 본인 강조 — 클로버 외곽선 */}
      {isMe && <path d={CLOVER_PATH} fill="none" stroke="#0ea5e9" strokeWidth="6" />}
    </svg>
  );
}
