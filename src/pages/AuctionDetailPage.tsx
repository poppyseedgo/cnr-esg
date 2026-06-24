// ============================================================================
// AuctionDetailPage — 경매 상세 + 실시간 비딩
//
// 기능:
//   - 이미지 캐러셀
//   - 카운트다운 (1초 갱신)
//   - 현재가 + 입찰 횟수 + 최고 입찰자 (실시간)
//   - 입찰 폼 (호가 단위로 +/- 또는 직접 입력)
//   - 입찰 이력 (실시간 갱신)
//   - 활동 active + bids_enabled + 경매 status='active'일 때만 입찰 가능
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { BlurImage } from '@/components/BlurImage'; // ← [2026-06-19] 이미지 lazy+블러업
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventPhase } from '@/hooks/useEventPhase';
import {
  loadAuction,
  loadBids,
  placeBid,
  subscribeAuction,
  subscribeBids,
  onAuctionChanged,
  getAuctionTimeLeft,
  getMinimumBid,
  buildAnonymousNumberMap,
  AUCTION_STATUS_LABELS,
  AUCTION_STATUS_COLORS,
  type BidWithProfile,
} from '@/lib/auctions';
import { formatTimeLeft, formatKstEndDate } from '@/lib/orders';
import { formatKSTFull } from '@/utils/time';
import { signInWithMicrosoft } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { AuctionEditForm } from '@/components/admin/AuctionEditForm';
import { ProductDetailTabs } from '@/components/ProductDetailTabs';
import type { EsgAuctionRow } from '@/types/esg';

