// ============================================================================
// donorWall.ts — 메인(공개) 기부자 명단 read API
//
// 메인 전광판(DonorMarquee)에서 사용. 노출 규칙(기본값 + 관리자 override)은 서버 RPC가 적용.
// 반환 필드는 이름·부서·아바타URL·익명여부·색시드뿐 — 금액/물품/이메일 등 민감정보는 서버 제외.
//
// 변경 이력:
//   2026-06-16  최초 작성 — get_main_item_donors / get_main_money_donors 래퍼
//   2026-06-16  avatar_url 추가(STEP4) — 전광판 아바타 표시용
//   2026-06-16  is_anonymous/seed 추가(STEP5) — 익명 기부자 '익명 아바타' 마스킹 표시
// ============================================================================

import { callRpc, supabase } from './supabase';

export interface MainDonor {
  name: string;          // 익명이면 '익명'
  dept: string | null;   // 익명이면 null
  avatarUrl: string | null; // 익명이면 null
  isAnonymous: boolean;  // true → 게시판과 동일한 '익명 아바타' 마스킹
  seed: string;          // 아바타 색 시드(비식별 md5). 사람별 색 고정용
}

type Row = {
  donor_name: string;
  donor_dept: string | null;
  avatar_url: string | null;
  is_anonymous: boolean;
  seed: string;
};

const mapRow = (r: Row): MainDonor => ({
  name: r.donor_name,
  dept: r.donor_dept,
  avatarUrl: r.avatar_url,
  isAnonymous: r.is_anonymous,
  seed: r.seed,
});

/** 메인 노출 대상 물품 기부자 (사람 단위 dedup). 익명 개념 없음(is_anonymous=false). */
export async function loadMainItemDonors(): Promise<MainDonor[]> {
  const rows = (await callRpc('get_main_item_donors', {})) as Row[];
  return (rows ?? []).map(mapRow);
}

/** 메인 노출 대상 금액 기부자 (사람 단위 dedup). 전부 익명이면 '익명' 마스킹. */
export async function loadMainMoneyDonors(): Promise<MainDonor[]> {
  const rows = (await callRpc('get_main_money_donors', {})) as Row[];
  return (rows ?? []).map(mapRow);
}

// ----------------------------------------------------------------------------
// 라이브 갱신: 공개 시그널 테이블(esg_realtime_signal, channel='donor_wall')의
//   UPDATE만 구독. 기부/물품/노출설정 변경 시 트리거가 bump → 콜백 호출.
//   (esg_donations는 RLS로 공개구독 불가하므로 시그널 테이블을 우회 채널로 사용)
// ----------------------------------------------------------------------------
export function subscribeDonorWall(callback: () => void): () => void {
  const channelName = `esg-donor-wall-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'esg_realtime_signal',
        filter: 'channel=eq.donor_wall',
      },
      () => callback()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
