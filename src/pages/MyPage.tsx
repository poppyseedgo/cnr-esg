// ============================================================================
// MyPage — 마이페이지 (5개 탭)
//
// - 결제대기: payment_status='pending' (만료된 것 포함)
// - 결제완료: payment_status='paid'
// - 경매참여: Phase 4-A에서 구현
// - 경매낙찰: Phase 4-A에서 구현
// - 찜한상품: Phase 4-B 또는 Phase 6
// ============================================================================

import { useEffect, useState, Suspense } from 'react'; // ← [코드 스플리팅] Suspense 추가 (lazy 탭 경계)
import { NavLink, Outlet, Link } from 'react-router-dom';
import { LoadingScreen } from '@/components/routing/LoadingScreen'; // ← [코드 스플리팅] Suspense fallback
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
import { Avatar } from '@/components/Avatar'; // ← [추가] 마이페이지 프로필 아바타
import { loadMyDonations, getDonationTimeLeft, subscribeMyDonations } from '@/lib/donations';
import { loadMyQuestions, updateQuestion, deleteQuestion } from '@/lib/qna'; // ← [내 Q&A 탭]
import { loadMyWishlistProducts, loadMyWishlistProductIds, subscribeWishlist, isWishlistedSync } from '@/lib/wishlist'; // ← [2026-06-24] 찜한 상품 목록
import { ProductCard } from '@/components/ProductCard'; // ← [2026-06-24] 찜 목록 카드 재사용
import { QnaCategoryChip } from '@/components/faq-qna/QnaCategoryChip';
import { QnaStatusBadge } from '@/components/faq-qna/QnaStatusBadge';
import { ESG_QNA_CATEGORY_LABELS } from '@/types/esg';
import type { EsgDonationRow, EsgQnaCategory, EsgQnaQuestionWithAnswer, EsgProductRow } from '@/types/esg';

const tabs = [
  { to: '/mypage/pending', label: '결제대기' },
  { to: '/mypage/completed', label: '결제완료' },
  { to: '/mypage/bidding', label: '경매참여' },
  { to: '/mypage/auction-won', label: '경매 낙찰' },
  { to: '/mypage/wishlist', label: '찜한상품' },
  { to: '/mypage/donations', label: '💚 기부내역' },
  { to: '/mypage/qna', label: '내 Q&A' },
];

