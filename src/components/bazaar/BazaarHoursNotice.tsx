// ============================================================================
// BazaarHoursNotice.tsx — 바자회 일일 구매 운영시간 실시간 안내/카운트다운
//
// [2026-06-29] 신규.
//
// 목적:
//   "지금 구매 가능한가 / 언제부터 가능한가"를 한 줄 배너 + 1초 카운트다운으로 안내.
//   - 운영 중: "지금 구매 가능 · 오늘 종료까지 HH:MM:SS"
//   - 운영 외: "운영시간이 아니에요 · 구매 시작까지 HH:MM:SS (07:00 오픈)"
//   - 어드민: 운영시간 무관 안내 (제한 없음)
//
// 설계:
//   - 게이팅 판정은 useBazaarSale()(정책 SSOT) 결과만 사용 — 시각 경계는 dailyHours로 수신.
//   - 카운트다운 1초 갱신은 전역 단일 틱 useNowTick() 사용(타이머 N개 방지).
//   - 표면(목록/상세/장바구니/결제)에 공통 배치. 버튼 활성/비활성은 정책이 별도 담당.
//
// 표시 정책:
//   - loading 또는 윈도우가 presale/public 이 아닐 때(before/ended/loading)는 렌더 안 함.
//     (해당 구간은 각 페이지의 기존 안내가 처리 — 운영시간은 아직 '구속 조건'이 아님)
// ============================================================================

import { useBazaarSale } from '@/hooks/useBazaarSale';
import { useNowTick } from '@/hooks/useNowTick';
import { formatKSTTime } from '@/utils/time';

/** 남은 ms → "H:MM:SS" (시가 0이면 "MM:SS"). 음수는 0으로. */
function fmtHMS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export interface BazaarHoursNoticeProps {
  /** 슬림 버전(장바구니/결제처럼 공간이 좁은 곳). 기본 false. */
  compact?: boolean;
  /** 바깥 여백 커스터마이즈(기본 위/아래 약간). */
  style?: React.CSSProperties;
}

export function BazaarHoursNotice({ compact = false, style }: BazaarHoursNoticeProps) {
  const { window: saleWindow, dailyHours, isAdmin, loading } = useBazaarSale();
  const nowMs = useNowTick(); // 1초 틱 (카운트다운 갱신)

  // 로딩 중엔 표시하지 않음 (경계 미확정)
  if (loading) return null;

  // 판매 윈도우가 아니면(시작 전/종료/로딩) 운영시간은 아직 구속 조건이 아님 → 표시 안 함
  if (saleWindow !== 'presale' && saleWindow !== 'public') return null;

  const openLabel = formatKSTTime(new Date(dailyHours.opensAtMs)); // "07:00"
  const closeLabel = formatKSTTime(new Date(dailyHours.closesAtMs)); // "21:00"
  const hoursRange = `${openLabel}~${closeLabel}`;

  // 어드민: 운영시간 제한 없음 안내(차분한 회색)
  if (isAdmin) {
    return (
      <div style={{ ...baseBox(compact), ...adminBox, ...style }}>
        <span>🔧 관리자는 운영시간과 무관하게 구매할 수 있어요</span>
        <span style={{ opacity: 0.8 }}>· 일반 사용자 운영시간 매일 {hoursRange}</span>
      </div>
    );
  }

  if (dailyHours.isWithinHours) {
    // 운영 중 — 오늘 종료까지 카운트다운
    const left = dailyHours.closesAtMs - nowMs;
    return (
      <div style={{ ...baseBox(compact), ...openBox, ...style }}>
        <span>🟢 구매 운영 중</span>
        <span style={{ opacity: 0.85 }}>· 운영시간 매일 {hoursRange}</span>
        <span style={dot} aria-hidden />
        <span>
          오늘 종료까지{' '}
          <strong style={mono}>{fmtHMS(left)}</strong>
        </span>
      </div>
    );
  }

  // 운영 외 — 다음 오픈까지 카운트다운
  const left = dailyHours.nextOpenMs - nowMs;
  const nextOpenLabel = formatKSTTime(new Date(dailyHours.nextOpenMs)); // "07:00"
  return (
    <div style={{ ...baseBox(compact), ...closedBox, ...style }}>
      <span>🕖 지금은 구매 운영시간이 아니에요</span>
      <span style={{ opacity: 0.85 }}>· 매일 {hoursRange} 구매 가능</span>
      <span style={dot} aria-hidden />
      <span>
        구매 시작까지{' '}
        <strong style={mono}>{fmtHMS(left)}</strong>{' '}
        <span style={{ opacity: 0.85 }}>({nextOpenLabel} 오픈)</span>
      </span>
    </div>
  );
}

// ── 스타일 (앱 전반의 인라인 스타일 + 기존 amber/green 팔레트와 일치) ──────────
function baseBox(compact: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    padding: compact ? '8px 12px' : '10px 14px',
    borderRadius: 8,
    fontSize: compact ? 12 : 13,
    lineHeight: 1.5,
    fontWeight: 600,
    margin: '12px 0',
  };
}

const openBox: React.CSSProperties = { background: '#dcfce7', color: '#166534' };
const closedBox: React.CSSProperties = { background: '#fef3c7', color: '#92400e' };
const adminBox: React.CSSProperties = { background: '#f1f5f9', color: '#475569', fontWeight: 500 };

const mono: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', letterSpacing: 0.3 };
const dot: React.CSSProperties = {
  width: 3,
  height: 3,
  borderRadius: '50%',
  background: 'currentColor',
  opacity: 0.5,
  display: 'inline-block',
};
