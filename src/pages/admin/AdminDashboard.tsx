// ============================================================================
// AdminDashboard — 어드민 대시보드 (Phase 5-E 본격)
//
// 섹션:
//   1. 큰 숫자 카드 4개: 총 모금 / 진행률 / 결제 대기 / 참여자 수
//   2. 모금 분포 (바자회 vs 경매)
//   3. 운영 알림 박스
//   4. 인기 TOP 5 (상품 + 경매)
//   5. 게시판 활동 (카테고리별)
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadAdminStats, type AdminStats } from '@/lib/adminStats';
import { loadSetting } from '@/lib/settings';
import type { EsgPostCategory } from '@/types/esg';

const CATEGORY_LABELS: Record<EsgPostCategory, string> = {
  zero_waste: '♻️ 제로 웨이스트',
  wise_life: '🌍 슬기로운 사회 생활',
};

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [goal, setGoal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = async () => {
    try {
      setError(null);
      const [s, g] = await Promise.all([loadAdminStats(), loadSetting('donation_goal')]);
      setStats(s);
      setGoal(g ?? 0);
    } catch (e) {
      console.error('[AdminDashboard]', e);
      setError(e instanceof Error ? e.message : '통계를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    void reload();
  };

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>통계 불러오는 중…</div>;
  }
  if (error || !stats) {
    return (
      <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>
        ⚠️ {error ?? '데이터 없음'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <h2 style={{ margin: 0 }}>📊 대시보드</h2>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: '6px 12px',
            background: refreshing ? '#ccc' : '#fff',
            border: '1px solid #ddd',
            borderRadius: 6,
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          {refreshing ? '🔄 갱신 중…' : '🔄 새로고침'}
        </button>
      </div>

      {/* 1. 큰 숫자 카드 4개 */}
      <BigStatsRow stats={stats} goal={goal} />

      {/* 2. 모금 분포 */}
      <DonationBreakdown stats={stats} />

      {/* 3. 운영 알림 */}
      <OperationsBox stats={stats} />

      {/* 4. 인기 TOP 5 (2단 그리드) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 16,
        }}
      >
        <TopProductsBox stats={stats} />
        <TopAuctionsBox stats={stats} />
      </div>

      {/* 5. 이메일 발송 현황 */}
      <EmailStatusBox stats={stats} />

      {/* 6. 게시판 활동 */}
      <PostsActivityBox stats={stats} />
    </div>
  );
}

// ============================================================================
// 1. 큰 숫자 카드 4개
// ============================================================================

function BigStatsRow({ stats, goal }: { stats: AdminStats; goal: number }) {
  const totalRaised = stats.donation.total_raised;
  const progress = goal > 0 ? Math.min(Math.round((totalRaised / goal) * 100), 100) : 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
      }}
    >
      <BigStatCard
        icon="💰"
        label="총 모금액"
        value={`${totalRaised.toLocaleString()}원`}
        sub={
          goal > 0
            ? `목표 ${goal.toLocaleString()}원 (${progress}%)`
            : '모금 목표 미설정'
        }
        color="#16a34a"
        bg="#dcfce7"
      />
      <BigStatCard
        icon="🎯"
        label="목표 진행률"
        value={`${progress}%`}
        sub={goal > 0 ? `남은 금액 ${Math.max(0, goal - totalRaised).toLocaleString()}원` : '-'}
        color="#0c4a6e"
        bg="#f0f9ff"
        progress={progress}
      />
      <BigStatCard
        icon="⏰"
        label="결제 대기"
        value={`${stats.operations.pendingOrders}건`}
        sub={`미확정 ${stats.operations.pendingAmount.toLocaleString()}원`}
        color="#92400e"
        bg="#fef3c7"
        link="/admin/orders"
      />
      <BigStatCard
        icon="👥"
        label="참여자 수"
        value={`${stats.donation.total_participants}명`}
        sub={`완료된 주문 ${stats.donation.total_paid_orders}건`}
        color="#6b21a8"
        bg="#fdf4ff"
      />
    </div>
  );
}

function BigStatCard({
  icon,
  label,
  value,
  sub,
  color,
  bg,
  progress,
  link,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  color: string;
  bg: string;
  progress?: number;
  link?: string;
}) {
  const content = (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        border: '1px solid #eee',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {progress !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            height: 4,
            width: `${progress}%`,
            background: color,
            transition: 'width 0.3s',
          }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
          }}
        >
          {icon}
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#222', lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{sub}</div>
    </div>
  );

  if (link) {
    return (
      <Link to={link} style={{ textDecoration: 'none', display: 'block' }}>
        {content}
      </Link>
    );
  }
  return content;
}

// ============================================================================
// 2. 모금 분포 (바자회 vs 경매)
// ============================================================================

