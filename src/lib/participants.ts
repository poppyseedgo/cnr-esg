// ============================================================================
// participants.ts — 참여자 명단 read API                        // ← [2026-07-14]
//
// "참여해 주신 분들"(16:9) 페이지 전용. 서버 RPC esg_participant_names() 가
// 참여자 정의(SSOT)와 RLS 우회를 모두 책임진다. 클라이언트는 표시만 한다.
//   참여 = 구매(pledged|pending|paid) OR 금액기부(paid) OR 바자회 물품기부
//   반환 필드는 이름/부서/참여유형뿐 — 금액·이메일은 서버에서 제외.
// ============================================================================

import { callRpc, supabase } from './supabase';
import type { EsgParticipantNameRow } from '@/types/esg';

export type ParticipantKind = 'purchase' | 'donation' | 'item';

export interface Participant {
  key: string;              // 사람 단위 dedup 키(비식별)
  name: string;             // 익명 기부자는 '익명'
  dept: string | null;
  isAnonymous: boolean;
  kinds: ParticipantKind[]; // 참여 유형(복수 가능)
}

/** 전체 참여자 명단 (최초 참여 순). */
export async function loadParticipants(): Promise<Participant[]> {
  const rows = (await callRpc('esg_participant_names', {})) as EsgParticipantNameRow[] | null;
  return (rows ?? []).map((r) => ({
    key: r.person_key,
    name: r.display_name,
    dept: r.dept,
    isAnonymous: r.is_anonymous,
    kinds: r.kinds ?? [],
  }));
}

/**
 * 라이브 갱신 — 도너월과 동일한 공개 시그널 테이블(esg_realtime_signal)을 구독.
 * 주문/기부 테이블은 RLS로 공개 구독이 불가하므로 시그널을 우회 채널로 사용한다.
 * (신규 참여가 즉시 화면에 뜨지 않아도 되면 호출하지 않아도 무방)
 */
export function subscribeParticipants(callback: () => void): () => void {
  const channelName = `esg-participants-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'esg_realtime_signal' },
      () => callback()
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
