// ============================================================================
// Supabase Client (단일 인스턴스)
//
// 원칙:
//   - 앱 전체에서 단 하나의 client만 사용 (중복 인스턴스 금지)
//   - 환경변수는 런타임에 검증 (실수로 undefined일 때 즉시 throw)
//   - 도메인 하드코딩 0 — Supabase URL도 환경변수
//   - 타입 안전: Database 제네릭으로 모든 쿼리/RPC 타입 추론
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/esg';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('[cnr-esg] VITE_SUPABASE_URL 환경변수 누락');
}
if (!supabaseAnonKey) {
  throw new Error('[cnr-esg] VITE_SUPABASE_ANON_KEY 환경변수 누락');
}

/**
 * 앱 전역 Supabase 클라이언트.
 * - 인증 세션은 localStorage에 자동 저장 (persistSession)
 * - 토큰 만료 시 자동 갱신 (autoRefreshToken)
 * - OAuth redirect URL의 토큰 자동 감지 (detectSessionInUrl)
 * - Realtime 이벤트 초당 10건 제한 (이벤트 폭발 방지 — C&R Space 9.74M 사고 교훈)
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'cnr-esg-auth', // C&R Space와 storage 충돌 방지
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

/**
 * Realtime 구독 생성 헬퍼.
 * 사용 예:
 *   const ch = subscribeTable('esg_donation_stats', '*', (payload) => { ... });
 *   ch.unsubscribe(); // cleanup
 */
export function subscribeTable<T extends keyof Database['public']['Tables']>(
  table: T,
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
  callback: (payload: unknown) => void,
  filter?: string
) {
  const channelName = `esg-${String(table)}-${Date.now()}`;
  const channel = supabase.channel(channelName);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (channel as any).on(
    'postgres_changes',
    {
      event,
      schema: 'public',
      table: String(table),
      ...(filter ? { filter } : {}),
    },
    callback
  );

  channel.subscribe();
  return channel;
}

/**
 * RPC 호출 헬퍼 — 에러 처리 통일.
 * 사용 예:
 *   const result = await callRpc('place_bid', { p_auction_id, p_bid_amount });
 *   if (!result.success) { ... }
 */
export async function callRpc<
  T extends keyof Database['public']['Functions']
>(
  fn: T,
  args: Database['public']['Functions'][T]['Args']
): Promise<Database['public']['Functions'][T]['Returns']> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) {
    console.error(`[RPC ${String(fn)}] error:`, error);
    // SECURITY DEFINER 함수 내부 RAISE EXCEPTION은 error.message로 전달됨
    throw new Error(error.message || `RPC ${String(fn)} 호출 실패`);
  }
  return data as Database['public']['Functions'][T]['Returns'];
}
