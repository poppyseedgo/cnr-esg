// ============================================================================
// eventModalContent.tsx — 포스터 모달 3종 내용 레지스트리
//
// 키: 'bazaar' | 'wise' | 'zero'  (HomeHero 타일 클릭 시 ?modal=<키>)
//   bazaar : 바자회 + 경매 통합 "참여안내"
//   wise   : 슬기로운 사회생활 어워드 "참여안내 + 어워드 투표 안내"
//   zero   : 제로 웨이스트 어워드 "참여안내 + 어워드 투표 안내"
//
// ※ 본문은 Figma 모달 디자인 확정 전 placeholder. 디자인 나오면 body만 교체.
//
// 변경 이력:
//   2026-05-28  최초 작성 (인프라 — placeholder 본문)
// ============================================================================

import type { ReactNode } from 'react';

export type EventModalKey = 'bazaar' | 'wise' | 'zero';

export interface EventModalContent {
  title: string;
  subtitle: string;
  body: ReactNode;                  // 디자인 확정 시 이 부분 교체
}

export const EVENT_MODAL_CONTENT: Record<EventModalKey, EventModalContent> = {
  bazaar: {
    title: '바자회 & 경매 참여안내',
    subtitle: '2026 C&R 창립기념 ESG 온라인 바자회 · 경매 · 6/30 — 7/10',
    body: (
      <div className="esg-modal__placeholder">
        바자회 + 경매 참여안내 내용이 들어갈 자리입니다.
        <br />
        (Figma 모달 디자인 확정 후 채워집니다)
      </div>
    ),
  },
  wise: {
    title: '슬기로운 사회생활 어워드',
    subtitle: '참여안내 및 어워드 투표 안내',
    body: (
      <div className="esg-modal__placeholder">
        슬기로운 사회생활 어워드 참여안내 + 투표 안내가 들어갈 자리입니다.
        <br />
        (Figma 모달 디자인 확정 후 채워집니다)
      </div>
    ),
  },
  zero: {
    title: '제로 웨이스트 어워드',
    subtitle: '참여안내 및 어워드 투표 안내 · 6/8 — 6/22',
    body: (
      <div className="esg-modal__placeholder">
        제로 웨이스트 어워드 참여안내 + 투표 안내가 들어갈 자리입니다.
        <br />
        (Figma 모달 디자인 확정 후 채워집니다)
      </div>
    ),
  },
};

export function isEventModalKey(v: string | null): v is EventModalKey {
  return v === 'bazaar' || v === 'wise' || v === 'zero';
}