function DonationBreakdown({ stats }: { stats: AdminStats }) {
  const bazaar = stats.donation.bazaar_raised;
  const auction = stats.donation.auction_raised;
  const total = bazaar + auction;
  const bazaarPct = total > 0 ? Math.round((bazaar / total) * 100) : 0;
  const auctionPct = total > 0 ? 100 - bazaarPct : 0;

  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>💸 모금 분포</h3>

      {total === 0 ? (
        <div style={{ color: '#aaa', fontSize: 13 }}>아직 모금이 시작되지 않았습니다.</div>
      ) : (
        <>
          {/* 가로 막대 */}
          <div
            style={{
              display: 'flex',
              height: 32,
              borderRadius: 8,
              overflow: 'hidden',
              marginBottom: 12,
              border: '1px solid #eee',
            }}
          >
            {bazaar > 0 && (
              <div
                style={{
                  width: `${bazaarPct}%`,
                  background: '#0ea5e9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {bazaarPct > 10 ? `🛍 ${bazaarPct}%` : ''}
              </div>
            )}
            {auction > 0 && (
              <div
                style={{
                  width: `${auctionPct}%`,
                  background: '#a855f7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {auctionPct > 10 ? `🔨 ${auctionPct}%` : ''}
              </div>
            )}
          </div>

          {/* 라벨 */}
          <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
            <BreakdownLabel
              color="#0ea5e9"
              label="🛍 바자회"
              amount={bazaar}
              pct={bazaarPct}
            />
            <BreakdownLabel
              color="#a855f7"
              label="🔨 경매"
              amount={auction}
              pct={auctionPct}
            />
          </div>
        </>
      )}
    </section>
  );
}

function BreakdownLabel({
  color,
  label,
  amount,
  pct,
}: {
  color: string;
  label: string;
  amount: number;
  pct: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
      <div>
        <span style={{ color: '#666' }}>{label}</span>
        <strong style={{ marginLeft: 6, color: '#222' }}>{amount.toLocaleString()}원</strong>
        <span style={{ color: '#aaa', fontSize: 11, marginLeft: 4 }}>({pct}%)</span>
      </div>
    </div>
  );
}

// ============================================================================
// 3. 운영 알림
// ============================================================================

function OperationsBox({ stats }: { stats: AdminStats }) {
  const ops = stats.operations;
  const alerts: Array<{
    icon: string;
    label: string;
    value: number;
    link?: string;
    important?: boolean;
    suffix?: string;
  }> = [
    {
      icon: '💳',
      label: '결제 대기 (입금 확인 필요)',
      value: ops.pendingOrders,
      suffix: ops.pendingOrders > 0 ? `· ${ops.pendingAmount.toLocaleString()}원` : '',
      link: '/admin/orders',
      important: ops.pendingOrders > 0,
    },
    {
      icon: '🔨',
      label: '진행 중 경매',
      value: ops.activeAuctions,
      suffix: ops.auctionsWithNoBids > 0 ? `· 입찰 없음 ${ops.auctionsWithNoBids}건` : '',
      link: '/admin/auctions',
    },
    {
      icon: '📉',
      label: '재고 부족 상품 (가용 < 5)',
      value: ops.lowStockProducts,
      link: '/admin/products',
      important: ops.lowStockProducts > 0,
    },
    {
      icon: '🙈',
      label: '숨김 게시글',
      value: ops.hiddenPosts,
      link: '/admin/posts',
    },
  ];

  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>🚨 운영 알림</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {alerts.map((a) => (
          <AlertRow key={a.label} {...a} />
        ))}
      </div>
    </section>
  );
}

function AlertRow({
  icon,
  label,
  value,
  suffix,
  link,
  important,
}: {
  icon: string;
  label: string;
  value: number;
  suffix?: string;
  link?: string;
  important?: boolean;
}) {
  const content = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        background: important ? '#fef3c7' : '#f9fafb',
        borderRadius: 8,
        border: '1px solid',
        borderColor: important ? '#fde68a' : '#eee',
        cursor: link ? 'pointer' : 'default',
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: important ? '#92400e' : '#444' }}>
        {label}
      </span>
      <strong
        style={{
          fontSize: 14,
          color: important && value > 0 ? '#dc2626' : '#222',
        }}
      >
        {value}건
      </strong>
      {suffix && (
        <span style={{ fontSize: 11, color: '#888' }}>{suffix}</span>
      )}
      {link && value > 0 && (
        <span style={{ fontSize: 11, color: '#0ea5e9' }}>→</span>
      )}
    </div>
  );

  if (link) {
    return (
      <Link to={link} style={{ textDecoration: 'none' }}>
        {content}
      </Link>
    );
  }
  return content;
}

// ============================================================================
// 4. 인기 TOP 5 — 바자회 상품
// ============================================================================

