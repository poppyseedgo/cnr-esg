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

import { useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { loadAdminStats, type AdminStats } from '@/lib/adminStats';
import { loadSetting } from '@/lib/settings';
import type { EsgPostCategory } from '@/types/esg';
// ← [2026-07-10] 실판매 수익 SSOT (전체/이벤트별/랭킹)
import {
  loadRevenueDashboard,
  loadTopItems,
  type RevenueDashboardData,
  type RevenueOverview,
  type TopItem,
  type TopItemDonor,
  type TopBuyer,
  type RevenueEvent,
} from '@/lib/adminRevenue';

const CATEGORY_LABELS: Record<EsgPostCategory, string> = {
  zero_waste: '♻️ 제로 웨이스트',
  wise_life: '🌍 슬기로운 사회 생활',
};

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [revenue, setRevenue] = useState<RevenueDashboardData | null>(null); // ← [2026-07-10] 실판매 수익
  const [goal, setGoal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = async () => {
    try {
      setError(null);
      const [s, g, rev] = await Promise.all([
        loadAdminStats(),
        loadSetting('donation_goal'),
        loadRevenueDashboard(), // ← [2026-07-10] 실판매 수익 SSOT 병렬 로드
      ]);
      setStats(s);
      setGoal(g ?? 0);
      setRevenue(rev); // ← [2026-07-10]
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
  if (error || !stats || !revenue) { // ← [2026-07-10] revenue 도 필수
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
      <BigStatsRow stats={stats} goal={goal} revenue={revenue.overview} />{/* ← [2026-07-10] 실판매 총수익 */}

      {/* 2. 수익 분포 (바자회/경매/굿즈/기부 4분할) ← [2026-07-10] 굿즈+기부 포함 SSOT */}
      <EventRevenueBreakdown overview={revenue.overview} />

      {/* 2-B. 수익 분석 — 최다수익 물건(전체/이벤트별) · 최다수익 기부자 · 최다구매자 ← [2026-07-10] */}
      <RevenueAnalysisSection data={revenue} />

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

function BigStatsRow({
  stats,
  goal,
  revenue,
}: {
  stats: AdminStats;
  goal: number;
  revenue: RevenueOverview; // ← [2026-07-10] 실판매 총수익 SSOT
}) {
  // ← [2026-07-10] 총 모금액 = 실판매 전체수익(바자회+경매+굿즈+기부). 기존 total_raised(굿즈 누락·기부 제외) 대체
  const totalRaised = revenue.total_revenue;
  // ← [2026-07-10] 완료된 구매 주문 수(기부 제외) = 이벤트별 orders 합
  const paidPurchaseOrders =
    revenue.events.bazaar.orders + revenue.events.auction.orders + revenue.events.goods.orders;
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
      {/* ← [2026-07-10] 참여자 = 구매 OR 기부한 순 인원 (revenue SSOT) */}
      <BigStatCard
        icon="👥"
        label="참여자 수"
        value={`${revenue.total_participants}명`}
        sub={`구매 ${paidPurchaseOrders}건 · 기부 ${revenue.events.donation.orders}건`}
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
// 2. 수익 분포 (바자회 / 경매 / 굿즈 / 기부 4분할)
//    ← [2026-07-10] 기존 DonationBreakdown 대체. 굿즈 누락·기부 제외 문제 해결.
//      실판매 SSOT(esg_admin_revenue_overview) 기반 4-way 분해.
// ============================================================================

function EventRevenueBreakdown({ overview }: { overview: RevenueOverview }) {
  const bazaar = overview.events.bazaar.revenue;
  const auction = overview.events.auction.revenue;
  const goods = overview.events.goods.revenue;
  const donation = overview.events.donation.revenue;
  const total = overview.total_revenue;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  // 앞 3조각은 반올림, 마지막(기부)은 잔여로 보정해 합계 100% 유지
  const bazaarPct = pct(bazaar);
  const auctionPct = pct(auction);
  const goodsPct = pct(goods);
  const donationPct = total > 0 ? Math.max(0, 100 - bazaarPct - auctionPct - goodsPct) : 0;

  const slices = [
    { key: 'bazaar', color: '#111', icon: '🛍', label: '바자회', amount: bazaar, pct: bazaarPct },
    { key: 'auction', color: '#a855f7', icon: '🔨', label: '경매', amount: auction, pct: auctionPct },
    { key: 'goods', color: '#2563eb', icon: '🎁', label: '굿즈', amount: goods, pct: goodsPct },
    { key: 'donation', color: '#16a34a', icon: '💚', label: '기부', amount: donation, pct: donationPct },
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
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>💸 수익 분포</h3>
        <div style={{ fontSize: 13, color: '#666' }}>
          전체 <strong style={{ color: '#111' }}>{total.toLocaleString()}원</strong>
          <span style={{ color: '#aaa', marginLeft: 8, fontSize: 11 }}>
            구매 {overview.purchase_revenue.toLocaleString()} · 기부 {overview.donation_revenue.toLocaleString()}
          </span>
        </div>
      </div>

      {total === 0 ? (
        <div style={{ color: '#aaa', fontSize: 13 }}>아직 수익이 발생하지 않았습니다.</div>
      ) : (
        <>
          {/* 가로 막대 (4분할) */}
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
            {slices.map((s) =>
              s.amount > 0 ? (
                <div
                  key={s.key}
                  style={{
                    width: `${s.pct}%`,
                    background: s.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {s.pct > 10 ? `${s.icon} ${s.pct}%` : ''}
                </div>
              ) : null
            )}
          </div>

          {/* 라벨 */}
          <div style={{ display: 'flex', gap: 24, fontSize: 13, flexWrap: 'wrap' }}>
            {slices.map((s) => (
              <BreakdownLabel
                key={s.key}
                color={s.color}
                label={`${s.icon} ${s.label}`}
                amount={s.amount}
                pct={s.pct}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ============================================================================
// 2-B. 수익 분석 — 최다수익 물건(전체/이벤트별) · 최다수익 기부자 · 최다구매자
//    ← [2026-07-10] 요구사항 ④ 데이터 판정 UI
// ============================================================================

const EVENT_TABS: { key: RevenueEvent | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'bazaar', label: '🛍 바자회' },
  { key: 'auction', label: '🔨 경매' },
  { key: 'goods', label: '🎁 굿즈' },
];

function RevenueAnalysisSection({ data }: { data: RevenueDashboardData }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: 16,
      }}
    >
      <TopItemsBox initialItems={data.topItems} />
      <TopDonorsBox donors={data.topDonors} />
      <TopBuyersBox buyers={data.topBuyers} />
    </div>
  );
}

// 최다수익 물건 — 전체/이벤트별 탭 전환 (탭 클릭 시 해당 이벤트 랭킹 재조회)
function TopItemsBox({ initialItems }: { initialItems: TopItem[] }) {
  const [tab, setTab] = useState<RevenueEvent | 'all'>('all');
  const [items, setItems] = useState<TopItem[]>(initialItems);
  const [loading, setLoading] = useState(false);

  const switchTab = async (key: RevenueEvent | 'all') => {
    if (key === tab) return;
    setTab(key);
    setLoading(true);
    try {
      const rows = await loadTopItems(key === 'all' ? null : key, 10); // ← [2026-07-10] 이벤트별 재조회
      setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const eventIcon = (t: string) => (t === 'auction' ? '🔨' : t === 'goods' ? '🎁' : '🛍');

  return (
    <RankCard title="🏆 최다수익 물건 TOP">
      {/* 이벤트 탭 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {EVENT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => void switchTab(t.key)}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              border: '1px solid',
              borderColor: tab === t.key ? '#111' : '#e5e5e5',
              background: tab === t.key ? '#111' : '#fff',
              color: tab === t.key ? '#fff' : '#666',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <EmptyRank text="불러오는 중…" />
      ) : items.length === 0 ? (
        <EmptyRank text="실판매 내역이 없습니다." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it, idx) => (
            <div key={it.item_key} style={rankRow}>
              <RankBadge n={idx + 1} />
              <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tab === 'all' && (
                  <span style={{ marginRight: 4 }}>{eventIcon(it.event_type)}</span>
                )}
                {it.item_name}
              </span>
              <span style={{ fontSize: 11, color: '#999', width: 52, textAlign: 'right' }}>{it.sold_qty}개</span>
              <strong style={{ fontSize: 13, width: 92, textAlign: 'right' }}>
                {it.revenue.toLocaleString()}원
              </strong>
            </div>
          ))}
        </div>
      )}
    </RankCard>
  );
}

// 최다수익 물품 기부자 (바자회+경매 낙찰 귀속)
function TopDonorsBox({ donors }: { donors: TopItemDonor[] }) {
  return (
    <RankCard title="🎖 최다수익 물품 기부자 TOP">
      {donors.length === 0 ? (
        <EmptyRank text="판매된 기부물품이 없습니다." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {donors.map((d, idx) => (
            <div key={d.donor_key} style={rankRow}>
              <RankBadge n={idx + 1} />
              <span style={{ flex: 1, fontSize: 13 }}>
                {d.donor_name}
                <span style={{ color: '#aaa', fontSize: 11, marginLeft: 6 }}>
                  {d.donor_dept ?? (d.is_internal ? '' : '외부')}
                </span>
              </span>
              <span style={{ fontSize: 11, color: '#999', width: 60, textAlign: 'right' }}>
                {d.item_kinds}종·{d.sold_qty}개
              </span>
              <strong style={{ fontSize: 13, width: 92, textAlign: 'right' }}>
                {d.revenue.toLocaleString()}원
              </strong>
            </div>
          ))}
        </div>
      )}
    </RankCard>
  );
}

// 최다구매자 (구매 총액 기준, 이벤트별 분해 툴팁)
function TopBuyersBox({ buyers }: { buyers: TopBuyer[] }) {
  return (
    <RankCard title="💳 최다구매자 TOP">
      {buyers.length === 0 ? (
        <EmptyRank text="완료된 구매가 없습니다." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {buyers.map((b, idx) => (
            <div
              key={b.buyer_key}
              style={rankRow}
              title={`바자회 ${b.bazaar_amount.toLocaleString()} · 경매 ${b.auction_amount.toLocaleString()} · 굿즈 ${b.goods_amount.toLocaleString()}`}
            >
              <RankBadge n={idx + 1} />
              <span style={{ flex: 1, fontSize: 13 }}>
                {b.buyer_name}
                <span style={{ color: '#aaa', fontSize: 11, marginLeft: 6 }}>{b.buyer_dept ?? ''}</span>
              </span>
              <span style={{ fontSize: 11, color: '#999', width: 44, textAlign: 'right' }}>{b.order_count}건</span>
              <strong style={{ fontSize: 13, width: 92, textAlign: 'right' }}>
                {b.total_amount.toLocaleString()}원
              </strong>
            </div>
          ))}
        </div>
      )}
    </RankCard>
  );
}

// 랭킹 카드 공용 셸 / 배지 / 빈 상태 / 행 스타일
function RankCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{title}</h3>
      {children}
    </section>
  );
}

function RankBadge({ n }: { n: number }) {
  const medal = n === 1 ? '#f59e0b' : n === 2 ? '#9ca3af' : n === 3 ? '#b45309' : '#e5e7eb';
  const fg = n <= 3 ? '#fff' : '#666';
  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        background: medal,
        color: fg,
        fontSize: 12,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {n}
    </span>
  );
}

function EmptyRank({ text }: { text: string }) {
  return <div style={{ color: '#aaa', fontSize: 13, padding: 12, textAlign: 'center' }}>{text}</div>;
}

const rankRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  borderRadius: 8,
  background: '#f9fafb',
};

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
        <span style={{ fontSize: 11, color: '#111' }}>→</span>
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
                    background: '#111',
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
            color: '#111',
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
