// ============================================================================
// 시간 유틸 (KST 기준)
//
// 원칙:
//   - DB는 항상 UTC (timestamptz) 저장. 표시할 때만 KST 변환.
//   - new Date() 직접 사용 금지 — 항상 이 모듈의 함수 경유
//   - C&R Space UTC/KST 9시간 차이 버그 교훈 반영
//
// 핵심 함수:
//   - nowUTC() / nowKST() : 현재 시각
//   - parseUTC(iso) : DB에서 받은 ISO string → Date
//   - formatKST(date, format) : KST 시간대로 포맷팅
//   - getCountdown(ends_at) : 카운트다운 객체
//   - getEventPhase(settings) : 현재 이벤트 페이즈 (시간 기반 + 수동 설정 우선)
// ============================================================================

import type {
  Countdown,
  EsgEventPhase,
  EsgActivityPeriod,
  EsgActivityStatus,
} from '@/types/esg';

// ============================================================================
// 시간대 상수 (현재는 미사용 — Intl.DateTimeFormat이 timezone 변환 담당.
// 향후 timezone 수동 계산 필요 시 참조용으로만 두지 않고, 필요 시점에 import)
// ============================================================================

// ============================================================================
// 현재 시각
// ============================================================================

/** 현재 UTC 시각 (DB 저장용) */
export function nowUTC(): Date {
  return new Date();
}

/**
 * 현재 시각 (Date 객체).
 *
 * ⚠️ 중요: Date 객체는 내부적으로 UTC timestamp를 들고 있고,
 * formatKST*() 함수가 KST timezone으로 변환해서 표시함.
 * 따라서 여기서 +9h 더하면 이중 변환 됨.
 *
 * 변경 이력:
 *   2026-05-26: +KST_OFFSET_MS 제거 (이중 변환 버그 수정).
 *               C&R Space의 UTC/KST 9시간 차이 버그와 동일 패턴.
 */
export function nowKST(): Date {
  return new Date(); // ← +KST_OFFSET_MS 제거 (이중 변환 버그 수정 2026-05-26)
}

/** DB ISO string → Date (UTC) */
export function parseUTC(iso: string): Date {
  return new Date(iso);
}

// ============================================================================
// 포맷팅 (Intl 사용 — 환경 시간대 무관하게 KST 출력 보장)
// ============================================================================

const KST_FORMATTER_FULL = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const KST_FORMATTER_DATE = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const KST_FORMATTER_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const KST_FORMATTER_FULL_WITH_DAY = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "2026. 06. 30. 09:00" 형태 */
export function formatKSTFull(input: string | Date): string {
  const date = typeof input === 'string' ? parseUTC(input) : input;
  return KST_FORMATTER_FULL.format(date);
}

/** "2026. 06. 30." 형태 */
export function formatKSTDate(input: string | Date): string {
  const date = typeof input === 'string' ? parseUTC(input) : input;
  return KST_FORMATTER_DATE.format(date);
}

/** "09:00" 형태 */
export function formatKSTTime(input: string | Date): string {
  const date = typeof input === 'string' ? parseUTC(input) : input;
  return KST_FORMATTER_TIME.format(date);
}

/** "2026. 06. 30. (화) 09:00" 형태 */
export function formatKSTFullWithDay(input: string | Date): string {
  const date = typeof input === 'string' ? parseUTC(input) : input;
  return KST_FORMATTER_FULL_WITH_DAY.format(date);
}

/**
 * 상대 시간 ("방금 전", "3분 전", "2시간 전", "어제", "2일 전", "2026.06.30")
 * 1주일 이상 지나면 절대 날짜로 표시.
 */
export function formatRelativeKST(input: string | Date): string {
  const date = typeof input === 'string' ? parseUTC(input) : input;
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 0) return formatKSTDate(date); // 미래 시각
  if (diffSec < 60) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay === 1) return '어제';
  if (diffDay < 7) return `${diffDay}일 전`;
  return formatKSTDate(date);
}

// ============================================================================
// 카운트다운
// ============================================================================

/**
 * 종료 시점까지 카운트다운 계산.
 * 사용 예:
 *   const cd = getCountdown(auction.ends_at);
 *   // cd.days, cd.hours, cd.minutes, cd.seconds, cd.isEnded
 */
export function getCountdown(endsAt: string | Date): Countdown {
  const end = typeof endsAt === 'string' ? parseUTC(endsAt) : endsAt;
  const diffMs = end.getTime() - Date.now();

  if (diffMs <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
      isEnded: true,
    };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, totalSeconds, isEnded: false };
}

