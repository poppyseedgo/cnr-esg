// ============================================================================
// MyPage — 마이페이지 (5개 탭)
//
// - 결제대기: payment_status='pending' (만료된 것 포함)
// - 결제완료: payment_status='paid'
// - 경매참여: Phase 4-A에서 구현
// - 경매낙찰: Phase 4-A에서 구현
// - 찜한상품: Phase 4-B 또는 Phase 6
// ============================================================================

import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  loadMyOrders,
  subscribeMyOrders,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  formatTimeLeft,
  getOrderTimeLeft,
  type OrderWithItems,
} from '@/lib/orders';
import {
  loadMyBidAuctions,
  subscribeAuctions,
  getAuctionTimeLeft,
  AUCTION_STATUS_LABELS,
  AUCTION_STATUS_COLORS,
  type MyBidAuction,
} from '@/lib/auctions';
import { formatKSTFull } from '@/utils/time';
import { loadMyDonations, getDonationTimeLeft, subscribeMyDonations } from '@/lib/donations';
import type { EsgDonationRow } from '@/types/esg';

const tabs = [
  { to: '/mypage/pending', label: '결제대기' },
  { to: '/mypage/completed', label: '결제완료' },
  { to: '/mypage/bidding', label: '경매참여' },
  { to: '/mypage/auction-won', label: '경매 낙찰' },
  { to: '/mypage/wishlist', label: '찜한상품' },
  { to: '/mypage/donations', label: '💚 기부내역' },
];

export function MyPage() {
  const { currentUser } = useCurrentUser();
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      <h1>👤 마이페이지</h1>
      <p style={{ color: '#666' }}>
        {currentUser?.name}님 ({currentUser?.email})
      </p>
      <nav
        style={{
          display: 'flex',
          gap: 8,
          margin: '24px 0',
          flexWrap: 'wrap',
          borderBottom: '1px solid #eee',
          paddingBottom: 12,
        }}
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            style={({ isActive }) => ({
              padding: '6px 12px',
              borderRadius: 6,
              textDecoration: 'none',
              background: isActive ? '#1a1a1a' : '#fff',
              color: isActive ? '#fff' : '#444',
              border: '1px solid',
              borderColor: isActive ? '#1a1a1a' : '#ddd',
              fontSize: 13,
            })}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

// ============================================================================
// 결제대기 (pending)
// ============================================================================

export function MyPagePending() {
  const { currentUser } = useCurrentUser();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const reload = async () => {
    if (!currentUser) return;
    try {
      setError(null);
      const list = await loadMyOrders(currentUser.id, {
        statuses: ['pending'],
        orderType: 'bazaar',
      });
      setOrders(list);
    } catch (e) {
      console.error('[MyPagePending]', e);
      setError(e instanceof Error ? e.message : '주문을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    const cleanup = subscribeMyOrders(currentUser.id, () => {
      void reload();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // 카운트다운 갱신 (1초마다 - 초 단위 표시)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <LoadingBox />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (orders.length === 0) {
    return (
      <EmptyState
        icon="💳"
        title="입금 대기 중인 주문이 없습니다"
        description="바자회에서 상품을 주문해보세요."
        ctaLabel="바자회로 가기"
        ctaTo="/bazaar"
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          padding: 12,
          background: '#f0f9ff',
          color: '#0c4a6e',
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        ℹ️ 주문 당일 23:59까지 입금하지 않으면 주문이 자동 취소됩니다.
        주문 후 사용자가 직접 취소할 수는 없습니다.
      </div>
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} showCountdown />
      ))}
    </div>
  );
}

// ============================================================================
// 결제완료 (paid)
// ============================================================================

export function MyPageCompleted() {
  const { currentUser } = useCurrentUser();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    if (!currentUser) return;
    try {
      setError(null);
      const list = await loadMyOrders(currentUser.id, {
        statuses: ['paid'],
        orderType: 'bazaar',
      });
      setOrders(list);
    } catch (e) {
      console.error('[MyPageCompleted]', e);
      setError(e instanceof Error ? e.message : '주문을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    const cleanup = subscribeMyOrders(currentUser.id, () => {
      void reload();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  if (loading) return <LoadingBox />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (orders.length === 0) {
    return (
      <EmptyState
        icon="✅"
        title="결제 완료된 주문이 없습니다"
        description="입금이 확인되면 여기에 표시됩니다."
        ctaLabel="결제대기 보기"
        ctaTo="/mypage/pending"
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} />
      ))}
    </div>
  );
}

