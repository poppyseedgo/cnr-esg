// ============================================================================
// adminParticipants.ts — 참여자 역할별 명단 API (어드민)         // ← [2026-07-14]
//
// 서버 RPC esg_participant_roster() 가 역할 정의(SSOT)와 RLS 우회를 책임진다.
// 클라이언트는 한 번 불러와 role 로 그룹핑/표시/CSV 만 한다(재조회 없음).
// ============================================================================

import { supabase as _supabase } from './supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

/** 역할 코드 — SQL 과 1:1 */
export type ParticipantRole =
  | 'post_author'
  | 'comment_author'
  | 'post_liker'
  | 'auction_buyer'
  | 'auction_bidder'
  | 'auction_participant'
  | 'bazaar_buyer'
  | 'item_donor'
  | 'money_donor'
  | 'goods_backer';

export interface RosterEntry {
  role: ParticipantRole;
  key: string;
  name: string;
  dept: string | null;
  isAnonymous: boolean;
  isPaid: boolean;        // 주문/기부: 입금 완료 여부. 그 외 역할은 true
  activityCount: number;  // 이 역할에서의 활동 수
  firstAt: string;
  lastAt: string;
}

type Row = {
  role: ParticipantRole;
  person_key: string;
  display_name: string;
  dept: string | null;
  is_anonymous: boolean;
  is_paid: boolean;
  activity_count: number;
  first_at: string;
  last_at: string;
};

/** 전체 역할별 명단 (역할 → 최초활동순). */
export async function loadParticipantRoster(): Promise<RosterEntry[]> {
  const { data, error } = await supabase.rpc('esg_participant_roster');
  if (error) {
    throw new Error(error.message?.includes('NOT_ADMIN') ? '관리자 권한이 필요합니다.' : error.message);
  }
  return ((data ?? []) as Row[]).map((r) => ({
    role: r.role,
    key: r.person_key,
    name: r.display_name,
    dept: r.dept,
    isAnonymous: r.is_anonymous,
    isPaid: r.is_paid,
    activityCount: Number(r.activity_count) || 0,
    firstAt: r.first_at,
    lastAt: r.last_at,
  }));
}

/** 카테고리 → 역할 구성 (UI 그룹핑용) */
export const ROLE_CATEGORIES: {
  category: string;
  roles: { role: ParticipantRole; label: string; hint?: string }[];
}[] = [
  {
    category: '게시판',
    roles: [
      { role: 'post_author', label: '게시글 작성자' },
      { role: 'comment_author', label: '댓글 작성자' },
      { role: 'post_liker', label: '좋아요(하트)' },
    ],
  },
  {
    category: '경매',
    roles: [
      { role: 'auction_buyer', label: '구매자(낙찰)' },
      { role: 'auction_bidder', label: '입찰자' },
      { role: 'auction_participant', label: '참여자(입찰∪구매)' },
    ],
  },
  {
    category: '바자회',
    roles: [
      { role: 'bazaar_buyer', label: '구매자' },
      { role: 'item_donor', label: '물품 기부자' },
    ],
  },
  {
    category: '기부금',
    roles: [{ role: 'money_donor', label: '기부금 참여자', hint: '입금 전 포함' }],
  },
  {
    category: '굿즈',
    roles: [{ role: 'goods_backer', label: '구매자(펀딩 전원)', hint: '미입금 포함' }],
  },
];

export const ROLE_LABEL: Record<ParticipantRole, string> = Object.fromEntries(
  ROLE_CATEGORIES.flatMap((c) => c.roles.map((r) => [r.role, `${c.category} · ${r.label}`]))
) as Record<ParticipantRole, string>;
