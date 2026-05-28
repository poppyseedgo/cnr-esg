// ============================================================================
// HomePage — 메인 홈 화면
//
// 구성:
//   - HomeHero  : 풀블리드 포스터 그리드 (Figma 914:1700) — 구 이모지 Hero 대체
//   - 모금 현황  : 실시간 모금 진행률
//   - 활동 카드  : 각 활동 상태/기간 (※ 포스터 그리드와 내비 중복 → 정리 예정)
//
// 2026-05-28 변경: 구 이모지 Hero + 메인 카운트다운 제거(신규 Figma 디자인에 없음),
//                  HomeHero 로 교체. 카운트다운 복원/이전 필요 시 별도 요청.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadDonationStats } from '@/lib/api';
import { useEventPhase } from '@/hooks/useEventPhase';
import { formatKSTDate } from '@/utils/time'; // ← [정리] getCountdown/parseUTC 제거(카운트다운 삭제)
import { HomeHero } from '@/components/home/HomeHero'; // ← [신규] 풀블리드 포스터 그리드
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
  const { getActivity, settings } = useEventPhase(); // ← [정리] phase/activityPeriods/phaseLoading 제거(카운트다운 삭제)
  const [stats, setStats] = useState<EsgDonationStatsRow | null>(null);

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

  // 모금 진행률
  const goal = settings.donation_goal ?? 5_000_000;
  const raised = stats?.total_raised ?? 0;
  const progressPct = goal > 0 ? Math.min((raised / goal) * 100, 100) : 0;

  return (
    <div>
      <HomeHero /> {/* ← [신규] 풀블리드 포스터 그리드 (구 이모지 Hero + 카운트다운 대체) */}


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
