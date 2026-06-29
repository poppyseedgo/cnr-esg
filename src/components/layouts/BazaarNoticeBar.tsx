// ============================================================================
// BazaarNoticeBar.tsx — 바자회 구매 운영시간 상단 공지바 (풀블리드)
//
// [2026-06-29] 신규. Figma node 1937:399 "공지사항" 기준.
//
// 설계:
//   - /bazaar 목록 페이지 최상단에만 마운트(AppLayout 라우트 게이트). PendingOrderBar와
//     동일하게 app-main(padding:0 20px) 안에서 margin:0 -20px 풀블리드.
//   - [근본] 구매자격(presale) RPC를 호출하지 않음 — 공지바는 "운영시간 + 판매 윈도우"만
//     필요하므로 useEventPhase() 설정에서 resolveWindow / resolveDailyHours 로 직접 계산.
//     (useBazaarSale은 자격 RPC를 돌리므로 여기서 쓰면 불필요한 중복 호출이 됨)
//   - 1초 카운트다운(useNowTick)은 이 컴포넌트에만 격리 → 상품 그리드 재렌더 없음.
//
// 어드민 제어(esg_settings):
//   bazaar_notice_bar_enabled    (boolean)            표시 on/off
//   bazaar_notice_bar_show_when  ('always'|'closed_only')  표시 조건
//   bazaar_notice_bar_message    (string)             문구. {open}/{close} 토큰
//
// 색상:
//   운영 중 = Figma 연녹색(#bdffaf). 운영 외 = 앰버(상태 구분 — SSOT엔 운영중만 정의됨).
// ============================================================================

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventPhase } from '@/hooks/useEventPhase';
import { useNowTick } from '@/hooks/useNowTick';
import {
  resolveWindow,
  resolveDailyHours,
  BAZAAR_DAILY_OPEN_HOUR_DEFAULT,
  BAZAAR_DAILY_CLOSE_HOUR_DEFAULT,
} from '@/lib/bazaarSalePolicy';

const OPEN_BG = '#bdffaf'; // Figma 공지바 배경(연녹색)
const OPEN_FG = '#10220a';
const CLOSED_BG = '#ffe39c'; // 운영 외(앰버)
const CLOSED_FG = '#5c3b00';

const DEFAULT_MESSAGE = '구매는 {open}부터 {close}까지만 가능합니다.';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** ms → "HH:MM:SS" (Figma "01:00:21" 형식) */
function fmtHMS(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${pad2(Math.floor(t / 3600))}:${pad2(Math.floor((t % 3600) / 60))}:${pad2(t % 60)}`;
}

/** 0~24(KST) → "오전 7시" / "오후 8시" (Figma 표기) */
function koAmPm(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const isAm = h < 12;
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${isAm ? '오전' : '오후'} ${display}시`;
}

/** {open}/{close} 토큰을 굵은 시각으로 치환 (Figma는 시각만 bold) */
function renderMessage(template: string, openHour: number, closeHour: number): React.ReactNode[] {
  const map: Record<string, string> = { '{open}': koAmPm(openHour), '{close}': koAmPm(closeHour) };
  return template.split(/(\{open\}|\{close\})/g).map((p, i) =>
    map[p] ? (
      <strong key={i} style={{ fontWeight: 700 }}>{map[p]}</strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export function BazaarNoticeBar() {
  const { settings, loading } = useEventPhase();
  const { isAdmin } = useCurrentUser();
  const nowMs = useNowTick(); // 1초 틱 (카운트다운)

  if (loading) return null;

  // 어드민 설정: 표시 on/off (기본 true)
  if (settings.bazaar_notice_bar_enabled === false) return null;

  // 판매 윈도우 계산 (정책 SSOT 재사용) — presale/public 일 때만 의미 있음
  const toMs = (s: string | null | undefined) => (s ? new Date(s).getTime() : null);
  const saleWindow = resolveWindow({
    nowMs,
    presaleStartMs: toMs(settings.activity_periods?.bazaar?.starts_at_utc),
    publicStartMs: toMs(settings.bazaar_public_sale_starts_at),
    endMs: toMs(settings.activity_periods?.bazaar?.ends_at_utc),
  });
  // 행사가 완전히 종료(ended)된 경우에만 숨김. 시작 전(before)·선판매·공개·설정로딩(loading)은
  // 운영시간 안내가 유효하므로 표시(최종 on/off는 관리자 설정이 제어). // ← [수정 2026-06-29]
  if (saleWindow === 'ended') return null;

  // 운영시간 상태/경계
  const openHour = settings.bazaar_daily_open_hour ?? BAZAAR_DAILY_OPEN_HOUR_DEFAULT;
  const closeHour = settings.bazaar_daily_close_hour ?? BAZAAR_DAILY_CLOSE_HOUR_DEFAULT;
  const dh = resolveDailyHours(nowMs, openHour, closeHour);
  const within = dh.isWithinHours; // 실제 운영시간 내 여부 (관리자도 동일 상태로 표시 → 사용자 화면 검증 가능)

  // 표시 조건: 'closed_only'면 운영 중에는 숨김 (관리자 포함, 실제 운영시간 기준)
  // → 관리자도 운영시간 외에는 사용자와 동일하게 공지바를 볼 수 있음. // ← [수정 2026-06-29]
  const showWhen = settings.bazaar_notice_bar_show_when ?? 'always';
  if (showWhen === 'closed_only' && within) return null;

  const message = (settings.bazaar_notice_bar_message ?? '').trim() || DEFAULT_MESSAGE;
  const messageNodes = renderMessage(message, dh.openHour, dh.closeHour);

  // 카운트다운 — 실제 운영시간 상태 기준(관리자도 동일). 관리자에겐 면제 안내를 별도로 덧붙임.
  const countdown: React.ReactNode = within ? (
    <span>구매 마감까지 <strong style={mono}>{fmtHMS(dh.closesAtMs - nowMs)}</strong> 남음</span>
  ) : (
    <span>구매 시작까지 <strong style={mono}>{fmtHMS(dh.nextOpenMs - nowMs)}</strong> 남음</span>
  );

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        ...barStyle,
        background: within ? OPEN_BG : CLOSED_BG,
        color: within ? OPEN_FG : CLOSED_FG,
      }}
    >
      <p style={{ margin: 0, lineHeight: 1.3 }}>{messageNodes}</p>
      <p style={{ margin: 0, lineHeight: 1.3 }}>{countdown}</p>
      {isAdmin && (
        <p style={{ margin: 0, lineHeight: 1.3, opacity: 0.7, fontWeight: 600 }}>
          · 관리자는 운영시간과 무관하게 구매할 수 있어요
        </p>
      )}
    </div>
  );
}

const mono: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', letterSpacing: 0.3, fontWeight: 700 };

// Figma 1937:399: 풀폭 flat, px16/py12, 14px center, gap8.
// 풀블리드/sticky 는 AppLayout 의 sticky 스택 래퍼가 담당(결제대기 바와 겹침 방지). // ← [2026-06-29]
const barStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '12px 16px',
  fontSize: 14,
  textAlign: 'center',
  fontWeight: 500,
};
