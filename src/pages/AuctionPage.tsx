// ============================================================================
// AuctionPage — 경매 목록 (Figma 리스트 리디자인)
//
// [Figma SSOT] node 2215:55 (product list) / 카드: 2215:181·2222:817·2215:240
//   (file ydfT0xP6nc83VxFd7GyEx4)
//
// 기능:
//   - 브레드크럼(Home › Auction) + 정렬 행(등록순 / 높은 가격 순 / 낮은 가격 순, URL sort)
//   - 경매 카드 그리드(.shop-grid 2/3/4열, .pcard 공용 chassis — 바자회와 통일)
//   - 카드 상태별 요소:
//       · 상단 좌: 입찰상태 배지(내가 최고가 #99f75d / 밀려남 #c9f75d) — 내가 입찰한 진행중 경매만
//       · 상단 우: 🔥 N명 입찰 (bid_count>0)
//       · 본문 배지행: [예정(검정)] [새 제품]
//       · 가격행: 시작가(입찰 있으면 취소선) + 현재가(빨강 라벨, 입찰 있을 때만)
//       · 카운트다운 바(#e8ff68): 진행중=종료까지 / 예정=시작까지
//       · 호버 CTA(.pcard-actions): 경매 물품 보기 / 내가 최고가 입찰중 / 입찰에서 밀려남
//   - Realtime(현재가/상태 즉시 반영) + 1초 카운트다운 틱
//
// [보류/요청] 카드 하트+찜 카운트("♥ 15")는 (1) 신규 커스텀 SVG, (2) 경매용 찜 토글+카운트
//   백엔드가 필요하여 이 단계에서는 제외(가짜 표기 금지). 별도 단계로 진행.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom'; // ← [2026-07-06] 정렬 URL(sort)
import { useCurrentUser } from '@/hooks/useCurrentUser'; // ← [2026-07-06] 입찰상태 배지(내 입찰)
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'; // ← [2026-06-04] 무한 스크롤
import {
  loadAuctions,
  loadMyBidAuctionIds, // ← [2026-07-06] 내 입찰 경매 id 집합
  subscribeAuctions,
  onAuctionChanged,
  getAuctionTimeLeft,
} from '@/lib/auctions';
import { formatTimeLeft } from '@/lib/orders';
import { InfiniteScrollFooter } from '@/components/InfiniteScrollFooter'; // ← [2026-06-04]
import { BlurImage } from '@/components/BlurImage'; // ← [2026-06-19] 썸네일 lazy+블러업
import { Avatar } from '@/components/Avatar'; // ← [2026-07-06] 기부자 아바타(카드 기부자 라인 복구)
import { CustomLabel } from '@/components/CustomLabel'; // ← [2026-07-06] 커스텀 라벨(좌상단 오버레이)
import { AuctionSidebar } from '@/components/auction/AuctionSidebar'; // ← [2026-07-06] 모바일 상단 사이드바 섹션
import type { EsgAuctionRow } from '@/types/esg';

type SortKey = 'reg' | 'price_desc' | 'price_asc';
type BidStatus = 'highest' | 'outbid' | null; // ← 내가 최고가 / 입찰에서 밀려남 / 해당없음

