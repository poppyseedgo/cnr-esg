// ============================================================================
// HomePage — 메인 홈 화면
//
// 구성 (Figma 933:102):
//   - HomeHero       : 풀블리드 포스터 그리드 (포스터 클릭 시 행사안내 모달)
//   - HomeFaqSection : FAQ 섹션 (max-width 1200)
//   - HomeQnaSection : Q&A 섹션 (max-width 1200)
//
// 레이아웃:
//   - HomeHero는 자체 풀블리드 (margin-inline calc 50% - 50vw)
//   - FAQ/Q&A는 max-width 1200 + 가운데 정렬, 섹션 사이 gap 170
//   - 컨테이너 padding-bottom 200 (Figma)
//
// 변경 이력:
//   2026-05-28  HomeHero 풀블리드 그리드 적용
//   2026-06-01  하단 모금/카드 영역 비활성화 → HomeHero 단독
//   2026-06-01  HomeFaqSection + HomeQnaSection 추가 (단계 7)
// ============================================================================

import { HomeHero } from '@/components/home/HomeHero';
import { HomeFaqSection } from '@/components/faq-qna/HomeFaqSection';
import { HomeQnaSection } from '@/components/faq-qna/HomeQnaSection';

export function HomePage() {
  return (
    <div>
      <HomeHero />

      {/* FAQ + Q&A 통합 컨테이너 (Figma 933:206 pb-200 pt-32 px-32 → 부모가 padding 24 갖고 있어 추가 pt만 8, px는 padding 상속) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,         // Figma 32 - AppLayout 부모 padding 24 = 8
          paddingBottom: 176,    // Figma 200 - AppLayout 부모 padding 24 = 176
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 170,             // Figma 933:206 → 993:591 → gap-170
            width: '100%',
            maxWidth: 1200,
          }}
        >
          <HomeFaqSection />
          <HomeQnaSection />
        </div>
      </div>
    </div>
  );
}