/** 카운트다운 → "3일 02시간 15분" 형태 (선택적 초 표시) */
export function formatCountdown(
  cd: Countdown,
  options: { showSeconds?: boolean } = {}
): string {
  if (cd.isEnded) return '종료';

  const parts: string[] = [];
  if (cd.days > 0) parts.push(`${cd.days}일`);
  if (cd.days > 0 || cd.hours > 0) parts.push(`${String(cd.hours).padStart(2, '0')}시간`);
  parts.push(`${String(cd.minutes).padStart(2, '0')}분`);
  if (options.showSeconds || cd.days === 0) {
    parts.push(`${String(cd.seconds).padStart(2, '0')}초`);
  }

  return parts.join(' ');
}

// ============================================================================
// 이벤트 페이즈 판정 (SSOT)
//
// 우선순위:
//   1. esg_settings.event_phase (수동 설정값) — 운영자 강제 제어 우선
//   2. 시간 기반 자동 판정 — settings 누락 시 fallback
// ============================================================================

/**
 * 현재 이벤트 페이즈 판정.
 * @param settings - esg_settings에서 로드한 설정값 객체
 * @param now - 현재 시각 (테스트용 주입 가능, 기본 nowUTC())
 */
export function getEventPhase(
  settings: {
    event_phase?: EsgEventPhase;
    shop_opens_at?: string;
    shop_closes_at?: string;
  },
  now: Date = nowUTC()
): EsgEventPhase {
  // 운영자 수동 설정이 있으면 그대로 사용 (강제 제어)
  if (settings.event_phase) {
    return settings.event_phase;
  }

  // fallback: 시간 기반 자동 판정
  if (settings.shop_opens_at && settings.shop_closes_at) {
    const opens = parseUTC(settings.shop_opens_at);
    const closes = parseUTC(settings.shop_closes_at);

    if (now < opens) return 'prelude';
    if (now >= opens && now < closes) return 'shop_open';
    return 'shop_closed';
  }

  // 둘 다 없으면 안전한 기본값
  return 'prelude';
}

/** 구매/경매가 활성화되어야 하는 페이즈인지 */
export function isShopActive(phase: EsgEventPhase): boolean {
  return phase === 'shop_open';
}

/** 게시판 작성이 활성화되어야 하는 페이즈인지 (페이즈는 아카이브만 차단) */
export function isPostingActive(phase: EsgEventPhase): boolean {
  return phase !== 'archived';
}

/** 읽기 전용 모드인지 */
export function isReadOnly(phase: EsgEventPhase): boolean {
  return phase === 'archived';
}

// ============================================================================
// 활동별 기간 판정 (zero_waste / wise_life / bazaar / auction)
//
// 단일 page phase 시스템과 별개로, 각 활동의 시간 기반 상태를 판정.
// esg_settings.activity_periods에서 EsgActivityPeriod를 받아 사용.
//
// 사용 예:
//   const periods = settings.activity_periods;
//   const status = getActivityStatus(periods?.bazaar);
//   if (status === 'active') { 구매 버튼 활성 }
// ============================================================================

/**
 * 활동의 현재 상태:
 *   - before: 시작 전 (now < starts_at)
 *   - active: 진행 중 (starts_at <= now < ends_at)
 *   - closed: 종료 (now >= ends_at)
 *
 * 페이즈가 'archived'면 활동 상태와 무관하게 closed로 간주해야 함 (호출자가 처리).
 */
export function getActivityStatus(
  period: EsgActivityPeriod | undefined,
  now: Date = nowUTC()
): EsgActivityStatus {
  if (!period) return 'before'; // 설정 누락 시 안전한 기본값
  const start = parseUTC(period.starts_at_utc);
  const end = parseUTC(period.ends_at_utc);
  if (now < start) return 'before';
  if (now >= end) return 'closed';
  return 'active';
}

/** 진행 중인지 단순 체크 */
export function isActivityActive(
  period: EsgActivityPeriod | undefined,
  now: Date = nowUTC()
): boolean {
  return getActivityStatus(period, now) === 'active';
}

/**
 * 활동의 카운트다운 대상 시각.
 * - before 상태: starts_at (시작까지)
 * - active 상태: ends_at (종료까지)
 * - closed: null
 */
export function getActivityCountdownTarget(
  period: EsgActivityPeriod | undefined,
  now: Date = nowUTC()
): { target: string; label: '시작까지' | '종료까지' } | null {
  if (!period) return null;
  const status = getActivityStatus(period, now);
  if (status === 'before') return { target: period.starts_at_utc, label: '시작까지' };
  if (status === 'active') return { target: period.ends_at_utc, label: '종료까지' };
  return null;
}

// ============================================================================
// 만료 판정
// ============================================================================

/** 주문 만료까지 남은 시간 (분 단위). 음수면 이미 만료. */
export function getMinutesUntilExpiry(expiresAt: string | Date): number {
  const exp = typeof expiresAt === 'string' ? parseUTC(expiresAt) : expiresAt;
  return Math.floor((exp.getTime() - Date.now()) / 60000);
}

/** 주문이 만료됐는지 */
export function isOrderExpired(expiresAt: string | Date): boolean {
  return getMinutesUntilExpiry(expiresAt) < 0;
}
