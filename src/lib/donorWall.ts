// ============================================================================
// donorWall.ts — 메인(공개) 기부자 명단 read API
//
// 메인 전광판(DonorMarquee)에서 사용. 노출 규칙(기본값 + 관리자 override)은 서버 RPC가 적용.
// 반환 필드는 이름·부서·아바타URL뿐 — 가격/물품/금액/이메일 등 민감정보는 서버에서 제외됨.
//
// 변경 이력:
//   2026-06-16  최초 작성 — get_main_item_donors / get_main_money_donors 래퍼
//   2026-06-16  avatar_url 추가(STEP4) — 전광판 아바타 표시용
// ============================================================================

import { callRpc } from './supabase';

export interface MainDonor {
  name: string;
  dept: string | null;
  avatarUrl: string | null;
}

/** 메인 노출 대상 물품 기부자 (이름+부서+아바타, 사람 단위 dedup) */
export async function loadMainItemDonors(): Promise<MainDonor[]> {
  const rows = (await callRpc('get_main_item_donors', {})) as Array<{
    donor_name: string;
    donor_dept: string | null;
    avatar_url: string | null;
  }>;
  return (rows ?? []).map((r) => ({ name: r.donor_name, dept: r.donor_dept, avatarUrl: r.avatar_url }));
}

/** 메인 노출 대상 금액 기부자 (이름+부서+아바타, 사람 단위 dedup) */
export async function loadMainMoneyDonors(): Promise<MainDonor[]> {
  const rows = (await callRpc('get_main_money_donors', {})) as Array<{
    donor_name: string;
    donor_dept: string | null;
    avatar_url: string | null;
  }>;
  return (rows ?? []).map((r) => ({ name: r.donor_name, dept: r.donor_dept, avatarUrl: r.avatar_url }));
}
