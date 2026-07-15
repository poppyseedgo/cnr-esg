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
  | 'all' // ← [2026-07-14] 전체(중복 제거). 서버 역할 아님 — 클라이언트에서 합성
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

/** 전체 명단 1인 항목 — 여러 역할을 가로질러 사람 단위로 합친 결과 */
export interface RosterPerson {
  key: string;
  name: string;
  dept: string | null;
  roles: ParticipantRole[];   // 이 사람이 가진 역할들(중복 없음, 'all' 제외)
  categories: string[];       // 참여 카테고리(게시판/경매/바자회/기부금/굿즈) — 중복 없음
  totalActivity: number;      // 전 역할 활동수 합
  isPaidAny: boolean;         // 주문/기부 중 하나라도 입금 완료면 true
  firstAt: string;            // 전 역할 통틀어 최초 참여
  lastAt: string;             // 전 역할 통틀어 최근 참여
}

/** 역할 → 카테고리 라벨 (합성용) */
const ROLE_TO_CATEGORY: Record<string, string> = {
  post_author: '게시판', comment_author: '게시판', post_liker: '게시판',
  auction_buyer: '경매', auction_bidder: '경매', auction_participant: '경매',
  bazaar_buyer: '바자회', item_donor: '바자회',
  money_donor: '기부금',
  goods_backer: '굿즈',
};

/**
 * 역할별 명단(roster) → 사람 단위 전체 명단(중복 제거).   // ← [2026-07-14]
 *
 * dedup 주의: auction_participant 는 auction_buyer/bidder 의 합집합이라 활동수가
 * 겹친다. 전체 활동수 합산 시 이중계상을 막기 위해 auction_participant 는
 * "역할 표기"에서만 쓰고 활동수·카테고리 집계에서는 제외한다(원자 역할만 합산).
 */
export function buildAllParticipants(roster: RosterEntry[]): RosterPerson[] {
  const DERIVED: ParticipantRole[] = ['auction_participant']; // 합집합(파생) 역할
  // 입금 개념이 있는 역할(주문/기부)만 isPaidAny 판정 대상. 글/댓글/좋아요/입찰은
  // is_paid=true 로 고정돼 있어 그대로 쓰면 "입금있음"이 오염된다.  // ← [2026-07-14]
  const PAID_CONCEPT: ParticipantRole[] = ['auction_buyer', 'bazaar_buyer', 'money_donor', 'goods_backer'];
  const map = new Map<string, RosterPerson>();

  for (const e of roster) {
    const p = map.get(e.key) ?? {
      key: e.key, name: e.name, dept: e.dept,
      roles: [], categories: [], totalActivity: 0, isPaidAny: false,
      firstAt: e.firstAt, lastAt: e.lastAt,
    };
    if (!p.roles.includes(e.role)) p.roles.push(e.role);
    if (!p.dept && e.dept) p.dept = e.dept;
    // 최신 이름 우선(더 최근 활동의 이름 스냅샷 채택)
    if (e.lastAt >= p.lastAt) p.name = e.name;

    if (!DERIVED.includes(e.role)) {
      p.totalActivity += e.activityCount;              // 원자 역할만 합산(이중계상 방지)
      const cat = ROLE_TO_CATEGORY[e.role];
      if (cat && !p.categories.includes(cat)) p.categories.push(cat);
      if (PAID_CONCEPT.includes(e.role) && e.isPaid) p.isPaidAny = true; // ← [2026-07-14] 주문/기부만
    }
    if (e.firstAt < p.firstAt) p.firstAt = e.firstAt;
    if (e.lastAt > p.lastAt) p.lastAt = e.lastAt;
    map.set(e.key, p);
  }

  return [...map.values()].sort((a, b) => (a.firstAt < b.firstAt ? -1 : a.firstAt > b.firstAt ? 1 : 0));
}

/** 카테고리 → 역할 구성 (UI 그룹핑용) */
export const ROLE_CATEGORIES: {
  category: string;
  roles: { role: ParticipantRole; label: string; hint?: string }[];
}[] = [
  {
    category: '전체',
    roles: [{ role: 'all', label: '전체 참여자', hint: '중복 제거' }],
  },
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

export const ROLE_LABEL: Record<ParticipantRole, string> = {
  ...(Object.fromEntries(
    ROLE_CATEGORIES.flatMap((c) => c.roles.map((r) => [r.role, `${c.category} · ${r.label}`]))
  ) as Record<ParticipantRole, string>),
  all: '전체 참여자',
};
