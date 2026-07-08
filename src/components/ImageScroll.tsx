// ============================================================================
// ImageScroll — 상세 이미지 세로 스크롤 스택 (경매/굿즈 공용)
//   [2026-07-08] 경매 상세의 로컬 ImageScroll 을 공용 컴포넌트로 추출.
//   썸네일 + 상세이미지를 원본 비율(intrinsic)로 세로 스택. 화질 1440/82.
//   placeholder: 이미지 없을 때 아이콘(경매 🔨 / 굿즈 🎁 등).
// ============================================================================

import { BlurImage } from './BlurImage';

export function ImageScroll({ images, placeholder = '🖼️' }: { images: string[]; placeholder?: string }) {
  if (images.length === 0) {
    return (
      <div
        style={{
          aspectRatio: '1 / 1',
          background: 'linear-gradient(135deg, #fef3c7, #fed7aa)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 64, opacity: 0.4,
        }}
      >
        {placeholder}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#fff' }}>
      {images.map((url, i) => (
        <BlurImage key={i} url={url} width={1440} quality={82} intrinsic alt={`이미지 ${i + 1}`} />
      ))}
    </div>
  );
}
