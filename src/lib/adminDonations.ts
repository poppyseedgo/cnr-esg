// ============================================================================
// adminDonations.ts — 어드민 기부 관리 API
// ============================================================================

import { supabase as _supabase } from './supabase';
import { callRpc } from './supabase';
import type {
  EsgDonationRow,
  EsgDonationStatus,
  MarkDonationPaidResult,
} from '@/types/esg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export interface LoadAllDonationsFilters {
  statuses?: EsgDonationStatus[];
  anonymousFilter?: 'all' | 'anonymous_only' | 'named_only';
  search?: string;
  sortOrder?: 'newest' | 'oldest';
  limit?: number;
}

export async function loadAllDonations(
  filters: LoadAllDonationsFilters = {}
): Promise<EsgDonationRow[]> {
  let query = supabase.from('esg_donations').select('*').limit(filters.limit ?? 200);

  if (filters.statuses && filters.statuses.length > 0) {
    query = query.in('payment_status', filters.statuses);
  }
  if (filters.anonymousFilter === 'anonymous_only') {
    query = query.eq('is_anonymous', true);
  } else if (filters.anonymousFilter === 'named_only') {
    query = query.eq('is_anonymous', false);
  }
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    query = query.or(
      `donation_number.ilike.%${s}%,user_name_snapshot.ilike.%${s}%,user_email.ilike.%${s}%,payer_name.ilike.%${s}%`
    );
  }
  query = query.order('created_at', { ascending: filters.sortOrder === 'oldest' });

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as EsgDonationRow[];
}

export async function markDonationPaid(
  donationId: string,
  payerName?: string,
  adminMemo?: string
): Promise<MarkDonationPaidResult> {
  const result = (await callRpc('mark_donation_paid', {
    p_donation_id: donationId,
    p_payer_name: payerName ?? null,
    p_admin_memo: adminMemo ?? null,
  })) as MarkDonationPaidResult;
  if (!result.success) {
    throw new Error(result.error ?? '입금 확인 실패');
  }
  return result;
}

export async function cancelDonationAdmin(donationId: string, reason: string): Promise<void> {
  const result = (await callRpc('cancel_donation', {
    p_donation_id: donationId,
    p_reason: reason,
  })) as { success: boolean; error?: string };
  if (!result.success) throw new Error(result.error ?? '취소 실패');
}

// ← [2026-06-16 버그#2] 기부 영구 삭제 (Test/오등록 건 제거). 관리자 전용 RPC.
//    인증서는 FK CASCADE로 동반 삭제되고, 실시간 뷰 esg_donation_stats에서 즉시 차감됨(버그#4).
export async function deleteDonation(donationId: string): Promise<void> {
  const result = (await callRpc('delete_donation', {
    p_donation_id: donationId,
  })) as { success: boolean; error?: string };
  if (!result.success) throw new Error(result.error ?? '삭제 실패');
}

// ← [2026-06-16] 기부금 인증서 메일 재발송. 완료(paid) + 인증서 존재 건만.
//    새 outbox 행을 적재 → cron Edge Function이 다음 틱에 발송. 반환에 수신 이메일 포함.
export async function resendDonationCertificate(
  donationId: string
): Promise<{ to_email?: string }> {
  const result = (await callRpc('resend_donation_certificate', {
    p_donation_id: donationId,
  })) as { success: boolean; error?: string; to_email?: string };
  if (!result.success) throw new Error(result.error ?? '재발송 실패');
  return { to_email: result.to_email };
}

export async function updateAdminMemo(donationId: string, memo: string): Promise<void> {
  const { error } = await supabase
    .from('esg_donations')
    .update({ admin_memo: memo, updated_at: new Date().toISOString() })
    .eq('id', donationId);
  if (error) throw error;
}

export function subscribeDonationsAdmin(callback: () => void): () => void {
  const channelName = `esg-admin-donations-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'esg_donations' },
      () => callback()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
