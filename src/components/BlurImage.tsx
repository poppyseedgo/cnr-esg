// ============================================================================
// BlurImage — LQIP(저해상 블러) 플레이스홀더 → 실제 이미지 페이드인
//
// 동작:
//   1) 아주 작은 변환 이미지(width=lqipWidth, 기본 24px)를 블러 처리해 즉시 표시.
//   2) 표시 크기에 맞는 실제 변환 이미지(width)를 lazy 로드 → onLoad 시 페이드인.
//   변환 실패 시 onError로 원본 URL 폴백(이미지 깨짐 방지).
//
// 사용처: 게시물 카드 커버(목록 체감 로딩 개선).
// ============================================================================

import { useState } from 'react';
import { thumbUrl, fallbackToOriginal } from '@/lib/imageUrl';

interface BlurImageProps {
  /** 저장된 원본 public 이미지 URL */
  url: string | null | undefined;
  /** 실제 표시용 변환 가로 px (레티나 고려 표시폭의 ~1.5~2배) */
  width: number;
  /** LQIP(블러) 가로 px. 기본 24 */
  lqipWidth?: number;
  /** 실제 이미지 품질 0~100. 기본 70 */
  quality?: number;
  /** object-position (커버 크롭 기준점). 예: '50% 30%' */
  objectPosition?: string;
  alt?: string;
}

export function BlurImage({
  url,
  width,
  lqipWidth = 24,
  quality = 70,
  objectPosition,
  alt = '',
}: BlurImageProps) {
  const [loaded, setLoaded] = useState(false);

  const full = thumbUrl(url, width, quality);
  const lqip = thumbUrl(url, lqipWidth, 30);
  const onError = fallbackToOriginal(url);

  const layer: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition,
    display: 'block',
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#f2f2f2' }}>
      {/* LQIP 블러 레이어 — 실제 이미지 로드되면 사라짐 */}
      {lqip && (
        <img
          src={lqip}
          aria-hidden="true"
          alt=""
          style={{
            ...layer,
            filter: 'blur(12px)',
            transform: 'scale(1.08)', // 블러 가장자리 비침 방지
            opacity: loaded ? 0 : 1,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}
      {/* 실제 이미지 — 로드되면 페이드인 */}
      <img
        src={full ?? undefined}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={onError}
        style={{
          ...layer,
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}
      />
    </div>
  );
}