export function AuctionDetailPage() {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useCurrentUser();
  const { getActivity, settings } = useEventPhase();
  const { status: auctionPhaseStatus } = getActivity('auction');

  const [auction, setAuction] = useState<EsgAuctionRow | null>(null);
  const [bids, setBids] = useState<BidWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageIdx, setImageIdx] = useState(0);
  const [bidAmount, setBidAmount] = useState<number | ''>('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [bidLoading, setBidLoading] = useState(false);
  const [bidMessage, setBidMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [, setTick] = useState(0);
  const [adminEditing, setAdminEditing] = useState(false);

  const reloadAuction = async () => {
    if (!auctionId) return;
    try {
      setError(null);
      const a = await loadAuction(auctionId);
      if (!a) {
        setError('경매를 찾을 수 없습니다.');
      } else if (a.status === 'cancelled') {
        setError('취소된 경매입니다.');
      } else {
        setAuction(a);
        // 최소 입찰가로 입력 필드 초기화 (한 번만)
        setBidAmount((prev) => (prev === '' ? getMinimumBid(a) : prev));
      }
    } catch (e) {
      console.error('[AuctionDetailPage] load auction:', e);
      setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const reloadBids = async () => {
    if (!auctionId) return;
    try {
      const list = await loadBids(auctionId, 30);
      setBids(list);
    } catch (e) {
      console.error('[AuctionDetailPage] load bids:', e);
    }
  };

  // 초기 로드
  useEffect(() => {
    setLoading(true);
    setBidAmount('');
    setBidMessage(null);
    void reloadAuction();
    void reloadBids();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId]);

  // Realtime
  // Realtime + 같은 탭 즉시 신호
  useEffect(() => {
    if (!auctionId) return;
    const refresh = () => {
      void reloadAuction();
      void reloadBids();
    };
    // 1) Supabase Realtime - 다른 탭/사용자 입찰 동기화 (수초 지연 가능)
    const cleanupAuction = subscribeAuction(auctionId, refresh);
    const cleanupBids = subscribeBids(auctionId, refresh);
    // 2) window event - 같은 탭 본인 입찰 즉시 반영
    const cleanupEvent = onAuctionChanged((changedId) => {
      if (!changedId || changedId === auctionId) refresh();
    });
    return () => {
      cleanupAuction();
      cleanupBids();
      cleanupEvent();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId]);

  // 카운트다운 갱신
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // 입찰 가능 여부 (프론트 가드 - RPC가 다시 검증)
  const canBid = useMemo(() => {
    if (!currentUser || !auction) return false;
    if (auction.status !== 'active') return false;
    if (auctionPhaseStatus !== 'active' && !isAdmin) return false; // ← [2026-06-23] 어드민은 경매 기간 무관 입찰 가능
    if (settings.bids_enabled === false) return false;
    if (auction.current_bidder_id === currentUser.id) return false;
    if (getAuctionTimeLeft(auction.ends_at) <= 0) return false;
    return true;
  }, [
    currentUser,
    auction,
    auctionPhaseStatus,
    isAdmin, // ← [2026-06-23] deps
    settings.bids_enabled,
  ]);

  // 익명 입찰자 번호 매핑 (같은 사람 → 같은 번호)
  const anonymousNumberMap = useMemo(() => buildAnonymousNumberMap(bids), [bids]);

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>🔨 불러오는 중…</div>
    );
  }

  if (error || !auction) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🚫</div>
        <h2>{error ?? '경매를 찾을 수 없습니다'}</h2>
        <Link
          to="/auction"
          style={{
            display: 'inline-block',
            marginTop: 16,
            padding: '10px 20px',
            background: '#1a1a1a',
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
          }}
        >
          경매 목록으로
        </Link>
      </div>
    );
  }

  const images: string[] = [];
  if (auction.thumbnail_url) images.push(auction.thumbnail_url);
  for (const img of auction.detail_images ?? []) {
    if (img && !images.includes(img)) images.push(img);
  }

  const statusColor = AUCTION_STATUS_COLORS[auction.status];
  const timeLeftMs = getAuctionTimeLeft(auction.ends_at);
  const minBid = getMinimumBid(auction);
  const amIHighestBidder =
    !!currentUser && auction.current_bidder_id === currentUser.id;

  const handleBid = async () => {
    if (!currentUser) {
      signInWithMicrosoft().catch(console.error);
      return;
    }
    if (bidAmount === '' || bidAmount < minBid) {
      setBidMessage({
        type: 'error',
        text: `최소 입찰가는 ${minBid.toLocaleString()}원입니다.`,
      });
      return;
    }
    setBidLoading(true);
    setBidMessage(null);
    try {
      const result = await placeBid(auction.id, bidAmount as number, { isAnonymous });
      setBidMessage({
        type: 'success',
        text: `🎉 ${result.bid_amount?.toLocaleString()}원으로 ${isAnonymous ? '익명 ' : ''}입찰했습니다!`,
      });

      // 옵티미스틱 업데이트 - RPC 응답값으로 즉시 화면 갱신
      // (Realtime + reload 도착 전이라도 사용자는 즉시 확인 가능)
      if (currentUser && result.new_current_price && result.bid_count) {
        setAuction((prev) =>
          prev
            ? {
                ...prev,
                current_price: result.new_current_price!,
                bid_count: result.bid_count!,
                current_bidder_id: currentUser.id,
                current_bidder_email: currentUser.email,
                current_bidder_name_snapshot: currentUser.name,
                last_bid_at: new Date().toISOString(),
              }
            : prev
        );
      }

      // 확실한 동기화 위해 reload (Realtime이 이미 호출했을 수도 있음 - 중복은 무해)
      void reloadAuction();
      void reloadBids();
      // 다음 입찰가로 초기화
      setBidAmount(result.new_current_price ? result.new_current_price + auction.bid_unit : '');
    } catch (e) {
      console.error('[AuctionDetailPage] bid error:', e);
      setBidMessage({
        type: 'error',
        text: e instanceof Error ? e.message : '입찰에 실패했습니다.',
      });
    } finally {
      setBidLoading(false);
    }
  };

  return (
    <article style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 16, fontSize: 13 }}>
        <Link to="/auction" style={{ color: '#888', textDecoration: 'none' }}>
          🔨 경매
        </Link>
        <span style={{ color: '#bbb', margin: '0 6px' }}>›</span>
        <span style={{ color: '#444' }}>{auction.product_name}</span>
      </div>

      {/* 어드민 편집 도구 */}
      {isAdmin && (
        <div
          style={{
            background: '#fff',
            border: '2px solid #0ea5e9',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: adminEditing ? 12 : 0,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  padding: '2px 8px',
                  background: '#0ea5e9',
                  color: '#fff',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                🔧 ADMIN
              </span>
              <span style={{ fontSize: 13, color: '#444' }}>
                관리자 편집 (상태: <strong>{auction.status}</strong> · 호가{' '}
                {auction.bid_unit.toLocaleString()}원 · {auction.bid_count}회 입찰)
              </span>
            </div>
            {!adminEditing && auction.status !== 'cancelled' && (
              <button
                type="button"
                onClick={() => setAdminEditing(true)}
                style={{
                  padding: '6px 12px',
                  background: '#0ea5e9',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                ✏️ 경매 편집
              </button>
            )}
          </div>

          {adminEditing && (
            <AuctionEditForm
              auction={auction}
              onSuccess={() => {
                setAdminEditing(false);
                void reloadAuction();
                void reloadBids();
              }}
              onCancel={() => setAdminEditing(false)}
              onTerminated={() => {
                setAdminEditing(false);
                void reloadAuction();
                void reloadBids();
              }}
            />
          )}
        </div>
      )}

      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        }}
      >
        {/* 이미지 */}
        <ImageCarousel images={images} currentIdx={imageIdx} onChange={setImageIdx} />

        {/* 정보 */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <span
                style={{
                  padding: '3px 10px',
                  background: statusColor.bg,
                  color: statusColor.color,
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {AUCTION_STATUS_LABELS[auction.status]}
              </span>
              {auction.bid_count > 0 && (
                <span
                  style={{
                    padding: '3px 10px',
                    background: '#1a1a1a',
                    color: '#fff',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  🔥 {auction.bid_count}회 입찰
                </span>
              )}
            </div>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.4 }}>{auction.product_name}</h1>
            {/* ← [2026-06-23] 물품 기부자 (이름 + 아바타) */}
            {auction.donor && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <Avatar name={auction.donor.name} avatarUrl={auction.donor.avatar_url} size={28} />
                <span style={{ fontSize: 14, color: '#555' }}>
                  <strong style={{ color: '#222' }}>{auction.donor.name}</strong> 님 기부
                </span>
              </div>
            )}
          </div>

          {/* 카운트다운 */}
          {auction.status === 'active' && timeLeftMs > 0 && (
            <div
              style={{
                padding: 16,
                background: timeLeftMs < 3600 * 1000 ? '#fee2e2' : '#fef3c7',
                color: timeLeftMs < 3600 * 1000 ? '#991b1b' : '#92400e',
                borderRadius: 8,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2 }}>경매 종료까지</div>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                {formatKstEndDate(auction.ends_at)}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{formatTimeLeft(timeLeftMs)}</div>
            </div>
          )}
          {auction.status === 'scheduled' && (
            <div
              style={{
                padding: 12,
                background: '#fef3c7',
                color: '#92400e',
                borderRadius: 8,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              🗓 {formatKSTFull(auction.starts_at)}부터 입찰 시작
            </div>
          )}
          {auction.status === 'ended' && (
            <div
              style={{
                padding: 12,
                background: '#f0f0f0',
                color: '#444',
                borderRadius: 8,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              🏁 경매가 종료되었습니다
              {auction.winner_final_price && (
                <div style={{ marginTop: 4, fontWeight: 600, color: '#10b981' }}>
                  🏆 최종 낙찰가 {auction.winner_final_price.toLocaleString()}원
                </div>
              )}
            </div>
          )}

          {/* 현재가 + 최고 입찰자 */}
          <div
            style={{
              padding: 16,
              background: '#f9fafb',
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#888' }}>시작가</span>
              <span style={{ fontSize: 13 }}>{auction.start_price.toLocaleString()}원</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#888' }}>호가 단위</span>
              <span style={{ fontSize: 13 }}>{auction.bid_unit.toLocaleString()}원</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid #e5e7eb',
              }}
            >
              <span style={{ fontSize: 13, color: '#666' }}>현재 최고가</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: '#222' }}>
                {auction.current_price.toLocaleString()}원
              </span>
            </div>
            {/* 최고 입찰자 정보 (bids[0] = 최신 = 최고가) */}
            {auction.bid_count > 0 && bids[0] && (() => {
              const top = bids[0];
              const topIsAnonymous = top.is_anonymous;
              const topHandle = top.anonymous_handle;
              const topNum = topHandle ? anonymousNumberMap.get(topHandle) : undefined;

              // 익명 + 본인이면 본인 정보 (DB view가 본인 row에는 정보 노출)
              // 익명 + 타인이면 "익명 #N" + 마스크 아바타
              // 익명 아니면 실명 + 부서 + 아바타
              const showAnonymous = topIsAnonymous && !top.is_self;
              const displayLabel = showAnonymous
                ? `익명 #${topNum ?? '?'}`
                : top.profile?.name ?? top.user_name_snapshot ?? '(이름 없음)';

              return (
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px dashed #e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Avatar
                    name={displayLabel}
                    avatarUrl={showAnonymous ? null : top.profile?.avatar_url}
                    size={32}
                    isMe={amIHighestBidder}
                    anonymous={showAnonymous}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#888' }}>최고 입찰자</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {amIHighestBidder ? (
                        <span style={{ color: '#0ea5e9' }}>
                          🏆 {displayLabel}
                          {topIsAnonymous && (
                            <span style={{ fontWeight: 400, marginLeft: 4, fontSize: 11 }}>
                              (본인 · 익명)
                            </span>
                          )}
                          {!topIsAnonymous && (
                            <span style={{ fontWeight: 400, marginLeft: 4 }}>(본인)</span>
                          )}
                        </span>
                      ) : (
                        <>
                          {displayLabel}
                          {!showAnonymous && top.profile?.dept && (
                            <span style={{ color: '#888', fontWeight: 400, marginLeft: 6 }}>
                              · {top.profile.dept}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 본인이 최고 입찰자 안내 */}
          {amIHighestBidder && auction.status === 'active' && (
            <div
              style={{
                padding: 12,
                background: '#dcfce7',
                color: '#166534',
                borderRadius: 8,
                fontSize: 13,
                textAlign: 'center',
                fontWeight: 600,
              }}
            >
              🎉 현재 최고 입찰자입니다! 종료까지 유지되면 낙찰됩니다.
            </div>
          )}

          {/* 입찰 폼 */}
          {canBid ? (
            <BidForm
              minBid={minBid}
              bidUnit={auction.bid_unit}
              value={bidAmount}
              onChange={setBidAmount}
              isAnonymous={isAnonymous}
              onAnonymousChange={setIsAnonymous}
              onSubmit={handleBid}
              loading={bidLoading}
            />
          ) : (
            <div
              style={{
                padding: 16,
                background: '#f5f5f5',
                borderRadius: 8,
                textAlign: 'center',
                color: '#666',
                fontSize: 13,
              }}
            >
              {!currentUser
                ? '입찰하려면 로그인이 필요합니다'
                : auctionPhaseStatus === 'before'
                ? '아직 경매 기간이 아닙니다'
                : auctionPhaseStatus === 'closed'
                ? '경매 기간이 종료되었습니다'
                : auction.status === 'scheduled'
                ? '아직 시작 전인 경매입니다'
                : auction.status === 'ended'
                ? '종료된 경매입니다'
                : settings.bids_enabled === false
                ? '입찰이 일시 중단되었습니다 (관리자 설정)'
                : amIHighestBidder
                ? '이미 최고 입찰자입니다. 다른 사람이 입찰하면 다시 입찰 가능합니다.'
                : '입찰 가능 시간이 아닙니다'}
            </div>
          )}

          {bidMessage && (
            <div
              style={{
                padding: 12,
                background: bidMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
                color: bidMessage.type === 'success' ? '#166534' : '#991b1b',
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              {bidMessage.text}
            </div>
          )}

          {/* 설명은 하단 탭 영역에서 마크다운으로 표시 */}
        </div>
      </div>

      {/* 하단 탭 영역 (입찰내역 / 상세설명 / 상품수령 / Q&A) */}
      <ProductDetailTabs
        productType="auction"
        productId={auction.id}
        description={auction.description}
        bidsContent={
          bids.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#bbb', fontSize: 13 }}>
              아직 입찰이 없습니다. 첫 입찰자가 되어보세요!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {bids.map((b, idx) => {
                const isMe = b.is_self;
                const isCurrentTop = idx === 0;
                const isAnon = b.is_anonymous;
                const showAnonymous = isAnon && !isMe;

                let displayName: string;
                if (showAnonymous) {
                  const num = b.anonymous_handle ? anonymousNumberMap.get(b.anonymous_handle) : undefined;
                  displayName = `익명 #${num ?? '?'}`;
                } else {
                  displayName = b.profile?.name ?? b.user_name_snapshot ?? '(이름 없음)';
                }

                return (
                  <div
                    key={b.id}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '12px 0',
                      borderTop: idx === 0 ? 'none' : '1px solid #f5f5f5',
                      alignItems: 'center',
                      background: isCurrentTop ? 'linear-gradient(to right, #fefce8 0%, transparent 50%)' : undefined,
                      borderRadius: isCurrentTop ? 6 : 0,
                      marginLeft: isCurrentTop ? -8 : 0,
                      paddingLeft: isCurrentTop ? 8 : 0,
                    }}
                  >
                    <Avatar
                      name={displayName}
                      avatarUrl={showAnonymous ? null : b.profile?.avatar_url}
                      size={36}
                      isMe={isMe}
                      anonymous={showAnonymous}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexWrap: 'wrap',
                          fontSize: 13,
                        }}
                      >
                        {isCurrentTop && (
                          <span
                            style={{
                              padding: '1px 6px',
                              background: '#fef3c7',
                              color: '#92400e',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            🏆 TOP
                          </span>
                        )}
                        <strong style={{ color: isMe ? '#0ea5e9' : '#222' }}>
                          {displayName}
                        </strong>
                        {isMe && isAnon && (
                          <span
                            style={{
                              padding: '1px 6px',
                              background: '#e0f2fe',
                              color: '#0c4a6e',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 600,
                            }}
                          >
                            본인 · 익명
                          </span>
                        )}
                        {isMe && !isAnon && (
                          <span style={{ fontWeight: 400, color: '#0ea5e9', fontSize: 11 }}>
                            (본인)
                          </span>
                        )}
                        {!showAnonymous && !isMe && b.profile?.dept && (
                          <span style={{ color: '#888', fontSize: 12 }}>· {b.profile.dept}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                        {formatKSTFull(b.created_at)}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: isCurrentTop ? '#10b981' : '#444',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {b.bid_amount.toLocaleString()}원
                    </span>
                  </div>
                );
              })}
            </div>
          )
        }
      />

      {/* 액션 */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => navigate('/auction')}
          style={{
            padding: '10px 20px',
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          ← 경매 목록으로
        </button>
      </div>
    </article>
  );
}

// ============================================================================
// 입찰 폼
// ============================================================================

function BidForm({
  minBid,
  bidUnit,
  value,
  onChange,
  isAnonymous,
  onAnonymousChange,
  onSubmit,
  loading,
}: {
  minBid: number;
  bidUnit: number;
  value: number | '';
  onChange: (v: number | '') => void;
  isAnonymous: boolean;
  onAnonymousChange: (v: boolean) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const numValue = value === '' ? minBid : value;
  const isValid = numValue >= minBid && (numValue - minBid) % bidUnit === 0;

  const handleDelta = (delta: number) => {
    const next = Math.max(minBid, numValue + delta);
    onChange(next);
  };

  return (
    <div
      style={{
        padding: 16,
        background: '#fff',
        border: '2px solid #1a1a1a',
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
        최소 입찰가: <strong>{minBid.toLocaleString()}원</strong> · 호가 단위 +{bidUnit.toLocaleString()}원
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => handleDelta(-bidUnit)}
          disabled={loading || numValue <= minBid}
          style={{
            width: 36,
            height: 40,
            border: '1px solid #ddd',
            background: '#fff',
            borderRadius: 6,
            cursor: loading || numValue <= minBid ? 'not-allowed' : 'pointer',
            fontSize: 18,
          }}
          aria-label="감소"
        >
          −
        </button>
        <input
          type="number"
          value={value === '' ? '' : value}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? '' : Number(v));
          }}
          step={bidUnit}
          min={minBid}
          disabled={loading}
          style={{
            flex: 1,
            padding: '10px 12px',
            border: '1px solid #ddd',
            borderRadius: 6,
            fontSize: 16,
            fontWeight: 700,
            textAlign: 'right',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          onClick={() => handleDelta(bidUnit)}
          disabled={loading}
          style={{
            width: 36,
            height: 40,
            border: '1px solid #ddd',
            background: '#fff',
            borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 18,
          }}
          aria-label="증가"
        >
          +
        </button>
      </div>

      {/* 익명 입찰 체크박스 */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          marginBottom: 10,
          background: isAnonymous ? '#f0f9ff' : '#f9fafb',
          borderRadius: 6,
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 13,
          transition: 'background 0.15s',
          border: isAnonymous ? '1px solid #bae6fd' : '1px solid transparent',
        }}
      >
        <input
          type="checkbox"
          checked={isAnonymous}
          onChange={(e) => onAnonymousChange(e.target.checked)}
          disabled={loading}
          style={{ margin: 0, cursor: loading ? 'not-allowed' : 'pointer' }}
        />
        <span style={{ flex: 1 }}>
          <span style={{ marginRight: 4 }}>🕶</span>
          <strong>익명으로 입찰</strong>
          <span style={{ color: '#888', fontSize: 11, marginLeft: 6 }}>
            (다른 사용자에게 "익명 #N"으로 표시)
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={onSubmit}
        disabled={loading || !isValid}
        style={{
          width: '100%',
          padding: '12px',
          background: loading || !isValid ? '#ccc' : '#1a1a1a',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: loading || !isValid ? 'not-allowed' : 'pointer',
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        {loading
          ? '입찰 중…'
          : `${typeof value === 'number' ? value.toLocaleString() : minBid.toLocaleString()}원${
              isAnonymous ? ' 익명' : ''
            } 입찰하기`}
      </button>
    </div>
  );
}

// ============================================================================
// 이미지 캐러셀 (BazaarProductPage와 동일 — 추후 공통화 가능)
// ============================================================================

function ImageCarousel({
  images,
  currentIdx,
  onChange,
}: {
  images: string[];
  currentIdx: number;
  onChange: (idx: number) => void;
}) {
  const single = images.length <= 1;
  const goPrev = () => onChange((currentIdx - 1 + images.length) % images.length);
  const goNext = () => onChange((currentIdx + 1) % images.length);

  if (images.length === 0) {
    return (
      <div
        style={{
          aspectRatio: '1 / 1',
          background: 'linear-gradient(135deg, #fef3c7, #fed7aa)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 64,
          opacity: 0.4,
        }}
      >
        🔨
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        background: '#000',
        aspectRatio: '1 / 1',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>
        <BlurImage url={images[currentIdx]} width={1080} quality={78} alt={`이미지 ${currentIdx + 1}`} />
      </div>
      {!single && (
        <>
          <button type="button" onClick={goPrev} style={{ ...arrowStyle, left: 12 }} aria-label="이전">
            <img src="/icons/arrow-back.svg" alt="" aria-hidden="true" width={16} height={16} style={{ display: 'block' }} />
          </button>
          <button type="button" onClick={goNext} style={{ ...arrowStyle, right: 12 }} aria-label="다음">
            <img src="/icons/arrow-forward.svg" alt="" aria-hidden="true" width={16} height={16} style={{ display: 'block' }} />
          </button>
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 6,
            }}
          >
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onChange(i)}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  border: 'none',
                  padding: 0,
                  background: i === currentIdx ? '#fff' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                }}
                aria-label={`이미지 ${i + 1}로 이동`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// [2026-06-10] 갤러리 화살표: 64×64 글래스 버튼 (Figma 1307:578/582)
//   bg rgba(255,255,255,0.1) + backdrop-blur(글래스) + 미세 테두리. 아이콘은 24px SVG.
const arrowStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  width: 40,                                 // ← [2026-06-10] Figma 1308:615
  height: 40,
  borderRadius: '50%',
  border: '1px solid rgb(241 241 241 / 25%)',               // Figma 1308:615
  background: 'rgba(255, 255, 255, 0.1)',    // 10% 화이트 글래스
  backdropFilter: 'blur(12px)',              // glass 효과
  WebkitBackdropFilter: 'blur(12px)',        // Safari
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};
