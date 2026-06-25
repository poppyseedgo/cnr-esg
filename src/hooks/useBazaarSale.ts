// ============================================================================
// useBazaarSale.ts — 바자회 구매 권한 훅 (세 구매 표면의 단일 출처)
//
// 변경 이력:
//   2026-06-24  최초 작성 — 물품 기부자 선판매 정책 (BazaarProductPage/CartPage/CheckoutPage 공유)
//
// 동작:
//   - useEventPhase의 settings에서 경계/토글을 읽음 (Realtime 반영 자동)
//   - 물품 기부자 여부는 esg_am_i_item_donor() RPC로 1회 판정 (어드민/비로그인은 조회 생략)
//   - 시간 경계 통과를 위해 30초 틱으로 윈도우 재평가(자정 전환 등 무새로고침 대응)
//   - 최종 판정은 bazaarSalePolicy.decideBazaarPurchase() (서버 트리거와 동일 규칙)
//
// 사용:
//   const { canPurchase, blockReason, window, isDonor } = useBazaarSale();
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useCurrentUser } from './useCurrentUser';
import { useEventPhase } from './useEventPhase';
import { callRpc } from '@/lib/supabase';
import { getEventPhase, formatKSTDate } from '@/utils/time';
import {
  decideBazaarPurchase,
  type BazaarSaleWindow,
} from '@/lib/bazaarSalePolicy';

export interface UseBazaarSaleResult {
  /** 시간 기반 윈도우 (loading/before/presale/public/ended) */
  window: BazaarSaleWindow;
  /** 현재 사용자가 지금 구매 가능한가 (어드민/기부자/토글/아카이브 모두 반영) */
  canPurchase: boolean;
  /** 구매 불가 사유(UI 표시용). null이면 표시 안 함 */
  blockReason: string | null;
  isAdmin: boolean;
  /** 물품 기부자 여부 (어드민은 false로 두되 canPurchase는 항상 true) */
  isDonor: boolean;
  /** 기부자 판정 완료 여부 */
  donorResolved: boolean;
  presaleStartUtc: string | null;
  publicStartUtc: string | null;
  endUtc: string | null;
  /** 권한 판정에 필요한 데이터 로딩 중 여부 */
  loading: boolean;
}

export function useBazaarSale(): UseBazaarSaleResult {
  const { currentUser, isAdmin } = useCurrentUser();
  const { settings, loading: phaseLoading } = useEventPhase();

  // ── 물품 기부자 판정 (RPC) ──────────────────────────────────────────────
  // 일반 유저는 esg_bazaar_intake 직접 SELECT 불가(관리자 RLS) → SECURITY DEFINER RPC 경유.
  const [isDonor, setIsDonor] = useState(false);
  const [donorResolved, setDonorResolved] = useState(false);

  useEffect(() => {
    // 비로그인: 기부자 아님(확정). 어드민: 기부자 판정 불필요(확정 처리, 어차피 전권).
    if (!currentUser || isAdmin) {
      setIsDonor(false);
      setDonorResolved(true);
      return;
    }
    let alive = true;
    setDonorResolved(false);
    callRpc('esg_am_i_item_donor', {})
      .then((v) => {
        if (alive) {
          setIsDonor(v === true);
          setDonorResolved(true);
        }
      })
      .catch((e) => {
        console.error('[useBazaarSale] donor check error:', e);
        if (alive) {
          setIsDonor(false); // 판정 실패 시 보수적으로 비기부자 처리(서버가 최종 차단)
          setDonorResolved(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [currentUser?.id, isAdmin]);

  // ── 시간 경계 재평가용 30초 틱 (자정 전환 등 무새로고침 대응) ──────────────
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── 설정값 추출 ──────────────────────────────────────────────────────────
  const bazaar = settings.activity_periods?.bazaar;
  const presaleStartUtc = bazaar?.starts_at_utc ?? null;
  const endUtc = bazaar?.ends_at_utc ?? null;
  const publicStartUtc = settings.bazaar_public_sale_starts_at ?? null; // ← [2026-06-24] 신규 설정
  const purchaseEnabled = settings.purchase_enabled !== false; // 기본 true
  const archived = getEventPhase(settings) === 'archived';

  const result = useMemo(() => {
    const toMs = (s: string | null) => (s ? new Date(s).getTime() : null);
    return decideBazaarPurchase({
      nowMs: Date.now(),
      isAdmin,
      isDonor,
      donorResolved,
      purchaseEnabled,
      archived,
      presaleStartMs: toMs(presaleStartUtc),
      publicStartMs: toMs(publicStartUtc),
      endMs: toMs(endUtc),
      presaleStartLabel: presaleStartUtc ? formatKSTDate(presaleStartUtc) : undefined,
      publicStartLabel: publicStartUtc ? formatKSTDate(publicStartUtc) : undefined,
    });
    // tick: 시간 경계 재평가 트리거 (값 자체는 미사용)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isAdmin,
    isDonor,
    donorResolved,
    purchaseEnabled,
    archived,
    presaleStartUtc,
    publicStartUtc,
    endUtc,
    tick,
  ]);

  const loading = phaseLoading || (!!currentUser && !isAdmin && !donorResolved);

  return {
    window: phaseLoading ? 'loading' : result.window,
    canPurchase: phaseLoading ? false : result.canPurchase,
    blockReason: phaseLoading ? null : result.blockReason,
    isAdmin,
    isDonor,
    donorResolved,
    presaleStartUtc,
    publicStartUtc,
    endUtc,
    loading,
  };
}
