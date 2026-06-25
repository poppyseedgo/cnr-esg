// ============================================================================
// AuctionPage — 경매 목록
//
// 기능:
//   - 경매 카드 그리드 (sort_order 순)
//   - 상태 배지 (예정 / 진행 중 / 종료)
//   - 진행 중인 경매: 카운트다운, 현재가
//   - Realtime (현재가 / 상태 변경 즉시 반영)
//   - 활동 기간 안내
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useEventPhase } from '@/hooks/useEventPhase';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'; // ← [2026-06-04] 무한 스크롤
import {
  loadAuctions,
  subscribeAuctions,
  onAuctionChanged,
  getAuctionTimeLeft,
  AUCTION_STATUS_LABELS,
  AUCTION_STATUS_COLORS,
} from '@/lib/auctions';
import { formatTimeLeft } from '@/lib/orders';
import { formatKSTDate, formatKSTFull } from '@/utils/time';
import { InfiniteScrollFooter } from '@/components/InfiniteScrollFooter'; // ← [2026-06-04]
import { BlurImage } from '@/components/BlurImage'; // ← [2026-06-19] 썸네일 lazy+블러업
import { Avatar } from '@/components/Avatar'; // ← [2026-06-23] 기부자 아바타
import type { EsgAuctionRow } from '@/types/esg';

