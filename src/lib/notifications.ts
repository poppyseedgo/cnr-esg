// ============================================================================
// notifications.ts — 인앱 알림 API
//
// 함수:
//   - loadMyNotifications(opts)           : 내 알림 목록 (최근 N개 또는 페이지네이션)
//   - getUnreadCount()                    : 미읽 개수 (헤더 배지용)
//   - markAsRead(id)                      : 개별 읽음 처리
//   - markAllAsRead()                     : 모두 읽음 처리
//   - deleteNotification(id)              : 개별 삭제
//   - deleteAll()                         : 모두 삭제
//   - subscribeMyNotifications(uid, cb)   : Realtime 구독
//   - notifyNotificationChanged()         : window event 발생
//   - onNotificationChanged(cb)           : window event 구독
//
// 설계:
//   - DB INSERT는 트리거/cron만 (RLS로 사용자 INSERT 차단)
//   - SELECT/UPDATE/DELETE는 본인 행만 (RLS)
//   - Realtime + window event 이중 신호 (다른 컴포넌트 동기화)
// ============================================================================

import { supabase as _supabase } from './supabase';
import type { EsgNotificationRow, EsgNotificationType } from '@/types/esg';

// supabase-js 2.49 타입 추론 한계 우회
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ============================================================================
// 조회
// ============================================================================

export interface LoadNotificationsOpts {
  /** 최대 개수 (기본 20) */
  limit?: number;
  /** 페이지네이션 - 이 시각보다 이전 알림 (ISO string) */
  before?: string;
  /** 미읽만 (기본 false) */
  unreadOnly?: boolean;
  /** 특정 타입만 */
  type?: EsgNotificationType;
}

/**
 * 내 알림 목록 조회 (created_at DESC).
 *
 * RLS가 user_id=auth.uid()로 필터링하므로 클라이언트는 user_id 안 넘김.
 */
export async function loadMyNotifications(
  opts: LoadNotificationsOpts = {},
): Promise<EsgNotificationRow[]> {
  const { limit = 20, before, unreadOnly = false, type } = opts;

  let query = supabase
    .from('esg_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('created_at', before);
  if (unreadOnly) query = query.eq('is_read', false);
  if (type) query = query.eq('type', type);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as EsgNotificationRow[];
}

/**
 * 미읽 알림 개수.
 */
export async function getUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('esg_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);

  if (error) {
    console.error('[notifications] getUnreadCount error:', error);
    return 0;
  }
  return count ?? 0;
}

// ============================================================================
// 변경
// ============================================================================

/**
 * 개별 읽음 처리.
 */
export async function markAsRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('esg_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('is_read', false); // 이미 읽음이면 noop

  if (error) throw error;
  notifyNotificationChanged();
}

/**
 * 모두 읽음 처리.
 */
export async function markAllAsRead(): Promise<void> {
  const { error } = await supabase
    .from('esg_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('is_read', false);

  if (error) throw error;
  notifyNotificationChanged();
}

/**
 * 개별 삭제.
 */
export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase
    .from('esg_notifications')
    .delete()
    .eq('id', id);

  if (error) throw error;
  notifyNotificationChanged();
}

/**
 * 모두 삭제.
 */
export async function deleteAll(): Promise<void> {
  // user_id는 RLS가 자동 처리하지만 안전 위해 명시 (자체 가드)
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('not logged in');

  const { error } = await supabase
    .from('esg_notifications')
    .delete()
    .eq('user_id', u.user.id);

  if (error) throw error;
  notifyNotificationChanged();
}

// ============================================================================
// Realtime + window event
// ============================================================================

const NOTIF_CHANGED_EVENT = 'esg:notification-changed';

export function notifyNotificationChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NOTIF_CHANGED_EVENT));
  }
}

export function onNotificationChanged(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener(NOTIF_CHANGED_EVENT, handler);
  return () => window.removeEventListener(NOTIF_CHANGED_EVENT, handler);
}

/**
 * 내 알림 변경 구독 (다른 탭/세션 동기화 + 새 알림 즉시 반영).
 *
 * cart와 동일 패턴: filter 없이 모든 변경 구독 → RLS가 본인 row만 노출.
 */
export function subscribeMyNotifications(
  userId: string,
  callback: () => void,
): () => void {
  const channelName = `esg-notif-${userId.slice(0, 8)}-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'esg_notifications',
      },
      () => callback(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ============================================================================
// 상대 시간 포맷 헬퍼 (드롭다운 / 페이지에서 공통 사용)
// ============================================================================

/**
 * "방금 전", "3분 전", "2시간 전", "어제", "MM/DD" 형식.
 * KST 기준 자정 차이로 "어제" 판정.
 */
export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHr < 24) return `${diffHr}시간 전`;

  // KST 자정 기준 일수 차이
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const nowKstDay = Math.floor((now + KST_OFFSET) / 86400000);
  const thenKstDay = Math.floor((then + KST_OFFSET) / 86400000);
  const dayDiff = nowKstDay - thenKstDay;

  if (dayDiff === 1) return '어제';
  if (dayDiff < 7) return `${dayDiff}일 전`;

  // MM/DD
  const d = new Date(then + KST_OFFSET);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}
