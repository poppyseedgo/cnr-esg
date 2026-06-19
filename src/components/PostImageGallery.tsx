// ============================================================================
// CHANGELOG
//   2026-06-11
//     - [신규] PostImageGallery — 게시글 상세 이미지 갤러리 공통 컴포넌트.
//         배경(근본원인): 상세 모달/페이지가 업로드 이미지를 aspect-ratio 4/3 +
//           object-fit:cover로 강제 크롭 → 원본 위아래가 잘려 컴플레인 발생.
//         해결: 대표 이미지는 원본 비율(height:auto)로 표시(크롭 제거)하고,
//           여러 장일 때만 우측에 70×70 고정 썸네일 열을 제공(클릭 전환).
//         모달(PostDetailModal)과 전체보기(PostDetailPage)가 동일 컴포넌트를
//           공유하여 어느 경로로 보든 크롭 없이 일관되게 노출되도록 통일.
//         Figma SSOT: node 903:501 ("조회 모달_이미지 있을 때 760" > 갤러리 영역)
//           · row: flex / gap 10 / align-items flex-start / padding-bottom 20
//           · 대표: flex 1 / min-width 0 / radius 20 / 원본비율(width 100% height auto)
//           · 카운터 pill: rgba(0,0,0,.6) / pad 2·10 / radius 999 / 11px #fff (여러 장만)
//           · 썸네일 열: flex-col / gap 8 / shrink 0 (여러 장만)
//           · 썸네일: 70×70 강제 / radius 16 / object-fit cover
//         활성 썸네일 식별: Figma는 1px 흰 테두리(실사진 위에선 거의 안 보임) →
//           실사용 가독성 위해 2px #111 테두리로 구현(비활성은 투명 2px로 사이즈 동일 유지).
// ============================================================================

import { useEffect, useMemo, useState } from 'react'; // ← idx 상태/정렬 메모/리셋 effect
import { thumbUrl, fallbackToOriginal } from '@/lib/imageUrl'; // ← [2026-06-18] 썸네일 변환

interface PostImageGalleryProps {
  /** esg_posts_with_images.images (id/url/sort_order) */
  images: Array<{ id: string; url: string; sort_order: number }>; // ← 상세 뷰 이미지 배열
}

export function PostImageGallery({ images }: PostImageGalleryProps) {
  // sort_order 오름차순으로 결정적 정렬 — 뷰 반환 순서에 의존하지 않도록 방어 ← [추가]
  const sorted = useMemo(
    () => [...images].sort((a, b) => a.sort_order - b.sort_order), // ← 결정적 순서 보장
    [images],
  );
  const sig = sorted.map((i) => i.id).join('|'); // ← 이미지 셋 식별자(값 비교용)
  const [idx, setIdx] = useState(0);             // ← 현재 대표로 표시 중인 인덱스

  // 게시글/이미지 셋이 바뀌면 첫 장으로 리셋 (idx 범위 초과 방지) ← [추가]
  useEffect(() => {
    setIdx(0); // ← 이미지 셋 변경 시 1장으로
  }, [sig]);

  if (sorted.length === 0) return null;                 // ← 이미지 없으면 렌더 안 함

  const safeIdx = Math.min(idx, sorted.length - 1);     // ← 경계 보정(리셋 전 순간 방지)
  const hasMultiple = sorted.length > 1;                // ← 썸네일/카운터 노출 조건

  return (
    <div
      style={{
        display: 'flex',          // ← Figma: 가로 배치(대표 | 썸네일)
        gap: 10,                  // ← Figma gap-[10px]
        alignItems: 'flex-start', // ← Figma items-start (상단 정렬)
        paddingBottom: 20,        // ← Figma pb-[20px]
      }}
    >
      {/* 대표 이미지 — 원본 비율 유지(크롭 금지) */}
      <div
        style={{
          flex: '1 1 0',          // ← Figma flex-[1_0_0] (남는 폭을 채움)
          minWidth: 0,            // ← Figma min-w-px (shrink 허용 → 썸네일 폭 보장)
          position: 'relative',   // ← 카운터 pill 기준
          borderRadius: 20,       // ← Figma rounded-[20px]
          overflow: 'hidden',     // ← 둥근 모서리로 이미지 클립
          background: '#f2f2f2',  // ← Figma bg-[#f2f2f2] (로딩 placeholder)
        }}
      >
        <img
          src={thumbUrl(sorted[safeIdx].url, 1080, 78) ?? undefined} // ← [2026-06-18] 상세 표시폭에 맞춘 변환
          onError={fallbackToOriginal(sorted[safeIdx].url)}
          loading="lazy"
          decoding="async"
          alt={`이미지 ${safeIdx + 1}`}
          style={{
            width: '100%',        // ← 폭은 컨테이너 가득
            height: 'auto',       // ← [핵심] 원본 비율 유지(4/3 강제 크롭 제거)
            display: 'block',     // ← 하단 inline 여백 제거
          }}
        />

        {/* 위치 카운터 — 여러 장일 때만 */}
        {hasMultiple && (
          <div
            style={{
              position: 'absolute',
              bottom: 16,                     // ← 하단 여백
              left: '50%',
              transform: 'translateX(-50%)',  // ← 가로 중앙
              background: 'rgba(0,0,0,0.6)',  // ← Figma bg rgba(0,0,0,.6)
              color: '#fff',
              padding: '2px 10px',            // ← Figma px-[10px] py-[2px]
              borderRadius: 999,              // ← Figma rounded-[999px]
              fontSize: 11,                   // ← Figma 11px
              lineHeight: 1.5,                // ← Figma leading-[1.5]
              fontWeight: 400,                // ← Figma Regular
              whiteSpace: 'nowrap',
            }}
          >
            {safeIdx + 1} / {sorted.length}
          </div>
        )}
      </div>

      {/* 썸네일 열 — 여러 장일 때만 / 사이즈 강제 70×70 */}
      {hasMultiple && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',  // ← Figma flex-col
            gap: 8,                   // ← Figma gap-[8px]
            alignItems: 'flex-start',
            flexShrink: 0,            // ← 고정 폭(70) 유지(대표가 줄어듦)
          }}
        >
          {sorted.map((img, i) => {
            const active = i === safeIdx; // ← 현재 대표로 표시 중인 썸네일
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => setIdx(i)}                       // ← 클릭 시 대표 전환
                aria-label={`이미지 ${i + 1} 보기`}
                aria-current={active ? 'true' : undefined}       // ← 접근성 현재 표시
                style={{
                  width: 70,                 // ← Figma size-[70px] (강제)
                  height: 70,                // ← Figma size-[70px] (강제)
                  borderRadius: 16,          // ← Figma rounded-[16px]
                  overflow: 'hidden',        // ← 둥근 모서리 클립
                  background: '#f2f2f2',     // ← Figma bg-[#f2f2f2]
                  padding: 0,
                  boxSizing: 'border-box',   // ← 테두리 포함 70 고정(활성/비활성 동일 크기)
                  border: active ? '2px solid #111' : '2px solid transparent', // ← 활성 식별
                  cursor: 'pointer',
                  flexShrink: 0,
                  display: 'block',
                }}
              >
                <img
                  src={thumbUrl(img.url, 160) ?? undefined} // ← [2026-06-18] 70px 썸네일용 소형 변환
                  onError={fallbackToOriginal(img.url)}
                  loading="lazy"
                  decoding="async"
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',  // ← 썸네일은 정사각 크롭(사이즈 강제)
                    display: 'block',
                  }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
