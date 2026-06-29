// ============================================================================
// useBazaarSale.ts — 바자회 구매 권한 훅 (구매 표면들의 단일 출처)
//
// 변경 이력:
//   2026-06-24  최초 작성 — 물품 기부자 선판매 정책 (BazaarProductPage/CartPage/CheckoutPage 공유)
//   2026-06-26  선구매 자격 확장 — esg_am_i_item_donor() → esg_am_i_presale_eligible() RPC.
//               isDonor→isPresaleEligible, donorResolved→eligibilityResolved 리네임.
//               (외부 표면은 canPurchase/blockReason 만 사용 → 리네임 안전, 교차검증 완료)
//   2026-06-29  일일 운영시간(KST 07~21시 기본) 반영. settings.bazaar_daily_open/close_hour 읽음.
//               30초 고정 폴링 → 다음 경계 적응형 setTimeout(경계 정확 토글). dailyHours 노출.
//
// 동작:
//   - useEventPhase의 settings에서 경계/토글을 읽음 (Realtime 반영 자동)
//   - 선구매 자격(물품 기부자 OR 입금확인 기부자)은 esg_am_i_presale_eligible() RPC로 1회 판정
//     (어드민/비로그인은 조회 생략)
//   - 시간 경계 통과를 위해 30초 틱으로 윈도우 재평가(자정 전환 등 무새로고침 대응)
//   - 최종 판정은 bazaarSalePolicy.decideBazaarPurchase() (서버 트리거와 동일 규칙)
//
// 사용:
//   const { canPurchase, blockReason, window, isPresaleEligible } = useBazaarSale();
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useCurrentUser } from './useCurrentUser';
import { useEventPhase } from './useEventPhase';
import { callRpc } from '@/lib/supabase';
import { getEventPhase, formatKSTDate } from '@/utils/time';
import {
  decideBazaarPurchase,
  resolveDailyHours,
  BAZAAR_DAILY_OPEN_HOUR_DEFAULT,
  BAZAAR_DAILY_CLOSE_HOUR_DEFAULT,
  type BazaarSaleWindow,
  type DailyHoursInfo,
} from '@/lib/bazaarSalePolicy';

export interface UseBazaarSaleResult {
  /** 시간 기반 윈도우 (loading/before/presale/public/ended) */
  window: BazaarSaleWindow;
  /** 현재 사용자가 지금 구매 가능한가 (어드민/자격/토글/아카이브 모두 반영) */
  canPurchase: boolean;
  /** 구매 불가 사유(UI 표시용). null이면 표시 안 함 */
  blockReason: string | null;
  isAdmin: boolean;
  /** 선구매 자격 여부 = 물품 기부자 OR 입금확인 기부자 (어드민은 false로 두되 canPurchase는 항상 true) */
  isPresaleEligible: boolean;
  /** 자격 판정 완료 여부 */
  eligibilityResolved: boolean;
  presaleStartUtc: string | null;
  publicStartUtc: string | null;
  endUtc: string | null;
  /** [추가 2026-06-29] 일일 구매 운영시간 상태 + 경계 시각(UI 실시간 카운트다운/안내용) */
  dailyHours: DailyHoursInfo;
  /** 권한 판정에 필요한 데이터 로딩 중 여부 */
  loading: boolean;
}

