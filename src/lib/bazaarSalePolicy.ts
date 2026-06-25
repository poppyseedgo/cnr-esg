// ============================================================================
// bazaarSalePolicy.ts — 바자회 구매 권한 정책 (SSOT, 프레임워크 비의존)
//
// 변경 이력:
//   2026-06-24  최초 작성 — 물품 기부자 선판매 정책 도입
//
// 목적:
//   "지금 이 사용자가 바자회 상품을 구매할 수 있는가?"를 한 곳에서 판정.
//   - 프론트(useBazaarSale 훅)와 노드 시뮬레이션이 동일 함수를 사용 → 정책 1:1 검증.
//   - 서버측 최종 차단은 esg_assert_bazaar_purchasable()(esg_orders BEFORE INSERT 트리거)가
//     동일 규칙으로 수행. (프론트는 UX, 서버는 보안 경계 — 규칙은 한 벌)
//
// 정책 (요구사항 2026-06-24):
//   1) 바자회 시작 전            : 전 직원 '구경만' 가능, 구매 불가
//   2) 선판매 구간(바자회시작~공개시작): 물품 기부자만 구매 가능
//   3) 공개 구간(공개시작~종료)  : 전 직원 구매 가능
//   4) 종료 후                  : 구매 불가
//   - 어드민: 기간/기부자 무관 항상 구매 가능 (비상 중단 토글만 존중 — 기존 동작 유지)
//   - purchase_enabled=false(관리자 비상 중단): 전원 차단(어드민 포함, 기존 동작 유지)
//   - event_phase='archived': 비어드민 차단(어드민은 통과 — 기존 동작 유지)
//
// 시간 경계 (UTC 비교, KST는 표시용):
//   presaleStart = activity_periods.bazaar.starts_at_utc  (기존 SSOT 재사용 = 선판매 시작)
//   publicStart  = esg_settings.bazaar_public_sale_starts_at (신규 1개)
//   end          = activity_periods.bazaar.ends_at_utc
//   → 신규 설정 1개만 추가. 나머지는 기존 값 재사용(중복/드리프트 없음).
// ============================================================================

export type BazaarSaleWindow = 'loading' | 'before' | 'presale' | 'public' | 'ended';

export interface BazaarPolicyInput {
  nowMs: number;                  // 현재 시각(ms) — 호출측이 Date.now() 주입(테스트 주입 가능)
  isAdmin: boolean;               // 관리자 여부 (role='ADMIN' && is_active)
  isDonor: boolean;               // 물품 기부자 여부 (esg_bazaar_intake.donor_id 보유)
  donorResolved: boolean;         // 기부자 판정 완료 여부 (로딩 중 오판 방지)
  purchaseEnabled: boolean;       // 관리자 비상 토글 (false면 전원 차단)
  archived: boolean;              // event_phase === 'archived'
  presaleStartMs: number | null;  // 바자회 구매 시작(=선판매 시작)
  publicStartMs: number | null;   // 전 직원 공개 시작
  endMs: number | null;           // 바자회 구매 종료
  presaleStartLabel?: string;     // 표시용 KST 날짜 (예: "2026. 06. 30.")
  publicStartLabel?: string;      // 표시용 KST 날짜 (예: "2026. 07. 01.")
}

export interface BazaarPolicyResult {
  window: BazaarSaleWindow;
  canPurchase: boolean;
  blockReason: string | null;     // 구매 불가 사유(UI 표시). null = 사유 표시 안 함
}

/** 시간 기반 윈도우 판정 (사용자/권한 무관). 설정 누락 시 'loading'. */
export function resolveWindow(
  input: Pick<BazaarPolicyInput, 'nowMs' | 'presaleStartMs' | 'publicStartMs' | 'endMs'>
): BazaarSaleWindow {
  const { nowMs, presaleStartMs, publicStartMs, endMs } = input;
  // 정책 미구성(설정 누락) → 'loading' 반환, 호출측이 폴백 처리
  if (presaleStartMs == null || publicStartMs == null || endMs == null) return 'loading';
  if (nowMs < presaleStartMs) return 'before';
  if (nowMs < publicStartMs) return 'presale';
  if (nowMs < endMs) return 'public';
  return 'ended';
}

/**
 * 구매 가능 여부 최종 판정.
 * 우선순위: 비상중단 → 어드민 → 아카이브 → 윈도우별 규칙.
 * (서버 트리거 esg_assert_bazaar_purchasable()와 동일한 결정 트리)
 */
export function decideBazaarPurchase(input: BazaarPolicyInput): BazaarPolicyResult {
  const window = resolveWindow(input);

  // 1) 비상 중단(관리자 토글) — 어드민 포함 전원 차단 (기존 동작 유지)
  if (!input.purchaseEnabled) {
    return { window, canPurchase: false, blockReason: '구매가 일시 중단되었습니다 (관리자 설정)' };
  }

  // 2) 어드민 — 기간/기부자 무관 항상 가능
  if (input.isAdmin) {
    return { window, canPurchase: true, blockReason: null };
  }

  // 3) 이벤트 완전 종료(아카이브) — 비어드민 차단
  if (input.archived) {
    return { window, canPurchase: false, blockReason: '이벤트가 종료되었습니다' };
  }

  // 4) 윈도우별 판정 (비어드민)
  switch (window) {
    case 'loading':
      // 정책 미구성/로딩 — 버튼 비활성, 사유 미표시
      return { window, canPurchase: false, blockReason: null };

    case 'before':
      return {
        window,
        canPurchase: false,
        blockReason: input.presaleStartLabel
          ? `${input.presaleStartLabel}부터 판매 시작 예정입니다 (지금은 구경만 가능)`
          : '아직 판매 기간이 아닙니다 (구경만 가능)',
      };

    case 'presale':
      if (!input.donorResolved) {
        // 기부자 판정 진행 중 — 성급한 차단 메시지 방지
        return { window, canPurchase: false, blockReason: '구매 권한 확인 중…' };
      }
      if (input.isDonor) {
        return { window, canPurchase: true, blockReason: null };
      }
      return {
        window,
        canPurchase: false,
        blockReason: input.publicStartLabel
          ? `물품 기부자 선판매 기간입니다. 일반 구매는 ${input.publicStartLabel}부터 가능합니다.`
          : '물품 기부자 선판매 기간입니다. 일반 구매는 곧 시작됩니다.',
      };

    case 'public':
      return { window, canPurchase: true, blockReason: null };

    case 'ended':
      return { window, canPurchase: false, blockReason: '바자회가 종료되었습니다' };

    default:
      return { window, canPurchase: false, blockReason: null };
  }
}
