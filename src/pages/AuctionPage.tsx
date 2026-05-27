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

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEventPhase } from '@/hooks/useEventPhase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
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
import { FormModal } from '@/components/FormModal';
import { CreateAuctionForm } from '@/components/admin/CreateAuctionForm';
import type { EsgAuctionRow } from '@/types/esg';

export function AuctionPage() {
  const { getActivity } = useEventPhase();
  const { period, status } = getActivity('auction');
  const { isAdmin } = useCurrentUser();

  const [auctions, setAuctions] = useState<EsgAuctionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const reload = async () => {
    try {
      setError(null);
      const list = await loadAuctions();
      setAuctions(list);
    } catch (e) {
      console.error('[AuctionPage] load error:', e);
      setError(e instanceof Error ? e.message : '경매를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
  }, []);

  // Realtime + 같은 탭 즉시 신호
  useEffect(() => {
    const cleanupRT = subscribeAuctions(() => {
      void reload();
    });
    const cleanupEvent = onAuctionChanged(() => {
      void reload();
    });
    return () => {
      cleanupRT();
      cleanupEvent();
    };
  }, []);

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
        {isAdmin && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            style={{
              padding: '10px 16px',
              background: '#0ea5e9',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            ➕ 새 경매 등록
          </button>
        )}
      </div>

      <FormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="➕ 새 경매 등록"
        maxWidth={720}
      >
        <CreateAuctionForm
          onCancel={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            void reload();
          }}
        />
      </FormModal>

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
      {loading ? (
        <AuctionSkeleton />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : auctions.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          style={{
            marginTop: 24,
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          }}
        >
          {auctions.map((a) => (
            <AuctionCard key={a.id} auction={a} />
          ))}
        </div>
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
            ? `url(${auction.thumbnail_url}) center / cover`
            : 'linear-gradient(135deg, #fef3c7, #fed7aa)',
          position: 'relative',
        }}
      >
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
      style={{
        marginTop: 24,
        display: 'grid',
        gap: 16,
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      }}
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
