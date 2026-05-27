// ============================================================================
// AdminAuctions — 경매 어드민 페이지
//
// 편집 폼은 AuctionEditForm 공통 컴포넌트 사용 (상세 페이지와 코드 공유).
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  loadAuctions,
  subscribeAuctions,
  AUCTION_STATUS_LABELS,
  AUCTION_STATUS_COLORS,
} from '@/lib/auctions';
import { AuctionEditForm } from '@/components/admin/AuctionEditForm';
import { CreateAuctionForm } from '@/components/admin/CreateAuctionForm';
import type { EsgAuctionRow } from '@/types/esg';

export function AdminAuctions() {
  const [auctions, setAuctions] = useState<EsgAuctionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    try {
      setError(null);
      const list = await loadAuctions({ statuses: ['scheduled', 'active', 'ended', 'cancelled'] });
      setAuctions(list);
    } catch (e) {
      console.error('[AdminAuctions]', e);
      setError(e instanceof Error ? e.message : '경매를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
  }, []);

  useEffect(() => {
    const cleanup = subscribeAuctions(() => {
      void reload();
    });
    return cleanup;
  }, []);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>;
  if (error) return <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>⚠️ {error}</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>🔨 경매 관리</h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          style={{
            padding: '8px 14px',
            background: '#0ea5e9',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ➕ 새 경매 등록
        </button>
      </div>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        이름, 설명, 이미지, 호가 단위, 시작/종료 시각을 관리. 상세 페이지에서도 편집 가능합니다.
      </p>

      <div
        style={{
          padding: 12,
          background: '#fef3c7',
          color: '#92400e',
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.6,
          marginBottom: 16,
        }}
      >
        ⚠️ <strong>진행 중인 경매 변경 주의</strong>: 호가 단위, 시작가 변경은 입찰자에게 혼란을 줄 수 있습니다.
      </div>

      {creating && (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            border: '2px solid #0ea5e9',
          }}
        >
          <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#0ea5e9' }}>➕ 새 경매 등록</h3>
          <CreateAuctionForm
            onCancel={() => setCreating(false)}
            onSuccess={() => {
              setCreating(false);
              void reload();
            }}
          />
        </div>
      )}

      {auctions.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🔨</div>
          <p style={{ margin: '0 0 8px', color: '#888' }}>등록된 경매가 없습니다.</p>
          <p style={{ margin: 0, fontSize: 12, color: '#bbb' }}>
            우측 상단 "➕ 새 경매 등록" 버튼으로 추가하세요.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {auctions.map((a) => (
            <AuctionAdminCard key={a.id} auction={a} onChange={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 개별 경매 카드 (AuctionEditForm 사용)
// ============================================================================

function AuctionAdminCard({ auction, onChange }: { auction: EsgAuctionRow; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const statusColor = AUCTION_STATUS_COLORS[auction.status];

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        border: '1px solid #eee',
        opacity: auction.status === 'cancelled' ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: editing ? 16 : 0 }}>
        <Link
          to={`/auction/${auction.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            width: 56,
            height: 56,
            flexShrink: 0,
            borderRadius: 8,
            background: auction.thumbnail_url ? `url(${auction.thumbnail_url}) center / cover` : '#f5f5f5',
            display: 'block',
          }}
          aria-label="사용자 화면으로 보기"
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ padding: '2px 8px', background: statusColor.bg, color: statusColor.color, borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
              {AUCTION_STATUS_LABELS[auction.status]}
            </span>
            {auction.bid_count > 0 && (
              <span style={{ fontSize: 11, color: '#666' }}>🔥 {auction.bid_count}회 입찰</span>
            )}
            <span style={{ fontSize: 11, color: '#bbb', fontFamily: 'monospace' }}>
              ID: {auction.id.slice(0, 8)}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{auction.product_name}</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            현재가: <strong>{auction.current_price.toLocaleString()}원</strong>
            {auction.bid_count > 0 && (
              <span style={{ marginLeft: 6, color: '#888' }}>
                (다음 최소: {(auction.current_price + auction.bid_unit).toLocaleString()}원)
              </span>
            )}
            <span style={{ marginLeft: 8, color: '#888' }}>
              · 호가 {auction.bid_unit.toLocaleString()}원
            </span>
          </div>
        </div>

        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={auction.status === 'cancelled'}
            style={{
              padding: '4px 10px',
              background: '#fff',
              border: '1px solid #0ea5e9',
              color: '#0ea5e9',
              borderRadius: 4,
              cursor: auction.status === 'cancelled' ? 'not-allowed' : 'pointer',
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            ✏️ 수정
          </button>
        )}
      </div>

      {editing && (
        <AuctionEditForm
          auction={auction}
          onSuccess={() => {
            setEditing(false);
            onChange();
          }}
          onCancel={() => setEditing(false)}
          onTerminated={() => {
            setEditing(false);
            onChange();
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// 공통 UI
// ============================================================================

const emptyStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 48,
  textAlign: 'center',
  border: '1px dashed #ddd',
};
