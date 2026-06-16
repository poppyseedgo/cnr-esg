// ============================================================================
// HomePage — 메인 홈 화면
//
// 구성 (Figma 933:102):
//   - HomeHero       : 풀블리드 포스터 그리드 (자체 반응형, cqw 단위)
//   - HomeFaqSection : FAQ 섹션 (max-width 1200, 모바일 px-12)
//   - HomeQnaSection : Q&A 섹션 (max-width 1200, 모바일 px-12)
//
// 변경 이력:
//   2026-05-28  HomeHero 풀블리드 그리드 적용
//   2026-06-01  HomeFaqSection + HomeQnaSection 통합
//   2026-06-01  CSS 마이그레이션 — faq-qna.css 의 .faqqna-container 활용
// ============================================================================

import { HomeHero } from '@/components/home/HomeHero';
import { DonorMarquee } from '@/components/home/DonorMarquee'; // ← [2026-06-16] 기부자 전광판
import { HomeFaqSection } from '@/components/faq-qna/HomeFaqSection';
import { HomeQnaSection } from '@/components/faq-qna/HomeQnaSection';
import '@/components/faq-qna/faq-qna.css';

export function HomePage() {
  return (
    <div>
      <DonorMarquee />
      <HomeHero />

      <div className="faqqna-container">
        <div className="faqqna-container__inner">
          <HomeFaqSection />
          <HomeQnaSection />
        </div>
      </div>
    </div>
  );
}