export function MyPage() {
  const { currentUser } = useCurrentUser();
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      <h1>👤 마이페이지</h1>
      {/* 프로필 — 아바타 + 이름/이메일 (공통 Avatar 사용) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar
          name={currentUser?.name}
          avatarUrl={currentUser?.avatar_url}
          size={48}
          isMe
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#222' }}>
            {currentUser?.name}님
          </div>
          <div style={{ fontSize: 13, color: '#666' }}>{currentUser?.email}</div>
        </div>
      </div>
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
      {/* ← [코드 스플리팅] lazy 탭 로딩 중 탭바 유지, 탭 내용만 fallback 표시 */}
      <Suspense fallback={<LoadingScreen />}>
        <Outlet />
      </Suspense>
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
  const { currentUser } = useCurrentUser();
  const [items, setItems] = useState<EsgProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0); // ← 찜 해제 즉시 반영(재렌더)

  const reload = async () => {
    if (!currentUser) return;
    try {
      setError(null);
      await loadMyWishlistProductIds(currentUser.id); // 캐시 적재(isWishlistedSync 정확성 + 카드 찜상태)
      const list = await loadMyWishlistProducts();
      setItems(list);
    } catch (e) {
      console.error('[MyPageWishlist]', e);
      setError(e instanceof Error ? e.message : '찜한 상품을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // 찜 해제(이 페이지에서 직접/다른 탭) 시 즉시 반영 — 캐시에서 빠지면 필터로 사라짐.
  // (DB 재조회 대신 캐시 기준 필터 → 낙관적 해제와 타이밍 충돌 없음)
  useEffect(() => {
    const off = subscribeWishlist(() => forceTick((n) => n + 1));
    return off;
  }, []);

  if (loading) return <LoadingBox />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  // 현재도 찜 상태인 상품만 노출(해제 즉시 제거)
  const visible = items.filter((p) => isWishlistedSync(p.id));
  if (visible.length === 0) {
    return (
      <EmptyState
        icon="💖"
        title="찜한 상품이 없습니다"
        description="바자회에서 마음에 드는 상품을 찜해보세요."
        ctaLabel="바자회로 가기"
        ctaTo="/bazaar"
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
      {visible.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
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

// ============================================================================
// 내 Q&A — 내가 작성한 질문 조회 / 수정(답변 전) / 삭제
// ============================================================================

const QNA_CATEGORIES: EsgQnaCategory[] = ['general', 'zero_waste', 'wise_life', 'bazaar', 'auction'];

export function MyPageQna() {
  const { currentUser } = useCurrentUser();
  const [questions, setQuestions] = useState<EsgQnaQuestionWithAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 인라인 수정 상태
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<EsgQnaCategory>('general');
  const [editContent, setEditContent] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!currentUser) return;
    try {
      setError(null);
      const data = await loadMyQuestions(currentUser.id);
      setQuestions(data);
    } catch (e) {
      console.error('[MyPageQna]', e);
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const startEdit = (q: EsgQnaQuestionWithAnswer) => {
    setEditingId(q.id);
    setEditCategory(q.category);
    setEditContent(q.content);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };
  const saveEdit = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await updateQuestion(id, { category: editCategory, content: editContent });
      cancelEdit();
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '수정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };
  const handleDelete = async (id: string) => {
    if (busy) return;
    if (!window.confirm('이 질문을 삭제할까요? 등록된 답변도 함께 삭제됩니다.')) return;
    setBusy(true);
    try {
      await deleteQuestion(id);
      if (editingId === id) cancelEdit();
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>불러오는 중…</div>;
  }
  if (error) {
    return <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>⚠️ {error}</div>;
  }
  if (questions.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 48, textAlign: 'center', border: '1px dashed #ddd' }}>
        <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>💬</div>
        <p style={{ margin: '0 0 16px', color: '#666' }}>아직 작성한 Q&amp;A가 없습니다.</p>
        <Link
          to="/qna"
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            background: '#1a1a1a',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Q&amp;A 바로가기
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
        총 {questions.length}개의 질문 · 답변 전 질문만 수정할 수 있어요.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {questions.map((q) => {
          const isEditing = editingId === q.id;
          const canEdit = q.status === 'pending';
          return (
            <div
              key={q.id}
              style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16 }}
            >
              {/* 상단: 카테고리 + 상태 + 작성일 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <QnaCategoryChip category={q.category} />
                <QnaStatusBadge status={q.status} />
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#999' }}>
                  {formatKSTFull(q.created_at)}
                </span>
              </div>

              {isEditing ? (
                /* 수정 폼 */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as EsgQnaCategory)}
                    disabled={busy}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #ddd',
                      fontSize: 14,
                      background: '#fff',
                      maxWidth: 240,
                    }}
                  >
                    {QNA_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{ESG_QNA_CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value.slice(0, 200))}
                    disabled={busy}
                    rows={3}
                    maxLength={200}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: 12,
                      borderRadius: 8,
                      border: '1px solid #ddd',
                      fontSize: 14,
                      lineHeight: 1.5,
                      resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#999' }}>{editContent.length}/200</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={busy}
                        style={{ padding: '8px 14px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(q.id)}
                        disabled={busy || editContent.trim().length === 0}
                        style={{ padding: '8px 14px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: busy || editContent.trim().length === 0 ? 0.5 : 1 }}
                      >
                        저장
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* 질문 내용 */}
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#222', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {q.content}
                  </p>

                  {/* 답변 (있을 때) */}
                  {q.answer && (
                    <div style={{ marginTop: 12, padding: 12, background: '#f7f9fc', borderRadius: 8, border: '1px solid #eef1f6' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>답변</div>
                      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#333', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {q.answer.content}
                      </p>
                      <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>{formatKSTFull(q.answer.created_at)}</div>
                    </div>
                  )}

                  {/* 액션: 수정(답변 전) / 삭제 */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => startEdit(q)}
                        disabled={busy}
                        style={{ padding: '6px 12px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                      >
                        ✏️ 수정
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(q.id)}
                      disabled={busy}
                      style={{ padding: '6px 12px', background: '#fff', color: '#dc2626', border: '1px solid #f0c2c2', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                    >
                      🗑 삭제
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
