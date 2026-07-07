// ============================================================================
// AdminGoods — 굿즈 상품 어드민 페이지
//
// [설계] 굿즈는 바자회와 동일한 상품 CRUD(등록/수정/숨김/정렬/찜집계)를 그대로 사용.
//   AdminProducts 를 section="goods" 로 재사용(코드 중복 0). 차이는 오직 섹션 필터·문구·
//   섹션 격리 재정렬(reorder_products_in_section)뿐 — 바자회 어드민 경로는 무손상.
//
// [2026-07-07] 신규 — 굿즈 섹션 도입(Phase 1: DB + 어드민).
// ============================================================================

import { AdminProducts } from './AdminProducts';

export function AdminGoods() {
  return <AdminProducts section="goods" />;
}
