// ============================================================================
// bazaarSalePolicy.ts — 바자회 구매 권한 정책 (SSOT, 프레임워크 비의존)
//
// 변경 이력:
//   2026-06-24  최초 작성 — 물품 기부자 선판매 정책 도입
//   2026-06-26  선구매 자격 확장 — "물품 기부자" → "물품 기부자 OR 기부금 입금확인자".
//               윈도우 구조/우선순위는 그대로, 자격 술어만 확장.
//               isDonor→isPresaleEligible, donorResolved→eligibilityResolved 로 리네임.
//   2026-06-29  일일 구매 운영시간(KST 07~21시 기본) 도입.
//               윈도우(선판매/공개) 통과 후 운영시간 게이트를 AND로 적용.
//               어드민/비상중단/아카이브 우선순위는 불변. dailyHours를 결과에 동봉(UI 카운트다운용).
//               서버 트리거 esg_assert_bazaar_within_hours()가 동일 규칙으로 최종 차단.
//
// 목적:
//   "지금 이 사용자가 바자회 상품을 구매할 수 있는가?"를 한 곳에서 판정.
//   - 프론트(useBazaarSale 훅)와 노드 시뮬레이션이 동일 함수를 사용 → 정책 1:1 검증.
//   - 서버측 최종 차단은 esg_assert_bazaar_purchasable()(esg_orders BEFORE INSERT 트리거)가
//     동일 규칙으로 수행. (프론트는 UX, 서버는 보안 경계 — 규칙은 한 벌)
//
// 정책 (요구사항 2026-06-26):
//   1) 바자회 시작 전            : 전 직원 '구경만' 가능, 구매 불가
//   2) 선구매 구간(바자회시작~공개시작): 물품 기부자 OR 기부금 입금확인자만 구매 가능
//   3) 공개 구간(공개시작~종료)  : 전 직원 구매 가능
//   4) 종료 후                  : 구매 불가
//   - 어드민: 기간/자격 무관 항상 구매 가능 (비상 중단 토글만 존중 — 기존 동작 유지)
//   - purchase_enabled=false(관리자 비상 중단): 전원 차단(어드민 포함, 기존 동작 유지)
//   - event_phase='archived': 비어드민 차단(어드민은 통과 — 기존 동작 유지)
//
// 시간 경계 (UTC 비교, KST는 표시용):
//   presaleStart = activity_periods.bazaar.starts_at_utc  (기존 SSOT 재사용 = 선구매 시작)
//   publicStart  = esg_settings.bazaar_public_sale_starts_at (신규 1개)
//   end          = activity_periods.bazaar.ends_at_utc
//   → 신규 설정 1개만 추가. 나머지는 기존 값 재사용(중복/드리프트 없음).
// ============================================================================

export type BazaarSaleWindow = 'loading' | 'before' | 'presale' | 'public' | 'ended';

export interface BazaarPolicyInput {
  nowMs: number;                  // 현재 시각(ms) — 호출측이 Date.now() 주입(테스트 주입 가능)
  isAdmin: boolean;               // 관리자 여부 (role='ADMIN' && is_active)
  isPresaleEligible: boolean;     // ← [수정 2026-06-26] 선구매 자격(물품 기부자 OR 입금확인 기부자)
  eligibilityResolved: boolean;   // ← [수정 2026-06-26] 자격 판정 완료 여부 (로딩 중 오판 방지)
  purchaseEnabled: boolean;       // 관리자 비상 토글 (false면 전원 차단)
  archived: boolean;              // event_phase === 'archived'
  presaleStartMs: number | null;  // 바자회 구매 시작(=선구매 시작)
  publicStartMs: number | null;   // 전 직원 공개 시작
  endMs: number | null;           // 바자회 구매 종료
  presaleStartLabel?: string;     // 표시용 KST 날짜 (예: "2026. 06. 30.")
  publicStartLabel?: string;      // 표시용 KST 날짜 (예: "2026. 07. 01.")
  // ── [추가 2026-06-29] 일일 구매 운영시간 (KST 시각, 0~24). 미지정 시 기본 07~21시. ──
  dailyOpenHour?: number;         // 구매 가능 시작 시(KST). 기본 7
  dailyCloseHour?: number;        // 구매 가능 종료 시(KST, exclusive). 기본 21
}

