// ============================================================================
// donorWall.ts — 메인(공개) 기부자 명단 read API
//
// 메인 페이지에서 기부자 명단을 보여줄 때 사용. 비주얼(레이아웃/디자인)은 Figma 확정 후 별도.
// 서버 RPC가 노출 규칙(기본값 + 관리자 override)을 모두 적용해 "보여도 되는 사람"만 반환.
// 반환 필드는 이름·부서뿐 — 가격/물품/금액/이메일 등 민감정보는 서버에서 제외됨.
//
// 변경 이력:
//   2026-06-16  최초 작성 — get_main_item_donors / get_main_money_donors 래퍼
// ============================================================================

import { callRpc } from './supabase';

export interface MainDonor {
  name: string;
  dept: string | null;
}

/** 메인 노출 대상 물품 기부자 (이름+부서, 사람 단위 dedup) */
export async function loadMainItemDonors(): Promise<MainDonor[]> {
  const rows = (await callRpc('get_main_item_donors', {})) as Array<{
    donor_name: string;
    donor_dept: string | null;
  }>;
  return (rows ?? []).map((r) => ({ name: r.donor_name, dept: r.donor_dept }));
}

/** 메인 노출 대상 금액 기부자 (이름+부서, 사람 단위 dedup) */
export async function loadMainMoneyDonors(): Promise<MainDonor[]> {
  const rows = (await callRpc('get_main_money_donors', {})) as Array<{
    donor_name: string;
    donor_dept: string | null;
  }>;
  return (rows ?? []).map((r) => ({ name: r.donor_name, dept: r.donor_dept }));
}
