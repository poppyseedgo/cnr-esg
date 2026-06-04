// ============================================================================
// donations.ts — 기부 API
//
// 함수:
//   - createDonation(amount, options): 기부 신청 RPC
//   - loadMyDonations(): 내 기부 내역
//   - loadDonation(donationId): 단일 기부 조회 (본인 또는 어드민)
//   - loadCertificate(donationId): 인증서 조회
//   - getDonationTimeLeft(expiresAt): 카운트다운 헬퍼
//   - subscribeMyDonations(callback): Realtime
// ============================================================================

import { supabase as _supabase } from './supabase';
import { callRpc } from './supabase';
import { trackDonate } from './analytics'; // ← [2026-06-02 추가] GA4 기부 완료 추적
import type {
  EsgDonationRow,
  EsgDonationCertificateRow,
  CreateDonationResult,
} from '@/types/esg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ============================================================================
// 신청
// ============================================================================

export interface CreateDonationOptions {
  payerName?: string;
  message?: string;
  isAnonymous?: boolean;
}

/** 기부 신청. 실패 시 친절한 에러 메시지 throw. */
export async function createDonation(
  amount: number,
  options: CreateDonationOptions = {}
): Promise<CreateDonationResult> {
  if (amount < 10000) {
    throw new Error('최소 기부 금액은 10,000원입니다.');
  }
  if (options.message && options.message.length > 300) {
    throw new Error('메시지는 300자 이내로 작성해 주세요.');
  }

  const result = (await callRpc('create_donation', {
    p_amount: amount,
    p_payer_name: options.payerName ?? null,
    p_message: options.message ?? null,
    p_is_anonymous: options.isAnonymous === true,
  })) as CreateDonationResult;

  if (!result.success) {
    throw new Error(humanizeError(result.error));
  }

  trackDonate({
    amount: result.amount ?? amount,        // ← [2026-06-02 추가] value (RPC 반환액 우선, 없으면 입력액)
    donationNumber: result.donation_number, // ← [2026-06-02 추가] transaction_id
    isAnonymous: options.isAnonymous === true, // ← [2026-06-02 추가]
  }); // ← [2026-06-02 추가] GA4 donate (성공 시에만)

  return result;
}

function humanizeError(code: string | undefined): string {
  switch (code) {
    case 'NOT_AUTHENTICATED':
      return '로그인이 필요합니다.';
    case 'AMOUNT_BELOW_MIN':
      return '최소 기부 금액은 10,000원입니다.';
    case 'MESSAGE_TOO_LONG':
      return '메시지는 300자 이내로 작성해 주세요.';
    case 'USER_NOT_FOUND':
      return '사용자 정보를 찾을 수 없습니다. 다시 로그인해 주세요.';
    case 'DONATION_NOT_FOUND':
      return '기부 정보를 찾을 수 없습니다.';
    case 'INVALID_STATUS':
      return '현재 상태에서는 처리할 수 없습니다.';
    case 'NOT_AUTHORIZED':
      return '권한이 없습니다.';
    default:
      return code ?? '오류가 발생했습니다.';
  }
}

// ============================================================================
// 조회
// ============================================================================

/** 내 기부 내역 (모든 상태) */
export async function loadMyDonations(userId: string): Promise<EsgDonationRow[]> {
  const { data, error } = await supabase
    .from('esg_donations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EsgDonationRow[];
}

/** 단일 기부 조회 (본인 또는 어드민만 RLS 통과) */
export async function loadDonation(donationId: string): Promise<EsgDonationRow | null> {
  const { data, error } = await supabase
    .from('esg_donations')
    .select('*')
    .eq('id', donationId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as EsgDonationRow | null;
}

/** 인증서 조회 (본인 또는 어드민) */
export async function loadCertificate(
  donationId: string
): Promise<EsgDonationCertificateRow | null> {
  const { data, error } = await supabase
    .from('esg_donation_certificates')
    .select('*')
    .eq('donation_id', donationId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as EsgDonationCertificateRow | null;
}

// ============================================================================
// 헬퍼
// ============================================================================

/** 남은 시간 (ms). 만료 시 0 이하 */
export function getDonationTimeLeft(expiresAt: string | null | undefined): number {
  if (!expiresAt) return 0;
  return new Date(expiresAt).getTime() - Date.now();
}

// ============================================================================
// Realtime
// ============================================================================

export function subscribeMyDonations(userId: string, callback: () => void): () => void {
  const channelName = `esg-donations-${userId.slice(0, 8)}-${Math.random()
    .toString(36)
    .slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'esg_donations',
        // filter 제거 (DELETE 호환). RLS가 본인 row만 노출하므로 OK.
      },
      () => callback()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