// ── [추가 2026-06-29] 일일 운영시간 판정 결과 (UI 카운트다운/안내용) ──────────
export interface DailyHoursInfo {
  openHour: number;               // 적용된 운영 시작 시(KST)
  closeHour: number;              // 적용된 운영 종료 시(KST, exclusive)
  isWithinHours: boolean;         // 지금이 운영시간 내인가
  opensAtMs: number;              // 오늘 운영 시작 시각(UTC ms)
  closesAtMs: number;             // 오늘 운영 종료 시각(UTC ms)
  /** 다음 운영 시작 시각(UTC ms). 운영시간 내면 내일 시작, 운영 전이면 오늘 시작, 운영 후면 내일 시작 */
  nextOpenMs: number;
}

export interface BazaarPolicyResult {
  window: BazaarSaleWindow;
  canPurchase: boolean;
  blockReason: string | null;     // 구매 불가 사유(UI 표시). null = 사유 표시 안 함
  // ── [추가 2026-06-29] 운영시간 상태 — UI 실시간 카운트다운/안내가 경계값을 재계산 없이 사용 ──
  dailyHours: DailyHoursInfo;
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

// ============================================================================
// [추가 2026-06-29] 일일 구매 운영시간 (KST 07:00 ~ 21:00 기본)
//
// 원칙:
//   - 운영시간은 "사용자 구매가 가능한 매일의 시간대"를 뜻함 (선판매/공개 윈도우와 직교).
//   - KST는 DST가 없어 항상 UTC+9 고정 → 경계(UTC ms) 계산이 정확.
//   - 표시는 KST, 비교/저장은 UTC (프로젝트 전반 원칙과 동일).
//   - 어드민은 이 운영시간에서 면제 (decideBazaarPurchase가 처리).
// ============================================================================

/** 기본 운영시간 (설정 누락 시 폴백). 서버 트리거 기본값과 반드시 일치시킬 것. */
export const BAZAAR_DAILY_OPEN_HOUR_DEFAULT = 7;
export const BAZAAR_DAILY_CLOSE_HOUR_DEFAULT = 21;

/** KST 고정 오프셋(ms). 경계 산술 전용 — 표시 변환에는 Intl을 쓰므로 여기서만 사용. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * nowMs(UTC) 기준 "KST 달력상 오늘 날짜의 hour:00:00(KST)"에 해당하는 UTC ms.
 * KST=UTC+9 고정이라 wall-clock instant ↔ UTC 변환이 결정적.
 */
function kstHourBoundaryMs(nowMs: number, hour: number): number {
  const kstWall = new Date(nowMs + KST_OFFSET_MS); // UTC 필드 = KST 벽시계
  const y = kstWall.getUTCFullYear();
  const mo = kstWall.getUTCMonth();
  const d = kstWall.getUTCDate();
  const targetWallAsUtc = Date.UTC(y, mo, d, hour, 0, 0, 0); // KST 벽시계 시각을 UTC 필드로
  return targetWallAsUtc - KST_OFFSET_MS;                    // → 진짜 UTC instant
}

/** 시·분 음수/비정상 입력을 안전한 범위로 정규화 */
function clampHours(openHour: number, closeHour: number): { open: number; close: number } {
  const open = Number.isFinite(openHour) ? Math.min(23, Math.max(0, Math.floor(openHour))) : BAZAAR_DAILY_OPEN_HOUR_DEFAULT;
  const closeRaw = Number.isFinite(closeHour) ? Math.min(24, Math.max(1, Math.floor(closeHour))) : BAZAAR_DAILY_CLOSE_HOUR_DEFAULT;
  // close는 open보다 커야 함 (역전 시 기본값으로 폴백)
  const close = closeRaw > open ? closeRaw : BAZAAR_DAILY_CLOSE_HOUR_DEFAULT;
  return { open, close };
}

/**
 * 현재 운영시간 상태 + 경계 시각 산출.
 * @param nowMs 현재 UTC ms
 * @param openHour 운영 시작 시(KST)
 * @param closeHour 운영 종료 시(KST, exclusive)
 */
export function resolveDailyHours(
  nowMs: number,
  openHour: number = BAZAAR_DAILY_OPEN_HOUR_DEFAULT,
  closeHour: number = BAZAAR_DAILY_CLOSE_HOUR_DEFAULT
): DailyHoursInfo {
  const { open, close } = clampHours(openHour, closeHour);
  const opensAtMs = kstHourBoundaryMs(nowMs, open);
  const closesAtMs = kstHourBoundaryMs(nowMs, close);
  const DAY = 24 * 60 * 60 * 1000;

  let isWithinHours: boolean;
  let nextOpenMs: number;
  if (nowMs < opensAtMs) {
    // 오늘 운영 시작 전 → 오늘 시작이 다음 오픈
    isWithinHours = false;
    nextOpenMs = opensAtMs;
  } else if (nowMs < closesAtMs) {
    // 운영 중
    isWithinHours = true;
    nextOpenMs = opensAtMs + DAY; // 참고용(내일 오픈)
  } else {
    // 오늘 운영 종료 후 → 내일 시작이 다음 오픈
    isWithinHours = false;
    nextOpenMs = opensAtMs + DAY;
  }

  return { openHour: open, closeHour: close, isWithinHours, opensAtMs, closesAtMs, nextOpenMs };
}

/** "07:00", "21:00" 같은 시:분 라벨 */
function hourLabel(hour: number): string {
  return `${String(hour % 24).padStart(2, '0')}:00`;
}

/**
 * 구매 가능 여부 최종 판정.
 * 우선순위: 비상중단 → 어드민 → 아카이브 → 윈도우별 규칙.
 * (서버 트리거 esg_assert_bazaar_purchasable()와 동일한 결정 트리)
 */
export function decideBazaarPurchase(input: BazaarPolicyInput): BazaarPolicyResult {
  const window = resolveWindow(input);

  // ── [추가 2026-06-29] 운영시간 상태는 항상 계산해 결과에 포함 (UI 카운트다운/안내용) ──
  const dailyHours = resolveDailyHours(input.nowMs, input.dailyOpenHour, input.dailyCloseHour);

  // 결과 빌더 (dailyHours를 항상 동봉) — 분기마다 누락 없도록 일원화
  const make = (canPurchase: boolean, blockReason: string | null): BazaarPolicyResult => ({
    window,
    canPurchase,
    blockReason,
    dailyHours,
  });

  // 운영시간 외 차단 메시지 (윈도우는 통과했지만 시간대가 아님)
  const outsideHoursReason = `지금은 구매 운영시간이 아니에요 (매일 ${hourLabel(dailyHours.openHour)}~${hourLabel(dailyHours.closeHour)})`;

  // 윈도우가 구매를 허용할 때, 운영시간까지 통과해야 최종 허용.
  // (어드민은 이 함수에 도달하기 전에 이미 통과 처리되므로 여기 비어드민만 해당)
  const allowIfWithinHours = (): BazaarPolicyResult =>
    dailyHours.isWithinHours ? make(true, null) : make(false, outsideHoursReason);

  // 1) 비상 중단(관리자 토글) — 어드민 포함 전원 차단 (기존 동작 유지)
  if (!input.purchaseEnabled) {
    return make(false, '구매가 일시 중단되었습니다 (관리자 설정)');
  }

  // 2) 어드민 — 기간/자격/운영시간 무관 항상 가능 (테스트·관리용, 기존 동작 유지)
  if (input.isAdmin) {
    return make(true, null);
  }

  // 3) 이벤트 완전 종료(아카이브) — 비어드민 차단
  if (input.archived) {
    return make(false, '이벤트가 종료되었습니다');
  }

  // 4) 윈도우별 판정 (비어드민) — 윈도우 통과 후 운영시간 게이트 적용
  switch (window) {
    case 'loading':
      // 정책 미구성/로딩 — 버튼 비활성, 사유 미표시
      return make(false, null);

    case 'before':
      return make(
        false,
        input.presaleStartLabel
          ? `${input.presaleStartLabel}부터 판매 시작 예정입니다 (지금은 구경만 가능)`
          : '아직 판매 기간이 아닙니다 (구경만 가능)'
      );

    case 'presale':
      if (!input.eligibilityResolved) {
        // 자격 판정 진행 중 — 성급한 차단 메시지 방지 (← [수정 2026-06-26])
        return make(false, '구매 권한 확인 중…');
      }
      if (input.isPresaleEligible) {
        // 물품 기부자 OR 입금확인 기부자 — 선구매 허용. 단, 운영시간 내여야 최종 허용. (← [추가 2026-06-29])
        return allowIfWithinHours();
      }
      return make(
        false,
        input.publicStartLabel
          ? `선구매 기간입니다(물품 기부자·기부금 입금 확인자 한정). 일반 구매는 ${input.publicStartLabel}부터 가능합니다.`
          : '선구매 기간입니다(물품 기부자·기부금 입금 확인자 한정). 일반 구매는 곧 시작됩니다.'
      );

    case 'public':
      // 전 직원 공개 구매. 단, 운영시간 내여야 최종 허용. (← [추가 2026-06-29])
      return allowIfWithinHours();

    case 'ended':
      return make(false, '바자회가 종료되었습니다');

    default:
      return make(false, null);
  }
}