// ============================================================================
// 미구현 탭 (Phase 4 / Phase 6)
// ============================================================================

// ============================================================================
// 경매 참여 (내가 입찰한 경매 — 진행 중 + 종료된 것 모두)
// ============================================================================

export function MyPageBidding() {
  const { currentUser } = useCurrentUser();
  const [myBids, setMyBids] = useState<MyBidAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const reload = async () => {
    if (!currentUser) return;
    try {
      setError(null);
      const list = await loadMyBidAuctions(currentUser.id);
      setMyBids(list);
    } catch (e) {
      console.error('[MyPageBidding]', e);
      setError(e instanceof Error ? e.message : '경매 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // 경매 상태/현재가가 변경되면 즉시 갱신
  useEffect(() => {
    if (!currentUser) return;
    const cleanup = subscribeAuctions(() => {
      void reload();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // 카운트다운 갱신
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <LoadingBox />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (myBids.length === 0) {
    return (
      <EmptyState
        icon="🔨"
        title="참여 중인 경매가 없습니다"
        description="경매에 입찰해보세요."
        ctaLabel="경매로 가기"
        ctaTo="/auction"
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {myBids.map((m) => (
        <BidAuctionCard key={m.auction.id} myBid={m} />
      ))}
    </div>
  );
}

// ============================================================================
// 경매 낙찰 (내가 winner인 경매)
// ============================================================================

export function MyPageAuctionWon() {
  const { currentUser } = useCurrentUser();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    if (!currentUser) return;
    try {
      setError(null);
      const list = await loadMyOrders(currentUser.id, { orderType: 'auction' });
      setOrders(list);
    } catch (e) {
      console.error('[MyPageAuctionWon]', e);
      setError(e instanceof Error ? e.message : '낙찰 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    const cleanup = subscribeMyOrders(currentUser.id, () => {
      void reload();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  if (loading) return <LoadingBox />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (orders.length === 0) {
    return (
      <EmptyState
        icon="🏆"
        title="낙찰받은 경매가 없습니다"
        description="경매에 참여하여 한정 굿즈를 낙찰받아보세요."
        ctaLabel="경매로 가기"
        ctaTo="/auction"
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} showCountdown />
      ))}
    </div>
  );
}

export function MyPageWishlist() {
  return <PlaceholderTab icon="💖" label="찜한 상품" phase="Phase 4-B 또는 Phase 6" />;
}

// ============================================================================
// 공통 컴포넌트
// ============================================================================

function OrderCard({
  order,
  showCountdown = false,
}: {
  order: OrderWithItems;
  showCountdown?: boolean;
}) {
  const statusColor = PAYMENT_STATUS_COLORS[order.payment_status];
  const timeLeftMs = getOrderTimeLeft(order.expires_at);
  const isExpired = timeLeftMs <= 0 && order.payment_status === 'pending';
  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
  const firstItem = order.items[0];

  return (
    <Link
      to={`/orders/${order.order_number}`}
      style={{
        display: 'block',
        background: '#fff',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        border: '1px solid #eee',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>
          {order.order_number}
        </div>
        <span
          style={{
            padding: '2px 8px',
            background: statusColor.bg,
            color: statusColor.color,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {PAYMENT_STATUS_LABELS[order.payment_status]}
          {isExpired && ' (만료)'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {firstItem && (
          <div
            style={{
              width: 56,
              height: 56,
              flexShrink: 0,
              borderRadius: 8,
              background: firstItem.thumbnail_snapshot
                ? `url(${firstItem.thumbnail_snapshot}) center / cover`
                : '#f5f5f5',
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {firstItem?.product_name_snapshot ?? '(상품 없음)'}
            {order.items.length > 1 && (
              <span style={{ color: '#888', fontWeight: 400 }}>
                {' '}외 {order.items.length - 1}건
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>
            {totalQty}개 · {formatKSTFull(order.created_at)}
          </div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {order.total_amount.toLocaleString()}원
        </div>
      </div>

      {showCountdown && order.payment_status === 'pending' && !isExpired && (
        <div
          style={{
            marginTop: 12,
            padding: '6px 10px',
            background: timeLeftMs < 3600 * 1000 ? '#fee2e2' : '#fef3c7',
            color: timeLeftMs < 3600 * 1000 ? '#991b1b' : '#92400e',
            borderRadius: 6,
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          ⏰ 입금 기한 {formatTimeLeft(timeLeftMs)} 남음
        </div>
      )}
    </Link>
  );
}

function LoadingBox() {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      style={{
        padding: 16,
        background: '#fee2e2',
        color: '#991b1b',
        borderRadius: 8,
        textAlign: 'center',
      }}
    >
      <div style={{ marginBottom: 8 }}>⚠️ {message}</div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: '6px 14px',
          background: '#fff',
          border: '1px solid #fecaca',
          color: '#991b1b',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        다시 시도
      </button>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  ctaTo,
}: {
  icon: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaTo: string;
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 48,
        textAlign: 'center',
        border: '1px dashed #ddd',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>{icon}</div>
      <h3 style={{ margin: '0 0 8px' }}>{title}</h3>
      <p style={{ color: '#888', marginBottom: 24 }}>{description}</p>
      <Link
        to={ctaTo}
        style={{
          display: 'inline-block',
          padding: '10px 20px',
          background: '#1a1a1a',
          color: '#fff',
          borderRadius: 8,
          textDecoration: 'none',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

function PlaceholderTab({ icon, label, phase }: { icon: string; label: string; phase: string }) {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: '#999' }}>
      <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>{icon}</div>
      <h3 style={{ margin: '0 0 4px' }}>{label}</h3>
      <p style={{ fontSize: 12, margin: 0 }}>{phase}에서 구현 예정</p>
    </div>
  );
}

// ============================================================================
// BidAuctionCard - 내 입찰 경매 카드
// ============================================================================

function BidAuctionCard({ myBid }: { myBid: MyBidAuction }) {
  const { auction, myMaxBid, myBidCount, amIWinner, amIHighestBidder } = myBid;
  const statusColor = AUCTION_STATUS_COLORS[auction.status];
  const timeLeftMs = getAuctionTimeLeft(auction.ends_at);

  // 상태 표시: 본인이 처한 상황 기준
  let myStatusBadge: { text: string; bg: string; color: string };
  if (amIWinner) {
    myStatusBadge = { text: '🏆 낙찰', bg: '#dcfce7', color: '#166534' };
  } else if (auction.status === 'active' && amIHighestBidder) {
    myStatusBadge = { text: '🔥 최고가 보유', bg: '#fef3c7', color: '#92400e' };
  } else if (auction.status === 'active') {
    myStatusBadge = { text: '입찰 중 (밀림)', bg: '#fee2e2', color: '#991b1b' };
  } else if (auction.status === 'ended') {
    myStatusBadge = { text: '낙찰 실패', bg: '#f0f0f0', color: '#666' };
  } else {
    myStatusBadge = { text: AUCTION_STATUS_LABELS[auction.status], bg: statusColor.bg, color: statusColor.color };
  }

  return (
    <Link
      to={`/auction/${auction.id}`}
      style={{
        display: 'block',
        background: '#fff',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        border: '1px solid #eee',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span
          style={{
            padding: '2px 8px',
            background: myStatusBadge.bg,
            color: myStatusBadge.color,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {myStatusBadge.text}
        </span>
        {auction.status === 'active' && timeLeftMs > 0 && (
          <span
            style={{
              fontSize: 11,
              color: timeLeftMs < 3600 * 1000 ? '#991b1b' : '#92400e',
              fontWeight: 600,
            }}
          >
            ⏰ {formatTimeLeft(timeLeftMs)}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div
          style={{
            width: 56,
            height: 56,
            flexShrink: 0,
            borderRadius: 8,
            background: auction.thumbnail_url
              ? `url(${auction.thumbnail_url}) center / cover`
              : '#f5f5f5',
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {auction.product_name}
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>
            내 최고 입찰: <strong>{myMaxBid.toLocaleString()}원</strong> · {myBidCount}회 입찰
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#888' }}>
            {auction.status === 'ended' ? '낙찰가' : '현재가'}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {auction.current_price.toLocaleString()}원
          </div>
        </div>
      </div>
    </Link>
  );
}

// ============================================================================
// 내 기부 내역
// ============================================================================

export function MyPageDonations() {
  const { currentUser } = useCurrentUser();
  const [donations, setDonations] = useState<EsgDonationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    const reload = async () => {
      try {
        setError(null);
        const data = await loadMyDonations(currentUser.id);
        setDonations(data);
      } catch (e) {
        console.error('[MyPageDonations]', e);
        setError(e instanceof Error ? e.message : '불러오기 실패');
      } finally {
        setLoading(false);
      }
    };
    void reload();
    const cleanup = subscribeMyDonations(currentUser.id, () => {
      void reload();
    });
    return cleanup;
  }, [currentUser?.id]);

  // 카운트다운 (pending 항목용)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>불러오는 중…</div>;
  }
  if (error) {
    return <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>⚠️ {error}</div>;
  }
  if (donations.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 48, textAlign: 'center', border: '1px dashed #ddd' }}>
        <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>💚</div>
        <p style={{ margin: '0 0 16px', color: '#666' }}>아직 기부 내역이 없습니다.</p>
        <Link
          to="/donate"
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            background: '#16a34a',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          💚 첫 기부하기
        </Link>
      </div>
    );
  }

  const paidTotal = donations
    .filter((d) => d.payment_status === 'paid')
    .reduce((s, d) => s + d.amount, 0);

  return (
    <div>
      {paidTotal > 0 && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 12, color: '#166534', marginBottom: 4 }}>💚 총 기부 금액</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>
            {paidTotal.toLocaleString()}원
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {donations.map((d) => (
          <DonationListItem key={d.id} donation={d} />
        ))}
      </div>
    </div>
  );
}

function DonationListItem({ donation }: { donation: EsgDonationRow }) {
  const timeLeftMs = donation.payment_status === 'pending' ? getDonationTimeLeft(donation.expires_at) : 0;
  const isExpired = timeLeftMs <= 0 && donation.payment_status === 'pending';

  const map: Record<string, { label: string; bg: string; color: string }> = {
    pending: { label: isExpired ? '⌛ 만료' : '⏰ 입금 대기', bg: '#fef3c7', color: '#92400e' },
    paid: { label: '✅ 완료', bg: '#dcfce7', color: '#166534' },
    expired: { label: '⌛ 만료', bg: '#f0f0f0', color: '#666' },
    cancelled: { label: '🚫 취소', bg: '#fee2e2', color: '#991b1b' },
  };
  const m = map[donation.payment_status];

  // paid → 인증서 페이지 직행 (3뎁스: 마이페이지 → 카드 → 인증서)
  // 그 외 → 기부 상세 페이지 (입금 안내/취소 안내 등)
  const linkTo = donation.payment_status === 'paid'
    ? `/donate/${donation.id}/certificate`
    : `/donate/${donation.id}`;

  return (
    <Link
      to={linkTo}
      style={{
        background: '#fff',
        borderRadius: 8,
        padding: 14,
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        border: '1px solid #eee',
        textDecoration: 'none',
        color: 'inherit',
        display: 'block',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span
          style={{
            padding: '2px 8px',
            background: m.bg,
            color: m.color,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {m.label}
        </span>
        <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
          {donation.donation_number}
        </span>
        <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>
          {formatKSTFull(donation.created_at)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', flex: 1 }}>
          {donation.amount.toLocaleString()}원
        </div>
        {donation.payment_status === 'pending' && !isExpired && (
          <div style={{ fontSize: 11, color: '#dc2626' }}>
            ⏰ {formatTimeLeft(timeLeftMs)}
          </div>
        )}
        {donation.payment_status === 'paid' && (
          <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
            📜 인증서 →
          </span>
        )}
        {donation.payment_status === 'pending' && !isExpired && (
          <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>
            💳 입금 안내 →
          </span>
        )}
      </div>

      {donation.message && (
        <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
          💬 {donation.message.slice(0, 80)}{donation.message.length > 80 ? '…' : ''}
        </div>
      )}
    </Link>
  );
}
