// ============================================================================
// HomePage — 메인 홈 화면
//
// 5개 활동이 각자 다른 기간을 가지므로:
//   - 메인 카운트다운: "가장 빨리 변하는" 다음 마일스톤 (다음에 열리거나 닫히는 활동)
//   - 5개 활동 카드: 각자 상태 + 카운트다운 표시
//
// 페이즈 archived면 전체 readonly 모드.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadDonationStats } from '@/lib/api';
import { useEventPhase } from '@/hooks/useEventPhase';
import { getCountdown, parseUTC, formatKSTDate } from '@/utils/time';
import type {
  EsgActivityKey,
  EsgActivityPeriod,
  EsgActivityStatus,
  EsgDonationStatsRow,
} from '@/types/esg';

// 활동 메타 (아이콘 + 링크 경로 + 카테고리 그룹)
interface ActivityMeta {
  key: EsgActivityKey;
  icon: string;
  link: string;
  group: 'posting' | 'commerce';
}

const ACTIVITY_META: ActivityMeta[] = [
  { key: 'zero_waste', icon: '♻️', link: '/posts/zero-waste', group: 'posting' },
  { key: 'wise_life', icon: '🤝', link: '/posts/wise-life', group: 'posting' },
  { key: 'bazaar', icon: '🛍', link: '/bazaar', group: 'commerce' },
  { key: 'auction', icon: '🔨', link: '/auction', group: 'commerce' },
];

export function HomePage() {
  const { phase, getActivity, activityPeriods, loading: phaseLoading, settings } =
    useEventPhase();
  const [stats, setStats] = useState<EsgDonationStatsRow | null>(null);
  const [, setNow] = useState(() => new Date());

  // 모금 현황 로드
  useEffect(() => {
    let mounted = true;
    loadDonationStats()
      .then((d) => {
        if (mounted) setStats(d);
      })
      .catch(console.error);
    return () => {
      mounted = false;
    };
  }, []);

  // 1초마다 카운트다운 갱신
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // 메인 카운트다운: 가장 가까운 다음 변경 시점 찾기
  // (시작 전 활동의 starts_at OR 진행 중 활동의 ends_at 중 가장 빠른 것)
  const nextMilestone = findNextMilestone(activityPeriods);

  // 모금 진행률
  const goal = settings.donation_goal ?? 5_000_000;
  const raised = stats?.total_raised ?? 0;
  const progressPct = goal > 0 ? Math.min((raised / goal) * 100, 100) : 0;

  return (
    <div>
      {/* Hero */}
      <section
        style={{
          // ========================================================
          // 배경: hero-bg.jpg + 흰색 그라데이션 오버레이 (가독성)
          // 이미지 교체: public/hero-bg.jpg 파일만 바꾸면 됨
          // 비활성화: 아래 background 라인을 background: '#fff'로 교체
          // ========================================================
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.65), rgba(255,255,255,0.92)), url('/hero-bg.jpg') center / cover no-repeat",
          borderRadius: 16,
          padding: '48px 32px',
          textAlign: 'center',
          marginBottom: 24,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 12 }}>🌱</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800 }}>
          C&R 29주년 ESG 이벤트
        </h1>
        <p style={{ color: '#666', fontSize: 15, margin: '0 0 24px' }}>
          ESG 어워드 · 바자회 · 경매 · 굿즈 수익금 전부 생명의 숲 기부
        </p>

        {phaseLoading ? (
          <p style={{ color: '#999' }}>로딩 중…</p>
        ) : nextMilestone ? (
          <MainCountdown milestone={nextMilestone} />
        ) : phase === 'archived' ? (
          <div style={{ color: '#999' }}>이벤트가 종료되었습니다.</div>
        ) : (
          <div style={{ color: '#999' }}>모든 활동이 종료되었습니다.</div>
        )}
      </section>

      {/* 모금 현황 */}
      <section
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>💰 실시간 모금 현황</h2>
        <div style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: 24, color: '#10b981' }}>
            {raised.toLocaleString()}원
          </strong>
          <span style={{ color: '#999', marginLeft: 8, fontSize: 13 }}>
            / 목표 {goal.toLocaleString()}원
          </span>
        </div>
        <div
          style={{
            height: 12,
            background: '#f0f0f0',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #10b981, #34d399)',
              transition: 'width 0.6s ease',
            }}
          />
        </div>
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            gap: 16,
            color: '#888',
            fontSize: 13,
            flexWrap: 'wrap',
          }}
        >
          <span>참여자 {stats?.total_participants ?? 0}명</span>
          <span>·</span>
          <span>주문 {stats?.total_paid_orders ?? 0}건</span>
          <span>·</span>
          <span>바자회 {(stats?.bazaar_raised ?? 0).toLocaleString()}원</span>
          <span>·</span>
          <span>경매 {(stats?.auction_raised ?? 0).toLocaleString()}원</span>
        </div>
      </section>

      {/* 5개 활동 카드 */}
      <section>
        <h2 style={{ margin: '32px 0 16px', fontSize: 18 }}>📝 ESG 어워드 (게시판)</h2>
        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          }}
        >
          {ACTIVITY_META.filter((a) => a.group === 'posting').map((meta) => {
            const info = getActivity(meta.key);
            return <ActivityCard key={meta.key} meta={meta} info={info} />;
          })}
        </div>

        <h2 style={{ margin: '32px 0 16px', fontSize: 18 }}>🛒 바자회 · 경매</h2>
        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          }}
        >
          {ACTIVITY_META.filter((a) => a.group === 'commerce').map((meta) => {
            const info = getActivity(meta.key);
            return <ActivityCard key={meta.key} meta={meta} info={info} />;
          })}
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// 메인 카운트다운: 가장 가까운 다음 마일스톤
// ============================================================================

