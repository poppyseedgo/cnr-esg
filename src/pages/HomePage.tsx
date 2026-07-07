// ============================================================================
// HomePage — 메인 홈 화면
//
// 구성 (Figma 933:102):
//   - HeroBazaar     : 바자회 히어로 (좌: 타이틀/카운트다운, 우: 나무 그리드/진행바)
//   - HomeFaqSection : FAQ 섹션 (max-width 1200, 모바일 px-12)
//   - HomeQnaSection : Q&A 섹션 (max-width 1200, 모바일 px-12)
//
// 변경 이력:
//   2026-05-28  HomeHero 풀블리드 그리드 적용
//   2026-06-01  HomeFaqSection + HomeQnaSection 통합
//   2026-06-01  CSS 마이그레이션 — faq-qna.css 의 .faqqna-container 활용
// ============================================================================

import { HeroAuction } from '@/components/home/HeroAuction'; // ← [2026-07-08] 경매 오픈 히어로(바자회 히어로 교체)
import { DonorMarquee } from '@/components/home/DonorMarquee'; // ← [2026-06-16] 기부자 전광판
import { MissionBand } from '@/components/home/MissionBand'; // ← [2026-06-23] 미션 밴드(2번째 섹션)
import { HomeFaqSection } from '@/components/faq-qna/HomeFaqSection';
import { HomeQnaSection } from '@/components/faq-qna/HomeQnaSection';
import '@/components/faq-qna/faq-qna.css';

export function HomePage() {
  return (
    <div>
      {/* [2026-06-23] Figma 변경: 전광판을 히어로 '아래'로 이동 (히어로 → 전광판 → 미션) */}
      <HeroAuction />{/* ← [2026-07-08] 경매 오픈 3분할 히어로 */}
      <DonorMarquee />
      <MissionBand />

      <div className="faqqna-container">
        <div className="faqqna-container__inner">
          <HomeFaqSection />
          <HomeQnaSection />
        </div>
      </div>
    </div>
  );
}
