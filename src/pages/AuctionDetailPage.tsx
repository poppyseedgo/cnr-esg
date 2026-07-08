// ============================================================================
// AuctionDetailPage — 경매 상세 + 실시간 비딩
//
// 기능:
//   - 이미지 세로 스크롤 (썸네일+상세이미지 원본비율로 스택)  // ← [2026-07-06] 캐러셀→스크롤
//   - 카운트다운 (1초 갱신)
//   - 현재가 + 입찰 횟수 + 최고 입찰자 (실시간)
//   - 입찰 폼 (호가 단위로 +/- 또는 직접 입력)
//   - 입찰 이력 (실시간 갱신)
//   - 활동 active + bids_enabled + 경매 status='active'일 때만 입찰 가능
//
// [변경이력]
//   2026-07-06 · (UI만) 이미지 캐러셀 → 세로 스크롤 이미지로 변경(ImageScroll).
//                → imageIdx state / ImageCarousel / arrowStyle 제거(캐러셀 전용, 미사용화 방지).
//              · 상세설명(markdown)을 하단 탭에서 상단 "기부자 아래"로 이동.
//                → ProductDetailTabs 는 showDescriptionTab={false} 로 상세설명 탭 숨김.
//              ※ 입찰/상태/데이터 로직·props·API 호출 불변. 마크업/스타일만 변경.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Breadcrumb } from '@/components/Breadcrumb'; // ← [2026-07-08] 공용 브레드크럼
import { ImageScroll } from '@/components/ImageScroll'; // ← [2026-07-08] 공용 이미지 스크롤
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
import { adminDeleteAuctionBid } from '@/lib/adminAuctions'; // ← [2026-07-07] 관리자 입찰 삭제
import { formatKSTFull } from '@/utils/time';
import { signInWithMicrosoft } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { AuctionEditForm } from '@/components/admin/AuctionEditForm';
import { ProductDetailTabs, type TabKey } from '@/components/ProductDetailTabs'; // ← [2026-07-06] 제어형 탭
import { StickyPanel } from '@/components/StickyPanel'; // ← [2026-07-06] 양방향 sticky 우측 패널
import { useAuctionWishlist } from '@/hooks/useWishlist'; // ← [2026-07-06] 경매 찜
import { MarkdownRenderer } from '@/components/MarkdownRenderer'; // ← [2026-07-06] 상세설명 상단(기부자 아래) 렌더용
import { CustomLabel } from '@/components/CustomLabel'; // ← [2026-07-06] 커스텀 라벨
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
  const [bidAmount, setBidAmount] = useState<number | ''>('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [bidLoading, setBidLoading] = useState(false);
  const [bidMessage, setBidMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [, setTick] = useState(0);
  const [adminEditing, setAdminEditing] = useState(false);
  const [detailTab, setDetailTab] = useState<TabKey>('bids'); // ← [2026-07-06] 우측 버튼 ↔ 하단 탭 제어
  const wishlist = useAuctionWishlist(auction?.id ?? '');       // ← [2026-07-06] 경매 찜(로드 전엔 '' → false)

  // 우측 액션 버튼 → 해당 탭 활성 + 하단 탭 영역으로 부드럽게 스크롤
  const goToTab = (t: TabKey) => {
    setDetailTab(t);
    requestAnimationFrame(() => {
      document.getElementById('auction-detail-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

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

  // ← [2026-07-07] 관리자: 잘못된 입찰 삭제(최고가/입찰수 재산정은 RPC가 처리, 이후 자동 갱신)
  const [deletingBidId, setDeletingBidId] = useState<string | null>(null);
  const handleAdminDeleteBid = async (bidId: string, amount: number) => {
    if (!window.confirm(
      `이 입찰(${amount.toLocaleString('ko-KR')}원)을 삭제할까요?\n\n삭제하면 남은 입찰로 현재 최고가·최고입찰자·입찰수가 자동 재산정됩니다. (되돌릴 수 없음)`
    )) return;
    setDeletingBidId(bidId);
    try {
      await adminDeleteAuctionBid(bidId); // 내부에서 notifyAuctionChanged → 현재가/목록 자동 갱신
      await reloadAuction();
      await reloadBids();
    } catch (e) {
      alert(e instanceof Error ? e.message : '입찰 삭제에 실패했습니다.');
    } finally {
      setDeletingBidId(null);
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
    <article style={{ maxWidth: 1360, margin: '0 auto' }}>
      {/* 반응형: 데스크톱=넓은 2열(좌 이미지 크게 / 우 정보) · 모바일(<1024)=단일열 */}
      <style>{`
        .auction-detail-grid { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 40px; }
        .auction-detail-media { min-width: 0; }
        .auction-detail-side { min-width: 0; }              /* ← [2026-07-07] 근본수정: 우측 패널(grid item)에 min-width:0 누락 → 입찰 폼/버튼의 min-content가 1fr 열을 뷰포트 밖으로 밀어 입찰영역이 잘리던 원인 차단 */
        .auction-detail-side > div { min-width: 0; }         /* ← [2026-07-07] StickyPanel 내부 translate 래퍼도 축소 허용 */
        .auction-detail-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
        .auction-detail-actions > button { flex: 1 1 auto; min-width: 80px; }
        @media (max-width: 1023px) {
          .auction-detail-grid { grid-template-columns: 1fr; gap: 24px; }
          .auction-jump-btn { display: none; }              /* ← [2026-07-07] 근본수정: 모바일 1열에선 우측 점프버튼(입찰내역/상품수령/Q&A)이 바로 아래 실제 탭과 중복 → 숨김(찜 버튼은 유지). 데스크톱은 그대로 노출 */
        }
      `}</style>

      {/* Breadcrumb (Home › Auction › 제목) — 공용 컴포넌트 */}
      <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Auction', to: '/auction' }]} current={auction.product_name} />

      {/* 어드민 편집 도구 */}
      {isAdmin && (
        <div
          style={{
            background: '#f4f4f4',
            border: 'none',
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

      {/* ← [2026-07-06] 넓은 2열: 좌 이미지 크게 / 우 정보(양방향 sticky). 모바일=단일열 */}
      <div className="auction-detail-grid">
        {/* 이미지: 세로 스크롤 (썸네일+상세이미지 원본비율 스택) */}
        <div className="auction-detail-media">
          <ImageScroll images={images} placeholder="🔨" />
        </div>

        {/* 정보 (StickyPanel: 뷰포트보다 길어도 스크롤 방향에 맞춰 top↔bottom 고정) */}
        <StickyPanel className="auction-detail-side" offsetTop={24} offsetBottom={24}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span
                style={{
                  padding: '4px 10px',
                  background: statusColor.bg,
                  color: statusColor.color,
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {AUCTION_STATUS_LABELS[auction.status]}
              </span>
              {auction.bid_count > 0 && (
                <span
                  style={{
                    padding: '4px 10px',
                    background: '#1a1a1a',
                    color: '#fff',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  🔥 {auction.bid_count}회 입찰
                </span>
              )}
            </div>
            {/* ← [2026-07-06] 커스텀 라벨 (제목 위). 텍스트 없으면 미표시 */}
            {auction.label_text && auction.label_text.trim() && (
              <div style={{ marginBottom: 8 }}>
                <CustomLabel text={auction.label_text} bg={auction.label_bg} color={auction.label_color} />
              </div>
            )}
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, lineHeight: 1.35, color: '#111', letterSpacing: '-0.2px' }}>
              {auction.product_name}
            </h1>
            {/* ← [2026-06-23] 물품 기부자 (이름 + 아바타) — 하단 구분선 */}
            {auction.donor && (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginTop: 12, paddingBottom: 16, borderBottom: '1px solid #eee',
                }}
              >
                <Avatar name={auction.donor.name} avatarUrl={auction.donor.avatar_url} size={28} />
                <span style={{ fontSize: 14, color: '#555' }}>
                  <strong style={{ color: '#222' }}>{auction.donor.name}</strong> 님 기부
                </span>
              </div>
            )}

            {/* ← [2026-07-06] 상세설명(작품 정보 등) — 기부자 아래 */}
            {auction.description?.trim() && (
              <div style={{ marginTop: 16 }}>
                <MarkdownRenderer content={auction.description} />
              </div>
            )}
          </div>

          {/* 카운트다운 */}
          {auction.status === 'active' && timeLeftMs > 0 && (
            <div
              style={{
                padding: 20,
                background: '#fbf4d9',
                color: '#5c4a1a',
                borderRadius: 10,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 12, color: '#8a7238', marginBottom: 2 }}>경매 종료까지</div>
              <div style={{ fontSize: 12, color: '#a08a52', marginBottom: 8 }}>
                {formatKstEndDate(auction.ends_at)}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.2px', color: timeLeftMs < 3600 * 1000 ? '#b91c1c' : '#4b3f1e' }}>
                {formatTimeLeft(timeLeftMs)}
              </div>
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
              padding: 20,
              background: '#f6f6f6',
              borderRadius: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#8a8a8a' }}>시작가</span>
              <span style={{ fontSize: 14, color: '#333' }}>{auction.start_price.toLocaleString()}원</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: '#8a8a8a' }}>호가 단위</span>
              <span style={{ fontSize: 14, color: '#333' }}>{auction.bid_unit.toLocaleString()}원</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 14,
                paddingTop: 14,
                borderTop: '1px solid #e3e3e3',
              }}
            >
              <span style={{ fontSize: 14, color: '#555' }}>현재 최고가</span>
              <span style={{ fontSize: 26, fontWeight: 700, color: '#111' }}>
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

          {/* ← [2026-07-06] 우측 액션 버튼: 입찰내역 / 상품 수령 안내 / Q&A(스크롤) / 찜(토글) */}
          <div className="auction-detail-actions">
            {/* ← [2026-07-07] 점프버튼: active=현재 detailTab 반영(하드코딩 true 제거) + .auction-jump-btn(모바일 숨김) */}
            <button type="button" className="auction-jump-btn" onClick={() => goToTab('bids')} style={actionBtnStyle(detailTab === 'bids')}>
              입찰내역
            </button>
            <button type="button" className="auction-jump-btn" onClick={() => goToTab('delivery')} style={actionBtnStyle(detailTab === 'delivery')}>
              상품 수령 안내
            </button>
            <button type="button" className="auction-jump-btn" onClick={() => goToTab('qa')} style={actionBtnStyle(detailTab === 'qa')}>
              Q&amp;A
            </button>
            <button
              type="button"
              onClick={() => { void wishlist.toggle(); }}
              aria-pressed={wishlist.wishlisted}
              style={{
                ...actionBtnStyle(false),
                background: wishlist.wishlisted ? '#beff9b' : '#f3f4f6',
                color: '#111',
              }}
            >
              {wishlist.wishlisted ? '♥ 찜' : '♡ 찜'}
            </button>
          </div>
          </div>
        </StickyPanel>
      </div>

      {/* 하단 탭 영역 (입찰내역 / 상품수령 / Q&A) — 우측 버튼과 제어 연동 + 스크롤 앵커 */}
      <ProductDetailTabs
        id="auction-detail-tabs"
        productType="auction"
        productId={auction.id}
        description={auction.description}
        showDescriptionTab={false} // ← [2026-07-06] 상세설명은 상단(기부자 아래)으로 이동
        activeTab={detailTab}                 // ← [2026-07-06] 우측 버튼과 동기
        onActiveTabChange={setDetailTab}       // ← [2026-07-06]
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
                    {/* ← [2026-07-07] 관리자 전용: 잘못된 입찰 삭제 */}
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={deletingBidId === b.id}
                        onClick={() => handleAdminDeleteBid(b.id, b.bid_amount)}
                        title="이 입찰 삭제 (관리자)"
                        style={{
                          marginLeft: 8,
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid #ef4444',
                          background: '#fff',
                          color: '#ef4444',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: deletingBidId === b.id ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {deletingBidId === b.id ? '삭제 중…' : '삭제'}
                      </button>
                    )}
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
// 우측 액션 버튼 스타일 (primary=검정 / 보조=회색)  // ← [2026-07-06]
// ============================================================================
function actionBtnStyle(primary: boolean): React.CSSProperties {
  return {
    padding: '12px 8px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    background: primary ? '#111' : '#f3f4f6',
    color: primary ? '#fff' : '#111',
  };
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
        border: '1px solid #e5e7eb',
        borderRadius: 12,
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
            minWidth: 0, // ← [2026-07-07] number input 기본 intrinsic min-width 제거 → 좁은 모바일 패널에서 정상 축소(가로 오버플로우 방지)
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