interface Milestone {
  activityKey: EsgActivityKey;
  label: string;
  target: string; // UTC ISO
  kind: 'starts' | 'ends';
}

function findNextMilestone(periods: Record<string, EsgActivityPeriod | undefined>): Milestone | null {
  const now = Date.now();
  const candidates: Milestone[] = [];

  for (const meta of ACTIVITY_META) {
    const period = periods[meta.key];
    if (!period) continue;
    const startMs = parseUTC(period.starts_at_utc).getTime();
    const endMs = parseUTC(period.ends_at_utc).getTime();
    if (startMs > now) {
      candidates.push({
        activityKey: meta.key,
        label: `${period.label} 시작까지`,
        target: period.starts_at_utc,
        kind: 'starts',
      });
    } else if (endMs > now) {
      candidates.push({
        activityKey: meta.key,
        label: `${period.label} 종료까지`,
        target: period.ends_at_utc,
        kind: 'ends',
      });
    }
  }

  if (candidates.length === 0) return null;

  // 가장 가까운 시점
  candidates.sort(
    (a, b) => parseUTC(a.target).getTime() - parseUTC(b.target).getTime()
  );
  return candidates[0] ?? null;
}

function MainCountdown({ milestone }: { milestone: Milestone }) {
  const cd = getCountdown(milestone.target);
  return (
    <div style={{ display: 'inline-block' }}>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
        {milestone.label}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <TimeBlock value={cd.days} unit="일" />
        <TimeBlock value={cd.hours} unit="시간" />
        <TimeBlock value={cd.minutes} unit="분" />
        <TimeBlock value={cd.seconds} unit="초" />
      </div>
    </div>
  );
}

function TimeBlock({ value, unit }: { value: number; unit: string }) {
  return (
    <div
      style={{
        background: '#1a1a1a',
        color: '#fff',
        borderRadius: 8,
        padding: '12px 14px',
        minWidth: 64,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700 }}>
        {String(value).padStart(2, '0')}
      </div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{unit}</div>
    </div>
  );
}

// ============================================================================
// 활동 카드
// ============================================================================

function ActivityCard({
  meta,
  info,
}: {
  meta: ActivityMeta;
  info: { period: EsgActivityPeriod | undefined; status: EsgActivityStatus };
}) {
  const { period, status } = info;
  const enabled = status === 'active';

  const statusBadge = (() => {
    switch (status) {
      case 'before':
        return {
          text: period
            ? `${formatKSTDate(period.starts_at_utc)} 시작`
            : '준비 중',
          bg: '#fef3c7',
          color: '#92400e',
        };
      case 'active':
        return { text: '진행 중', bg: '#dcfce7', color: '#166534' };
      case 'closed':
        return { text: '종료', bg: '#f0f0f0', color: '#666' };
    }
  })();

  const inner = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ fontSize: 32 }}>{meta.icon}</div>
        <span
          style={{
            padding: '3px 8px',
            background: statusBadge.bg,
            color: statusBadge.color,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {statusBadge.text}
        </span>
      </div>
      <h3 style={{ margin: '8px 0 6px', fontSize: 15 }}>{period?.label ?? meta.key}</h3>
      {period && (
        <p style={{ margin: 0, color: '#888', fontSize: 12, lineHeight: 1.5 }}>
          {formatKSTDate(period.starts_at_utc)} ~ {formatKSTDate(period.ends_at_utc)}
          {period.awards_date_kst && (
            <>
              <br />
              <span style={{ color: '#0ea5e9' }}>🏆 {period.awards_date_kst} 시상</span>
            </>
          )}
        </p>
      )}
      {period?.note && (
        <p style={{ margin: '8px 0 0', color: '#aaa', fontSize: 11, fontStyle: 'italic' }}>
          {period.note}
        </p>
      )}
    </>
  );

  const baseStyle: React.CSSProperties = {
    display: 'block',
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    textDecoration: 'none',
    color: 'inherit',
  };

  if (!enabled) {
    return <div style={{ ...baseStyle, opacity: 0.7 }}>{inner}</div>;
  }
  return (
    <Link to={meta.link} style={baseStyle}>
      {inner}
    </Link>
  );
}
