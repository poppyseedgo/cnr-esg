// ============================================================================
// BlurImage — LQIP(저해상 블러) 플레이스홀더 → 실제 이미지 페이드인
//
// 동작:
//   1) 아주 작은 변환 이미지(width=lqipWidth, 기본 24px)를 블러 처리해 즉시 표시.
//   2) 표시 크기에 맞는 실제 변환 이미지(width)를 lazy 로드 → onLoad 시 페이드인.
//   변환 실패 시 onError로 원본 URL 폴백(이미지 깨짐 방지).
//
// 두 가지 레이아웃 모드:
//   - 기본(fill): 부모가 고정 크기. 실제·블러 모두 absolute로 채움(objectFit:cover).
//                 예) 게시물 카드 커버(고정 높이 컨테이너).
//   - intrinsic : 실제 이미지를 height:auto로 "흐름에 배치"해 원본 비율 유지.
//                 블러는 그 뒤를 absolute로 채움. 예) 상세 갤러리 대표 이미지(가변 높이).
//
// url 변경 시(예: 갤러리에서 다음 사진) loaded를 리셋해 매번 블러업이 보이도록 함.
// ============================================================================

import { useEffect, useState } from 'react';
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
  /** true면 원본 비율 유지(height:auto, 흐름 배치). 가변 높이 영역용. */
  intrinsic?: boolean;
  alt?: string;
}

export function BlurImage({
  url,
  width,
  lqipWidth = 24,
  quality = 70,
  objectPosition,
  intrinsic = false,
  alt = '',
}: BlurImageProps) {
  const [loaded, setLoaded] = useState(false);

  const full = thumbUrl(url, width, quality);
  const lqip = thumbUrl(url, lqipWidth, 30);
  const onError = fallbackToOriginal(url);

  // url(=full) 변경 시 블러업 재생을 위해 로드 상태 리셋 (갤러리 이미지 전환 대응)
  useEffect(() => {
    setLoaded(false);
  }, [full]);

  // 블러 레이어(공통): 뒤를 채우는 absolute
  const blurLayer: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition,
    display: 'block',
    filter: 'blur(12px)',
    transform: 'scale(1.08)', // 블러 가장자리 비침 방지
    opacity: loaded ? 0 : 1,
    transition: 'opacity 0.3s ease',
  };

  if (intrinsic) {
    // 실제 이미지가 height:auto로 박스 높이를 정의 → 블러는 그 뒤를 채움
    return (
      <div style={{ position: 'relative', width: '100%', overflow: 'hidden', background: '#f2f2f2' }}>
        {lqip && <img src={lqip} aria-hidden="true" alt="" style={blurLayer} />}
        <img
          src={full ?? undefined}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={onError}
          style={{
            position: 'relative', // 흐름에 배치 → 박스 높이 결정
            width: '100%',
            height: 'auto',
            display: 'block',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}
        />
      </div>
    );
  }

  // fill 모드: 부모가 고정 크기. 둘 다 absolute로 채움.
  const fillReal: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition,
    display: 'block',
    opacity: loaded ? 1 : 0,
    transition: 'opacity 0.4s ease',
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#f2f2f2' }}>
      {lqip && <img src={lqip} aria-hidden="true" alt="" style={blurLayer} />}
      <img
        src={full ?? undefined}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={onError}
        style={fillReal}
      />
    </div>
  );
}