function TopProductsBox({ stats }: { stats: AdminStats }) {
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>🛍 인기 바자회 TOP 5</h3>
      {stats.topProducts.length === 0 ? (
        <div style={{ color: '#aaa', fontSize: 13, padding: 12, textAlign: 'center' }}>
          아직 결제 완료된 주문이 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stats.topProducts.map((p, idx) => (
            <Link
              key={p.product_id}
              to={`/bazaar/${p.product_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 8,
                background: '#f9fafb',
                borderRadius: 6,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span
                style={{
                  width: 24,
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  color: idx === 0 ? '#dc2626' : '#888',
                }}
              >
                {idx + 1}
              </span>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  background: p.thumbnail_url
                    ? `url(${p.thumbnail_url}) center / cover`
                    : '#f0f0f0',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.name}
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {p.total_orders}건 주문 · {p.total_quantity}개 판매
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// 4. 인기 TOP 5 — 경매
// ============================================================================

function TopAuctionsBox({ stats }: { stats: AdminStats }) {
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>🔨 입찰 많은 경매 TOP 5</h3>
      {stats.topAuctions.length === 0 ? (
        <div style={{ color: '#aaa', fontSize: 13, padding: 12, textAlign: 'center' }}>
          아직 경매가 시작되지 않았습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stats.topAuctions.map((a, idx) => (
            <Link
              key={a.auction_id}
              to={`/auction/${a.auction_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 8,
                background: '#f9fafb',
                borderRadius: 6,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span
                style={{
                  width: 24,
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  color: idx === 0 ? '#dc2626' : '#888',
                }}
              >
                {idx + 1}
              </span>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  background: a.thumbnail_url
                    ? `url(${a.thumbnail_url}) center / cover`
                    : '#f0f0f0',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.product_name}
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  🔥 {a.bid_count}회 입찰 · 현재가 {a.current_price.toLocaleString()}원
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// 5. 게시판 활동
// ============================================================================

function PostsActivityBox({ stats }: { stats: AdminStats }) {
  const posts = stats.posts;
  const maxByCategory = Math.max(...Object.values(posts.byCategory), 1);

  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>📝 게시판 활동</h3>

      {/* 요약 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <SummaryStat label="📰 게시글" value={`${posts.totalPublished}건`} />
        <SummaryStat label="❤️ 좋아요" value={`${posts.totalLikes}건`} />
        <SummaryStat label="💬 댓글" value={`${posts.totalComments}건`} />
        <SummaryStat label="🕶 익명 비율" value={`${posts.anonymousRatio}%`} />
      </div>

      {/* 카테고리별 막대 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(Object.keys(posts.byCategory) as EsgPostCategory[]).map((cat) => {
          const count = posts.byCategory[cat];
          const pct = (count / maxByCategory) * 100;
          return (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 140, fontSize: 12, color: '#666', flexShrink: 0 }}>
                {CATEGORY_LABELS[cat]}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 20,
                  background: '#f5f5f5',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: '#0ea5e9',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <strong style={{ width: 40, textAlign: 'right', fontSize: 13 }}>{count}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 10,
        background: '#f9fafb',
        borderRadius: 6,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#222' }}>{value}</div>
    </div>
  );
}

// ============================================================================
// 5. 이메일 발송 현황
// ============================================================================

function EmailStatusBox({ stats }: { stats: AdminStats }) {
  const e = stats.emails;
  const hasIssue = e.failed > 0 || e.dead > 0;

  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        border: hasIssue ? '1px solid #fecaca' : '1px solid transparent',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>
          📨 이메일 발송 현황
          {hasIssue && (
            <span
              style={{
                marginLeft: 8,
                padding: '2px 8px',
                background: '#fee2e2',
                color: '#991b1b',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              ⚠️ 확인 필요
            </span>
          )}
        </h3>
        <Link
          to="/admin/emails"
          style={{
            fontSize: 12,
            color: '#0ea5e9',
            textDecoration: 'none',
          }}
        >
          전체 보기 →
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 8,
        }}
      >
        <EmailStatChip
          label="📬 대기 중"
          value={e.pending}
          color="#92400e"
          bg="#fef3c7"
        />
        <EmailStatChip
          label="✅ 24시간 발송"
          value={e.sent24h}
          color="#166534"
          bg="#dcfce7"
        />
        <EmailStatChip
          label="⚠️ 실패"
          value={e.failed}
          color={e.failed > 0 ? '#dc2626' : '#888'}
          bg={e.failed > 0 ? '#fee2e2' : '#f5f5f5'}
        />
        <EmailStatChip
          label="💀 영구 실패"
          value={e.dead}
          color={e.dead > 0 ? '#991b1b' : '#888'}
          bg={e.dead > 0 ? '#fecaca' : '#f5f5f5'}
        />
      </div>

      {/* 가장 오래된 pending 경고 */}
      {e.oldestPendingAt && Date.now() - new Date(e.oldestPendingAt).getTime() > 5 * 60 * 1000 && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: '#fef3c7',
            border: '1px solid #fde68a',
            color: '#92400e',
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          ⏰ 가장 오래된 대기 메일이 5분 이상 처리되지 않았습니다.{' '}
          Edge Function 또는 cron 상태를 확인하세요.
        </div>
      )}

      {(e.failed > 0 || e.dead > 0) && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          💡 실패한 메일이 있습니다. "전체 보기" → 재시도 가능합니다.
        </div>
      )}
    </section>
  );
}

function EmailStatChip({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div
      style={{
        padding: 12,
        background: bg,
        borderRadius: 8,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, color, opacity: 0.8, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
