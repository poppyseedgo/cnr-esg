// ============================================================================
// adminPresale.ts — 선구매(선판매) 자격자 명단 조회 (어드민)
//
// 변경 이력:
//   2026-06-26  최초 작성 — esg_list_presale_eligible RPC 래퍼
//
// 자격 = 물품 기부자(esg_bazaar_intake.donor_id) OR 기부금 입금확인자(esg_donations.paid)
//   서버 SSOT(esg_is_presale_eligible)와 동일 기준. 비어드민은 0행(RPC 내부 가드).
// ============================================================================

import { callRpc } from './supabase';

export interface EsgPresaleEligibleRow {
  user_id: string;
  name: string;
  dept: string | null;
  email: string;
  is_item_donor: boolean; // 물품 기부 사유
  is_paid_donor: boolean; // 기부금 입금확인 사유
}

/** 선구매 자격자 명단 (이름순). 어드민 전용 RPC. */
export async function loadPresaleEligible(): Promise<EsgPresaleEligibleRow[]> {
  const rows = await callRpc('esg_list_presale_eligible', {});
  return (rows ?? []) as EsgPresaleEligibleRow[];
}
