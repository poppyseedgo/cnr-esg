// ============================================================================
// GoodsProductPage — 굿즈 상세 페이지
//
// [설계] 상세는 바자회와 동일(이미지/가격/장바구니/즉시구매/탭/관리자 편집).
//   차이는 판매정책(상시)·운영시간 안내 제거·뒤로가기 경로뿐 → BazaarProductPage 를
//   section="goods" 로 재사용(코드 중복 0, 바자회 상세 경로 무손상).
//
// [2026-07-07] 신규 — 굿즈 섹션 Phase 2(스토어프론트).
// ============================================================================

import { BazaarProductPage } from './BazaarProductPage';

export function GoodsProductPage() {
  return <BazaarProductPage section="goods" />;
}