export function AuctionPage() {
  const { currentUser } = useCurrentUser();

  // ── [2026-07-06] 정렬 = URL 파라미터(sort) 단일 소스 (바자회와 동일 계약) ──
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = searchParams.get('sort');
  const sort: SortKey =
    sortParam === 'price_desc' ? 'price_desc' : sortParam === 'price_asc' ? 'price_asc' : 'reg';
  const setSort = (next: SortKey) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'reg') p.delete('sort'); else p.set('sort', next);
      return p;
    }, { replace: true });
  };

  // ── [2026-07-06] 기부자 필터 = URL 파라미터(?donor=key1,key2) — 사이드바 칩과 동일 소스 ──
  const donorParam = (searchParams.get('donor') ?? '').trim(); // 안정 dep(문자열)
  const donorActive = donorParam.length > 0;

  // 무한 스크롤 — 12개씩 누적 로드 (정렬/기부자필터 변경 시 리셋)
  const fetchPage = useCallback(
    (offset: number, limit: number) => {
      const donorKeys = donorParam.split(',').map((s) => s.trim()).filter(Boolean);
      return loadAuctions({ offset, limit, sort, donorKeys });
    },
    [sort, donorParam]
  );
  const {
    items: auctions,
    initialLoading,
    loadingMore,
    error,
    sentinelRef,
    reload,
    refresh,
  } = useInfiniteScroll<EsgAuctionRow>(fetchPage, { pageSize: 12, deps: [sort, donorParam] });

  // ── [2026-07-06] 내가 입찰한 경매 id 집합(로그인 시 1회 로드) → 카드 배지 판정 ──
  const [myBidIds, setMyBidIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!currentUser) { setMyBidIds(new Set()); return; }
    let alive = true;
    loadMyBidAuctionIds(currentUser.id)
      .then((s) => { if (alive) setMyBidIds(s); })
      .catch(console.error);
    return () => { alive = false; };
  }, [currentUser?.id]);

  const [, setTick] = useState(0);

  // Realtime + 같은 탭 즉시 신호 — 조용히 제자리 갱신(깜빡임 없음)
  useEffect(() => {
    const cleanupRT = subscribeAuctions(() => refresh());
    const cleanupEvent = onAuctionChanged(() => refresh());
    return () => { cleanupRT(); cleanupEvent(); };
  }, [refresh]);

  // 카운트다운 갱신 (1초)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      {/* ← [2026-07-06] 모바일(<1024) 전용 상단 섹션: 제목 + 경매 물품 기부자(가로 스크롤 칩).
          데스크톱은 SecondarySidebar(좌측 2차 패널)가 대신 표시 → .auction-mobile-side 로 표시 제어 */}
      <div className="auction-mobile-side" style={{ marginBottom: 8 }}>
        <AuctionSidebar variant="mobile" />
      </div>

      {/* 브레드크럼(Home › Auction) — 바자회와 동일 패턴 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <nav aria-label="breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, lineHeight: 1.4 }}>
          <Link to="/" style={{ color: '#848484', textDecoration: 'none' }}>Home</Link>
          <span style={{ color: '#b8b8b8' }}>›</span>
          <span style={{ color: '#111' }}>Auction</span>
        </nav>
      </div>

      {/* ← [2026-07-06] 정렬 행 (높은 가격 순 / 낮은 가격 순) — '등록 순' 라디오 제거(요청).
          기본 정렬은 등록순 유지(라디오 미선택 상태). 우측 정렬 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
        {/* 기부자 필터 활성 시: 안내 + 해제 (사이드바 칩이 접혀 있어도 여기서 해제 가능) */}
        {donorActive ? (
          <button
            type="button"
            onClick={() => setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('donor'); return p; }, { replace: true })}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 999, border: '1px solid #ddd',
              background: '#f3f4f6', color: '#111', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
            }}
          >
            기부자 필터 {donorParam.split(',').filter(Boolean).length}명 · 해제 ✕
          </button>
        ) : <span />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <SortOption label="높은 가격 순" active={sort === 'price_desc'} onClick={() => setSort('price_desc')} />
          <SortOption label="낮은 가격 순" active={sort === 'price_asc'} onClick={() => setSort('price_asc')} />
        </div>
      </div>

      {/* 그리드 */}
      {initialLoading ? (
        <AuctionSkeleton />
      ) : error && auctions.length === 0 ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : auctions.length === 0 ? (
        <EmptyState filtered={donorActive} />
      ) : (
        <div className="shop-grid" style={{ marginTop: 24, display: 'grid', gap: 16 }}>
          {auctions.map((a) => (
            <AuctionCard key={a.id} auction={a} bidStatus={bidStatusOf(a, currentUser?.id ?? null, myBidIds)} />
          ))}
        </div>
      )}
      {!initialLoading && auctions.length > 0 && (
        <InfiniteScrollFooter
          sentinelRef={sentinelRef}
          loadingMore={loadingMore}
          error={error}
          onRetry={reload}
        />
      )}
    </div>
  );
}

// 내 입찰 관계 판정: 진행중 경매 중 내가 입찰했으면 최고가/밀려남, 아니면 없음
function bidStatusOf(a: EsgAuctionRow, myUserId: string | null, myBidIds: Set<string>): BidStatus {
  if (a.status !== 'active') return null;
  if (!myUserId || !myBidIds.has(a.id)) return null;
  return a.current_bidder_id === myUserId ? 'highest' : 'outbid';
}

