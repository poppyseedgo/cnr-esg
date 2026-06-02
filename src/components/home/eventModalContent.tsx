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
//   2026-06-02  brand 대표 이미지 적용(/images/brand-hero.jpg), 본문 Figma 1015:138 일치
//               (문단 간격 .brand-body 래퍼, "활동의" 제거)
// ============================================================================

import type { ReactNode } from 'react';
import type { EventModalButton } from './EventModal';
import { BazaarGuide } from './BazaarGuide';
import { WiseGuide } from './WiseGuide';
import { ZeroGuide } from './ZeroGuide';

export type EventModalKey = 'brand' | 'bazaar' | 'wise' | 'zero';

export interface EventModalContent {
  title: string;
  /** 단순 문자열(한 줄) 또는 ReactNode (다중 줄 <p> 또는 fragment). 생략 시 헤더에 부제 미표시 (wise). */
  subtitle?: ReactNode;
  hero?: string | null;             // undefined: 영역 없음, null: placeholder, string: 이미지 URL
  body: ReactNode;                  // 디자인 확정 시 이 부분 교체
  buttons?: EventModalButton[];     // 생략 시 "닫기" 단독
  /** Contents div에 추가 클래스 (예: 'esg-modal__contents--bazaar' 그라데이션) */
  contentsClassName?: string;
}

export const EVENT_MODAL_CONTENT: Record<EventModalKey, EventModalContent> = {
  brand: {
    title: 'C&R RESEARCH 29주년 ESG 이벤트',
    subtitle: '사람과 지구의 건강을 함께 지키는 우리의 실천',
    hero: '/images/brand-hero.jpg',                 // ← 대표 이미지 적용 (Figma 1015:150, h360/radius20/object-cover)
    body: (
      <div className="brand-body">                  {/* ← 문단 사이 한 줄 비움 간격 재현용 래퍼 */}
        <p>
          C&amp;R RESEARCH는 창립 29주년을 맞아, 임직원이 함께 참여하는 ESG 이벤트를 개최합니다.
          일상 속 작은 실천을 모아 의미 있는 변화를 만들고, 그 마음을 기부로 이어갑니다.
        </p>
        <p>
          이번 이벤트는 <strong>제로 웨이스트 어워드</strong>, <strong>슬기로운 사회생활 어워드</strong>,
          그리고 <strong>창립기념 ESG 온라인 바자회 · 경매</strong>로 구성되며, 모든 수익금과 모금액은{/* ← Figma 일치: "활동의" 제거 */}
          전액 <strong>생명의 숲에 기부되어 도시 숲 조성과 환경 보전 활동에 사용</strong>됩니다.
        </p>
        <p>
          사람의 건강을 지원하는 일이 곧 지구의 건강을 지키는 일이라는 믿음으로,
          여러분의 따뜻한 참여를 기다립니다.
        </p>
      </div>
    ),
  },
  bazaar: {
    title: '바자회 & 경매 참여안내',
    subtitle: (
      <>
        <p>나눔 자원 순환 위크 동안 온라인 바자회와 경매를 진행합니다.</p>
        <p>임직원 여러분들의 적극적인 참여를 기다리고 있어요.</p>
      </>
    ),
    // hero 생략 → 이미지 영역 미표시 (Figma 1035:964 — 헤더+본문만)
    body: <BazaarGuide />,
    contentsClassName: 'esg-modal__contents--gradient',  // Figma 1035:973 그라데이션
  },
  wise: {
    title: '슬기로운 사회생활 어워드',
    // subtitle 없음 (Figma 1041:49 — 부제 미표시)
    // hero 생략 → 이미지 영역 미표시
    body: <WiseGuide />,
  },
  zero: {
    title: '제로 웨이스터 어워드',
    // subtitle 없음 (Figma 1042:34 — 부제 미표시)
    // hero 생략 → 이미지 영역 미표시
    body: <ZeroGuide />,
    contentsClassName: 'esg-modal__contents--gradient',  // Figma 1042:42 그라데이션
  },
};

export function isEventModalKey(v: string | null): v is EventModalKey {
  return v === 'brand' || v === 'bazaar' || v === 'wise' || v === 'zero';
}
