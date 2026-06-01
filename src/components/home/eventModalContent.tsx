// ============================================================================
// eventModalContent.tsx — 포스터 모달 3종 내용 레지스트리
//
// 키: 'brand' | 'bazaar' | 'wise' | 'zero'  (HomeHero 타일 클릭 시 ?modal=<키>)
//   brand  : C&R RESEARCH 행사 취지 + 생명의 숲 기부 안내
//   bazaar : 바자회 + 경매 통합 "참여안내"
//   wise   : 슬기로운 사회생활 어워드 "참여안내 + 어워드 투표 안내"
//   zero   : 제로 웨이스트 어워드 "참여안내 + 어워드 투표 안내"
//
// 필드:
//   title    — 40px Pretendard Medium
//   subtitle — 20px Pretendard Regular
//   hero     — 대표 이미지 URL (undefined면 영역 자체 미표시, null이면 placeholder)
//   body     — 본문 ReactNode (디자인 확정 시 채움)
//   buttons  — 하단 버튼 1~3개 (생략 시 "닫기" 단독)
//
// ※ 본문은 Figma 모달 디자인 확정 전 placeholder. 디자인 나오면 body만 교체.
//
// 변경 이력:
//   2026-05-28  최초 작성 (인프라 — placeholder 본문)
//   2026-06-01  hero/buttons 가변 필드 추가 (Figma 989:262 Big size)
// ============================================================================

import type { ReactNode } from 'react';
import type { EventModalButton } from './EventModal';
import { BazaarGuide } from './BazaarGuide';

export type EventModalKey = 'brand' | 'bazaar' | 'wise' | 'zero';

export interface EventModalContent {
  title: string;
  subtitle: string;
  hero?: string | null;             // undefined: 영역 없음, null: placeholder, string: 이미지 URL
  body: ReactNode;                  // 디자인 확정 시 이 부분 교체
  buttons?: EventModalButton[];     // 생략 시 "닫기" 단독
}

// 모든 모달 공통 placeholder 본문 (lorem ipsum 더미)
const PLACEHOLDER_BODY: ReactNode = (
  <>
    <p>Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book.</p>
    <p>It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.</p>
  </>
);

export const EVENT_MODAL_CONTENT: Record<EventModalKey, EventModalContent> = {
  brand: {
    title: 'C&R RESEARCH 29주년 ESG 이벤트',
    subtitle: '사람과 지구의 건강을 함께 지키는 우리의 실천',
    hero: null,
    body: (
      <>
        <p>
          C&amp;R RESEARCH는 창립 29주년을 맞아, 임직원이 함께 참여하는 ESG 이벤트를 개최합니다.
          일상 속 작은 실천을 모아 의미 있는 변화를 만들고, 그 마음을 기부로 이어갑니다.
        </p>
        <p>
          이번 이벤트는 <b>제로 웨이스트 어워드</b>, <b>슬기로운 사회생활 어워드</b>,
          그리고 <b>창립기념 ESG 온라인 바자회 · 경매</b>로 구성됩니다.
          모든 활동의 수익금과 모금액은 전액 <b>생명의 숲</b>에 기부되어,
          도시 숲 조성과 환경 보전 활동에 사용됩니다.
        </p>
        <p>
          사람의 건강을 지원하는 일이 곧 지구의 건강을 지키는 일이라는 믿음으로,
          여러분의 따뜻한 참여를 기다립니다.
        </p>
      </>
    ),
  },
  bazaar: {
    title: '바자회 & 경매 참여안내',
    subtitle: '참여 물품 가이드 · 2026 C&R 창립기념 · 6/30 — 7/10',
    // hero 생략 → 이미지 영역 미표시 (가이드 콘텐츠가 풍부해서 본문에 집중)
    body: <BazaarGuide />,
  },
  wise: {
    title: '슬기로운 사회생활 어워드',
    subtitle: '참여안내 및 어워드 투표안내',
    hero: null,
    body: PLACEHOLDER_BODY,
  },
  zero: {
    title: '제로 웨이스트 어워드',
    subtitle: '참여안내 및 어워드 투표안내',
    hero: null,
    body: PLACEHOLDER_BODY,
  },
};

export function isEventModalKey(v: string | null): v is EventModalKey {
  return v === 'brand' || v === 'bazaar' || v === 'wise' || v === 'zero';
}