// ── [2026-06-24] 정렬 옵션 (Figma: 14px 라디오 + 라벨 16px). 선택=검은 점 — 바자회와 동일 ──
function SortOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit',
      }}
    >
      <span style={{
        width: 14, height: 14, flexShrink: 0, borderRadius: 999, border: '1px solid #000',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {active && <span style={{ width: 8, height: 8, borderRadius: 999, background: '#000' }} />}
      </span>
      <span style={{ fontSize: 16, lineHeight: 1.4, color: active ? '#111' : '#848484', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );
}

// ============================================================================
// 경매 카드 (Figma 2215:181 / 2222:817 / 2215:240)
// ============================================================================
function AuctionCard({ auction, bidStatus }: { auction: EsgAuctionRow; bidStatus: BidStatus }) {
  const isActive = auction.status === 'active';
  const isScheduled = auction.status === 'scheduled';
  const isEnded = auction.status === 'ended';
  const hasBids = auction.bid_count > 0;
  const hasCustomLabel = !!(auction.label_text && auction.label_text.trim()); // ← [2026-07-06] 커스텀 라벨 유무

  // 카운트다운: 진행중=종료까지, 예정=시작까지
  const targetMs = isScheduled
    ? new Date(auction.starts_at).getTime() - Date.now()
    : getAuctionTimeLeft(auction.ends_at);
  const showCountdown = (isActive || isScheduled) && targetMs > 0;

  return (
    <Link
      to={`/auction/${auction.id}`}
      className="pcard"
      style={{ opacity: auction.status === 'cancelled' ? 0.5 : 1 }}
    >
      {/* ── 이미지(정사각 full-bleed #d7d7d7, 공용 chassis) ── */}
      <div className="pcard-img">
        {auction.thumbnail_url && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <BlurImage url={auction.thumbnail_url} width={680} />
          </div>
        )}

        {/* 상단 오버레이: [커스텀 라벨 + 입찰상태(세로 스택) 좌] [🔥 N회 입찰 우] — 클릭 통과 */}
        {(hasCustomLabel || bidStatus || hasBids) && (
          <div
            style={{
              position: 'absolute', top: 8, left: 8, right: 8,
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              gap: 8, pointerEvents: 'none',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
              {/* 커스텀 라벨 (텍스트 없으면 null) */}
              <CustomLabel text={auction.label_text} bg={auction.label_bg} color={auction.label_color} />
              {bidStatus === 'highest' && <span style={overlayBadge('#99f75d', '#000')}>내가 최고가 입찰 중</span>}
              {bidStatus === 'outbid' && <span style={overlayBadge('#c9f75d', '#000')}>입찰에서 밀려남</span>}
            </div>
            {hasBids && (
              <span style={{ ...overlayBadge('rgba(0,0,0,0.55)', '#fff'), display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <span aria-hidden>🔥</span>{auction.bid_count}회 입찰
              </span>
            )}
          </div>
        )}

        {/* 호버 CTA(.pcard-actions) — 상태별 라벨/색 (취소 경매 제외) */}
        {auction.status !== 'cancelled' && (
          <div className="pcard-actions">
            <span className="pcard-btn" style={{ ...ctaStyle(bidStatus), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {ctaLabel(bidStatus)}
            </span>
          </div>
        )}
      </div>

      {/* ── 본문(좌우 패딩 0 = Figma full-bleed) ── */}
      <div style={{ background: '#fff', padding: '16px 0 20px 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* 배지행: [예정(검정)] [새 제품] */}
          {(isScheduled || auction.is_new) && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              {isScheduled && (
                <span style={{ background: '#000', color: '#fff', border: '1px solid #000', fontSize: 14, lineHeight: 1.3, padding: '4px 8px', whiteSpace: 'nowrap' }}>
                  예정
                </span>
              )}
              {auction.is_new && (
                <span style={{ background: '#fff', color: '#000', border: '1px solid #000', fontSize: 14, lineHeight: 1.3, padding: '4px 8px', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                  새 제품
                </span>
              )}
            </div>
          )}

          {/* 제목 + 가격 */}
          <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
            <p
              style={{
                margin: 0, fontSize: 20, fontWeight: 500, lineHeight: 1.4, color: '#111',
                letterSpacing: '-0.2px',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}
            >
              {auction.product_name}
            </p>

            {/* 가격행: 시작가(입찰 시 취소선) + 현재가(빨강 라벨, 입찰 있을 때만) */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 16, color: '#9f9f9f', letterSpacing: '0.16px', lineHeight: 1.4 }}>시작가</span>
                <span style={{ fontSize: 20, color: '#000', letterSpacing: '0.2px', lineHeight: 1.4, textDecoration: hasBids ? 'line-through' : 'none' }}>
                  {auction.start_price.toLocaleString()}원
                </span>
              </span>
              {hasBids && (
                <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 16, color: '#ff2e2e', letterSpacing: '0.16px', lineHeight: 1.4 }}>현재가</span>
                  <span style={{ fontSize: 20, color: '#000', letterSpacing: '0.2px', lineHeight: 1.4 }}>
                    {auction.current_price.toLocaleString()}원
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* ← [2026-07-06] 물품 기부자 라인 복구 (Figma 미표기 — 현행 유지, 상세와 동일 정보) */}
          {auction.donor && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, paddingBottom: 16 }}>
              <Avatar name={auction.donor.name} avatarUrl={auction.donor.avatar_url} size={24} />
              <span style={{ fontSize: 14, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {auction.donor.name} 기부
              </span>
            </div>
          )}

          {/* 카운트다운 바 (#e8ff68) — 진행중=종료까지 / 예정=시작까지 */}
          {showCountdown && (
            <div
              style={{
                background: '#e8ff68', color: '#111',
                padding: '6px 10px', // ← [2026-07-07] 32px→10px: 167px 카드에 과한 좌우 패딩 축소(타이머 표시 공간 확보)
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'clamp(10px, 5.4cqi, 14px)', // ← [2026-07-07] 카드폭 비례 축소(.pcard container). 좁은 2열=10px, 넓은 데스크톱=14px → 어떤 타이머 길이도 안 잘림
                lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden',
              }}
            >
              ⌛ {formatTimeLeft(targetMs)} 남음
            </div>
          )}
          {/* 종료 낙찰가 (Figma 미표기 — 현행 유지) */}
          {isEnded && auction.winner_final_price && (
            <div style={{ fontSize: 13, color: '#10b981', fontWeight: 600, marginTop: 4 }}>
              🏆 낙찰가 {auction.winner_final_price.toLocaleString()}원
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// 오버레이 배지 공통 스타일 (Pretendard 14px, px8 py4, leading 1.3)
function overlayBadge(bg: string, color: string): React.CSSProperties {
  return { padding: '4px 8px', background: bg, color, fontSize: 14, lineHeight: 1.3, fontWeight: 400, whiteSpace: 'nowrap', textAlign: 'center' };
}

// 호버 CTA 라벨/스타일 (상태별)
function ctaLabel(s: BidStatus): string {
  return s === 'highest' ? '내가 최고가 입찰중' : s === 'outbid' ? '입찰에서 밀려남' : '경매 물품 보기';
}
function ctaStyle(s: BidStatus): React.CSSProperties {
  if (s === 'highest') return { background: '#99f75d', color: '#111' };
  if (s === 'outbid') return { background: '#e8ff68', color: '#111' };
  return { background: '#000', color: '#fff', textTransform: 'capitalize' };
}

function AuctionSkeleton() {
  return (
    <div className="shop-grid" style={{ marginTop: 24, display: 'grid', gap: 16 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ background: '#fff', overflow: 'hidden' }}>
          <div style={{ aspectRatio: '1 / 1', background: '#f5f5f5' }} />
          <div style={{ padding: '16px 0' }}>
            <div style={{ height: 20, background: '#f0f0f0', borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 20, background: '#f0f0f0', borderRadius: 4, width: '50%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filtered = false }: { filtered?: boolean }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 48,
        textAlign: 'center',
        border: '1px dashed #ddd',
        marginTop: 24,
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🔨</div>
      <p style={{ margin: 0, color: '#888' }}>
        {filtered ? '선택한 기부자의 경매가 없습니다.' : '아직 등록된 경매가 없습니다.'}
      </p>
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      style={{
        marginTop: 24,
        background: '#fee2e2',
        color: '#991b1b',
        padding: 16,
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