export function AuctionPage() {
  const { getActivity } = useEventPhase();
  const { period, status } = getActivity('auction');

  // 무한 스크롤 — 12개씩 누적 로드 (sort_order, starts_at)
  const fetchPage = useCallback(
    (offset: number, limit: number) => loadAuctions({ offset, limit }),
    []
  );
  const {
    items: auctions,
    initialLoading,
    loadingMore,
    error,
    sentinelRef,
    reload,
    refresh,
  } = useInfiniteScroll<EsgAuctionRow>(fetchPage, { pageSize: 12 });

  const [, setTick] = useState(0);

  // Realtime + 같은 탭 즉시 신호 — 조용히 제자리 갱신(깜빡임 없음)
  useEffect(() => {
    const cleanupRT = subscribeAuctions(() => {
      refresh();
    });
    const cleanupEvent = onAuctionChanged(() => {
      refresh();
    });
    return () => {
      cleanupRT();
      cleanupEvent();
    };
  }, [refresh]);

  // 카운트다운 갱신 (1초)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🔨 ESG 온라인 경매</h1>
          <p style={{ color: '#666', margin: '4px 0 0' }}>실시간 비딩으로 한정 굿즈를 낙찰받으세요.</p>
        </div>
        {/* ← [2026-06-26] 어드민 '새 경매 등록' CTA·모달 제거(요청) — 경매 등록은 어드민 관리 탭에서 */}
      </div>

      {/* 상태 안내 */}
      {period && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background:
              status === 'active' ? '#dcfce7' : status === 'before' ? '#fef3c7' : '#f0f0f0',
            color:
              status === 'active' ? '#166534' : status === 'before' ? '#92400e' : '#666',
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {status === 'active' && (
            <>
              ✅ <strong>경매 진행 중</strong> · {formatKSTDate(period.ends_at_utc)}까지
            </>
          )}
          {status === 'before' && (
            <>⏳ {formatKSTDate(period.starts_at_utc)}부터 입찰 가능합니다 (구경은 가능)</>
          )}
          {status === 'closed' && '🏁 경매 기간이 종료되었습니다. 낙찰자에게는 별도 안내됩니다.'}
          {period.note && (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{period.note}</div>
          )}
        </div>
      )}

      {/* 그리드 */}
      {initialLoading ? (
        <AuctionSkeleton />
      ) : error && auctions.length === 0 ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : auctions.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          className="shop-grid"
          style={{ marginTop: 24, display: 'grid', gap: 16 }}
        >
          {auctions.map((a) => (
            <AuctionCard key={a.id} auction={a} />
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

function AuctionCard({ auction }: { auction: EsgAuctionRow }) {
  const statusColor = AUCTION_STATUS_COLORS[auction.status];
  const timeLeftMs = getAuctionTimeLeft(auction.ends_at);
  const isActive = auction.status === 'active';
  const showCountdown = isActive && timeLeftMs > 0;

  return (
    <Link
      to={`/auction/${auction.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid #eee',
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        textDecoration: 'none',
        color: 'inherit',
        opacity: auction.status === 'cancelled' ? 0.5 : 1,
      }}
    >
      {/* 썸네일 */}
      <div
        style={{
          width: '100%',
          aspectRatio: '4 / 3',
          background: auction.thumbnail_url
            ? '#f2f2f2'
            : 'linear-gradient(135deg, #fef3c7, #fed7aa)',
          position: 'relative',
          overflow: 'hidden', // 블러 레이어 가장자리 비침 클립 (scale 미사용 — 6/19 제거됨)
        }}
      >
        {/* 썸네일 이미지 — lazy + LQIP 블러업 (배지보다 먼저 = 아래) */}
        {auction.thumbnail_url && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <BlurImage url={auction.thumbnail_url} width={640} />
          </div>
        )}
        <span
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            padding: '3px 8px',
            background: statusColor.bg,
            color: statusColor.color,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {AUCTION_STATUS_LABELS[auction.status]}
        </span>
        {auction.bid_count > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              padding: '3px 8px',
              background: 'rgba(0,0,0,0.6)',
              color: '#fff',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            🔥 {auction.bid_count}회 입찰
          </span>
        )}
      </div>

      {/* 본문 */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: 'calc(1.4em * 2)',
          }}
        >
          {auction.product_name}
        </h3>

        {/* ← [2026-06-23] 물품 기부자 (이름 + 아바타) */}
        {auction.donor && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Avatar name={auction.donor.name} avatarUrl={auction.donor.avatar_url} size={20} />
            <span style={{ fontSize: 12, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {auction.donor.name} 기부
            </span>
          </div>
        )}

        <div style={{ marginTop: 'auto' }}>
          <div style={{ fontSize: 11, color: '#888' }}>
            {auction.bid_count > 0 ? '현재가' : '시작가'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#222' }}>
            {auction.current_price.toLocaleString()}원
          </div>
        </div>

        {showCountdown && (
          <div
            style={{
              padding: '6px 8px',
              background: timeLeftMs < 3600 * 1000 ? '#fee2e2' : '#fef3c7',
              color: timeLeftMs < 3600 * 1000 ? '#991b1b' : '#92400e',
              borderRadius: 4,
              fontSize: 11,
              textAlign: 'center',
              fontWeight: 600,
            }}
          >
            ⏰ {formatTimeLeft(timeLeftMs)} 남음
          </div>
        )}
        {auction.status === 'scheduled' && (
          <div style={{ fontSize: 11, color: '#888' }}>
            🗓 {formatKSTFull(auction.starts_at)} 시작
          </div>
        )}
        {auction.status === 'ended' && auction.winner_final_price && (
          <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>
            🏆 낙찰가 {auction.winner_final_price.toLocaleString()}원
          </div>
        )}
      </div>
    </Link>
  );
}

function AuctionSkeleton() {
  return (
    <div
      className="shop-grid"
      style={{ marginTop: 24, display: 'grid', gap: 16 }}
    >
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            background: '#fff',
            borderRadius: 12,
            border: '1px solid #eee',
            overflow: 'hidden',
          }}
        >
          <div style={{ aspectRatio: '4 / 3', background: '#f5f5f5' }} />
          <div style={{ padding: 16 }}>
            <div style={{ height: 14, background: '#f0f0f0', borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 18, background: '#f0f0f0', borderRadius: 4, width: '50%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
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
      <p style={{ margin: 0, color: '#888' }}>아직 등록된 경매가 없습니다.</p>
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
