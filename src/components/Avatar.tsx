// ============================================================================
// CHANGELOG
//   2026-06-04 (g)
//     - [변경] 프로필 사진 있는 아바타는 원형(circle)으로. 무사진(이니셜/익명)은 클로버 유지.
//   2026-06-04 (f)
//     - [수정] 사진 아바타 외곽선 색상 #111 → #AEB5C4 (연한 회청색).
//   2026-06-04 (e)
//     - [수정] 사진 아바타 외곽선 1px → 0.5px (상단 노치가 두껍게 보이던 문제 완화).
//   2026-06-04 (d)
//     - [수정] 이니셜 글자 두께 700 → 400.
//   2026-06-04 (c)
//     - [변경] 무사진 아바타 색상을 브랜드 그린 3종(logover1/2/3) 랜덤(이름 해시)으로 교체.
//     - [제거] 파란 isMe 강조 테두리(잘림·이질감) 제거. isMe prop은 호환 위해 유지(무동작).
//     - [수정] viewBox 패딩(-6) 추가 → 테두리 잘림 방지.
//     - [추가] 사진 아바타에 #111 1px 외곽선(non-scaling) → 클로버 경계 명확화.
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
  /** (호환용·무동작) 과거 본인 강조 테두리 — 제거됨 */
  isMe?: boolean;
  /** 익명 모드 — 회색 배경 + 실루엣 */
  anonymous?: boolean;
  /** 사진 확대 배율 (기본 1.2 — 증명사진 여백 줄이고 인물 부각) */
  zoom?: number;
  /** 세로 초점 0~1 (기본 0.32 — 작을수록 얼굴/상단을 부각) */
  focusY?: number;
}

// 클로버(canvas) path — clover.svg 원본 (viewBox 0 0 210 210)
const CLOVER_PATH =
  'M147.5 1C180.913 1 208 28.0868 208 61.5C208 78.8368 200.707 94.4695 189.022 105.5C200.707 116.531 208 132.163 208 149.5C208 182.913 180.913 210 147.5 210C131.186 210 116.381 203.542 105.5 193.044C94.6187 203.542 79.8139 210 63.5 210C30.0868 210 3 182.913 3 149.5C3 132.163 10.2924 116.53 21.9766 105.5C10.2924 94.4695 3 78.8365 3 61.5C3 28.0868 30.0868 1 63.5 1C79.8137 1 94.6187 7.45748 105.5 17.9551C116.381 7.45748 131.186 1 147.5 1Z';

// 이름 해시 → 브랜드 그린 3종 (logover1/2/3). 사용자별 항상 동일.
const COLORS = [
  { bg: '#99F65D', color: '#14532D' }, // logover1 라이트 라임 → 진녹 글자
  { bg: '#048859', color: '#FFFFFF' }, // logover2 딥그린 → 흰 글자
  { bg: '#69F59F', color: '#0B5132' }, // logover3 민트 → 진녹 글자
];

function hashColor(name: string): { bg: string; color: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function Avatar({
  name,
  avatarUrl,
  size = 36,
  anonymous = false,
  zoom = 1.2,
  focusY = 0.32,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const rawId = useId();
  const clipId = `clv${rawId.replace(/:/g, '')}`; // url(#..) 참조용 — 콜론 제거
  const displayName = name?.trim() || '?';
  const initial = displayName.slice(0, 1);
  const palette = hashColor(displayName);
  const showImage = !anonymous && !!avatarUrl && !imgError;

  const bg = anonymous ? '#e5e7eb' : palette.bg;
  const fg = anonymous ? '#6b7280' : palette.color;

  // 사진 확대 + 얼굴(상단) 부각: 초점(가로 중앙, 세로 focusY) 기준으로 scale
  // clip은 래퍼 <g>에 두고 이미지에만 transform → 클로버 모양은 그대로, 사진만 확대
  const fx = 105;
  const fy = 210 * focusY;
  const imageTransform = `translate(${fx} ${fy}) scale(${zoom}) translate(${-fx} ${-fy})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="-6 -6 222 222"
      style={{ display: 'block', flexShrink: 0 }} // flex 내 찌그러짐 방지
      role="img"
      aria-label={anonymous ? '익명' : displayName}
    >
      <defs>
        {/* 사진 아바타용 원형 clip (무사진은 클로버 path 직접 사용) */}
        <clipPath id={clipId}>
          <circle cx="105" cy="105" r="104" />
        </clipPath>
      </defs>

      {showImage ? (
        // 프로필 사진 있는 경우: 원형. clip은 래퍼 <g>, 이미지에만 확대 transform
        <>
          <g clipPath={`url(#${clipId})`}>
            {/* 투명 이미지 대비 흰 배경 */}
            <circle cx="105" cy="105" r="104" fill="#fff" />
            {/* 사진: cover + 얼굴 부각 확대 */}
            <image
              href={avatarUrl ?? undefined}
              x="0"
              y="0"
              width="210"
              height="210"
              preserveAspectRatio="xMidYMid slice"
              transform={imageTransform}
              onError={() => setImgError(true)}
            />
          </g>
          {/* 경계 명확화 — #AEB5C4 0.5px (크기 무관) */}
          <circle
            cx="105"
            cy="105"
            r="104"
            fill="none"
            stroke="#AEB5C4"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
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
              fontWeight={400}
              fill={fg}
              fontFamily="inherit"
            >
              {initial}
            </text>
          )}
        </>
      )}
    </svg>
  );
}
