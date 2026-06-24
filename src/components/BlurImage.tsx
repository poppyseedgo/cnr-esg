// ============================================================================
// BlurImage — LQIP(저해상 블러) 플레이스홀더 → 실제 이미지 페이드인
//
// 동작:
//   1) 아주 작은 변환 이미지(width=lqipWidth, 기본 24px)를 블러 처리해 즉시 표시.
//   2) 표시 크기에 맞는 실제 변환 이미지(width)를 lazy 로드 → 로드되면 페이드인.
//   변환 실패 시 onError로 원본 URL 폴백(이미지 깨짐 방지).
//
// [2026-06-24 버그수정·근본] 모바일에서 이미지가 '영원히 블러'로 남던 문제 해결
//   원인: 페이드인을 React onLoad 이벤트에만 의존했음. 작은/캐시된 썸네일은
//         load 이벤트가 onLoad 부착 '전에' 끝나는 경우가 있고(특히 iOS Safari가
//         캐시/소형 이미지를 동기 완료), 그러면 이벤트를 놓쳐 loaded=false 로 고정 →
//         실제 이미지는 깔려있지만 opacity:0, 위의 블러(opacity:1)가 영구히 남음.
//   해결: 이벤트에만 의존하지 않고, ref 로 실제 <img>.complete 를 직접 확인.
//         · DOM 부착 시점(ref 콜백)에 이미 완료면 즉시 loaded.
//         · src(full) 변경 시에도 캐시 완료 여부를 확인해 처리.
//         · onLoad 는 일반 로드 경로로 그대로 유지(이중 안전).
//
// 두 가지 레이아웃 모드:
//   - 기본(fill): 부모가 고정 크기. 실제·블러 모두 absolute로 채움(objectFit:cover).
//   - intrinsic : 실제 이미지를 height:auto로 흐름 배치해 원본 비율 유지.
//
// url 변경 시(예: 갤러리 다음 사진) loaded를 리셋해 매번 블러업이 보이도록 함.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const imgRef = useRef<HTMLImageElement | null>(null);

  const full = thumbUrl(url, width, quality);
  const lqip = thumbUrl(url, lqipWidth, 30);
  const onError = fallbackToOriginal(url);

  // 실제 <img>가 '이미 로드 완료'(캐시/동기 로드)면 즉시 페이드인.
  //  → load 이벤트가 onLoad 부착 전에 끝나도 블러가 영구히 남지 않게 하는 핵심.
  const markIfComplete = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  // ref 콜백: DOM 부착 시점에 완료 여부 즉시 확인(콜백 identity 안정 → 마운트/언마운트 1회).
  const setImgRef = useCallback((img: HTMLImageElement | null) => {
    imgRef.current = img;
    markIfComplete(img);
  }, [markIfComplete]);

  // full(src) 변경 시: 새 src가 이미 캐시 완료면 즉시 표시, 아니면 블러업 재생.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true);
    } else {
      setLoaded(false);
    }
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
    filter: 'blur(8px)',          // 가장자리 비침은 컨테이너 overflow:hidden이 클립 → scale 불필요
    opacity: loaded ? 0 : 1,
    transition: 'opacity 0.3s ease',
  };

  if (intrinsic) {
    // 실제 이미지가 height:auto로 박스 높이를 정의 → 블러는 그 뒤를 채움
    return (
      <div style={{ position: 'relative', width: '100%', overflow: 'hidden', background: '#f2f2f2' }}>
        {lqip && (
          <img
            src={lqip}
            aria-hidden="true"
            alt=""
            style={blurLayer}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        )}
        <img
          ref={setImgRef}
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
      {lqip && (
          <img
            src={lqip}
            aria-hidden="true"
            alt=""
            style={blurLayer}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        )}
      <img
        ref={setImgRef}
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