export function useBazaarSale(): UseBazaarSaleResult {
  const { currentUser, isAdmin } = useCurrentUser();
  const { settings, loading: phaseLoading } = useEventPhase();

  // ── 선구매 자격 판정 (RPC) ──────────────────────────────────────────────
  // 일반 유저는 esg_bazaar_intake / esg_donations 직접 SELECT 불가(관리자 RLS) → SECURITY DEFINER RPC 경유.
  const [isPresaleEligible, setIsPresaleEligible] = useState(false); // ← [수정 2026-06-26]
  const [eligibilityResolved, setEligibilityResolved] = useState(false); // ← [수정 2026-06-26]

  useEffect(() => {
    // 비로그인: 자격 없음(확정). 어드민: 자격 판정 불필요(확정 처리, 어차피 전권).
    if (!currentUser || isAdmin) {
      setIsPresaleEligible(false);
      setEligibilityResolved(true);
      return;
    }
    let alive = true;
    setEligibilityResolved(false);
    callRpc('esg_am_i_presale_eligible', {}) // ← [수정 2026-06-26] 물품 기부자 OR 입금확인 기부자
      .then((v) => {
        if (alive) {
          setIsPresaleEligible(v === true);
          setEligibilityResolved(true);
        }
      })
      .catch((e) => {
        console.error('[useBazaarSale] presale eligibility check error:', e);
        if (alive) {
          setIsPresaleEligible(false); // 판정 실패 시 보수적으로 비자격 처리(서버가 최종 차단)
          setEligibilityResolved(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [currentUser?.id, isAdmin]);

  // ── 설정값 추출 ──────────────────────────────────────────────────────────
  const bazaar = settings.activity_periods?.bazaar;
  const presaleStartUtc = bazaar?.starts_at_utc ?? null;
  const endUtc = bazaar?.ends_at_utc ?? null;
  const publicStartUtc = settings.bazaar_public_sale_starts_at ?? null; // ← [2026-06-24] 신규 설정
  const purchaseEnabled = settings.purchase_enabled !== false; // 기본 true
  const archived = getEventPhase(settings) === 'archived';
  // ── [추가 2026-06-29] 일일 운영시간(KST). 설정 누락 시 기본 07~21시. ──
  const dailyOpenHour = settings.bazaar_daily_open_hour ?? BAZAAR_DAILY_OPEN_HOUR_DEFAULT;
  const dailyCloseHour = settings.bazaar_daily_close_hour ?? BAZAAR_DAILY_CLOSE_HOUR_DEFAULT;

  // ── 시간 경계 정밀 재평가 (선판매/공개/종료 + 매일 운영 시작/종료) ──────────
  //   [근본] 고정 30초 폴링 대신 "다음 경계까지" 적응형 setTimeout.
  //   경계가 멀면 ≤30초 폴링(기기 절전/시계 변경 안전망), 가까우면 정확히 경계에 착지
  //   → 버튼이 07:00/21:00 등 경계에서 정확히 토글. 불필요한 매초 재렌더 없음.
  const [boundaryTick, setBoundaryTick] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const toMs = (s: string | null) => (s ? new Date(s).getTime() : null);
    const candidates: number[] = [];
    const push = (ms: number | null) => {
      if (ms != null && Number.isFinite(ms) && ms > now) candidates.push(ms);
    };
    push(toMs(presaleStartUtc));
    push(toMs(publicStartUtc));
    push(toMs(endUtc));
    const dh = resolveDailyHours(now, dailyOpenHour, dailyCloseHour);
    push(dh.opensAtMs);
    push(dh.closesAtMs);
    push(dh.nextOpenMs);

    const next = candidates.length ? Math.min(...candidates) : null;
    // 경계가 없거나 멀면 30초, 가까우면 정확히 그 시각(+250ms 여유, 최소 250ms)
    const delay = next == null ? 30_000 : Math.min(30_000, Math.max(250, next - now + 250));
    const id = setTimeout(() => setBoundaryTick((t) => t + 1), delay);
    return () => clearTimeout(id);
  }, [presaleStartUtc, publicStartUtc, endUtc, dailyOpenHour, dailyCloseHour, boundaryTick]);

  const result = useMemo(() => {
    const toMs = (s: string | null) => (s ? new Date(s).getTime() : null);
    return decideBazaarPurchase({
      nowMs: Date.now(),
      isAdmin,
      isPresaleEligible, // ← [수정 2026-06-26]
      eligibilityResolved, // ← [수정 2026-06-26]
      purchaseEnabled,
      archived,
      presaleStartMs: toMs(presaleStartUtc),
      publicStartMs: toMs(publicStartUtc),
      endMs: toMs(endUtc),
      presaleStartLabel: presaleStartUtc ? formatKSTDate(presaleStartUtc) : undefined,
      publicStartLabel: publicStartUtc ? formatKSTDate(publicStartUtc) : undefined,
      dailyOpenHour, // ← [추가 2026-06-29]
      dailyCloseHour, // ← [추가 2026-06-29]
    });
    // boundaryTick: 시간 경계 재평가 트리거 (값 자체는 미사용)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isAdmin,
    isPresaleEligible, // ← [수정 2026-06-26]
    eligibilityResolved, // ← [수정 2026-06-26]
    purchaseEnabled,
    archived,
    presaleStartUtc,
    publicStartUtc,
    endUtc,
    dailyOpenHour, // ← [추가 2026-06-29]
    dailyCloseHour, // ← [추가 2026-06-29]
    boundaryTick,
  ]);

  const loading = phaseLoading || (!!currentUser && !isAdmin && !eligibilityResolved); // ← [수정 2026-06-26]

  return {
    window: phaseLoading ? 'loading' : result.window,
    canPurchase: phaseLoading ? false : result.canPurchase,
    blockReason: phaseLoading ? null : result.blockReason,
    isAdmin,
    isPresaleEligible, // ← [수정 2026-06-26]
    eligibilityResolved, // ← [수정 2026-06-26]
    presaleStartUtc,
    publicStartUtc,
    endUtc,
    dailyHours: result.dailyHours, // ← [추가 2026-06-29] UI 카운트다운/안내용
    loading,
  };
}
