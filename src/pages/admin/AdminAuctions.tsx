// ============================================================================
// AdminAuctions — 경매 어드민 페이지
//
// 편집 폼은 AuctionEditForm 공통 컴포넌트 사용 (상세 페이지와 코드 공유).
//
// [변경이력]
//   2026-07-06 · 노출 순서 드래그 재정렬 추가(⠿ 그립 드래그 → sort_order 1..N 저장).
//              reorderAuctions()→reorder_auctions RPC(원자적). 낙관적 갱신 + 실패 시 reload 복구.
//              공개/어드민 목록 모두 sort_order 순 정렬이라 이 순서가 그대로 노출에 반영됨.
// ============================================================================

import { useEffect, useRef, useState } from 'react'; // ← [2026-07-06] useRef 추가(드래그 인덱스)
import { Link } from 'react-router-dom';
import {
  loadAuctions,
  subscribeAuctions,
  AUCTION_STATUS_LABELS,
  AUCTION_STATUS_COLORS,
} from '@/lib/auctions';
import { deleteAuctionAdmin, reorderAuctions } from '@/lib/adminAuctions'; // ← [2026-06-23] 삭제 / [2026-07-06] 재정렬
import { AuctionEditForm } from '@/components/admin/AuctionEditForm';
import { CreateAuctionForm } from '@/components/admin/CreateAuctionForm';
import { BidManagerModal } from '@/components/admin/BidManagerModal'; // ← [2026-07-07] 입찰 삭제 관리
import { AuctionMetricsPanel } from '@/components/admin/AuctionMetricsPanel'; // ← [2026-07-10] 경매 지표 뷰
import type { EsgAuctionRow } from '@/types/esg';

export function AdminAuctions() {
  const [auctions, setAuctions] = useState<EsgAuctionRow[]>([]);
  const [view, setView] = useState<'manage' | 'metrics'>('manage'); // ← [2026-07-10] 관리/지표 전환
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // ← [2026-07-06] 드래그 재정렬 상태
  const dragIndexRef = useRef<number | null>(null);            // 드래그 시작 인덱스(리렌더 불필요 → ref) // ← [2026-07-06]
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null); // 드롭 위치 강조 // ← [2026-07-06]
  const [reordering, setReordering] = useState(false);         // 순서 저장 중 // ← [2026-07-06]

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

  // ← [2026-07-06] 드롭 → 로컬 낙관적 재배열 후 sort_order 일괄 저장(실패 시 서버 상태 복구)
  const handleDrop = async (targetIndex: number) => {
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    if (from === null || from === targetIndex) return;

    const next = [...auctions];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    setAuctions(next);                                          // 낙관적 갱신(깜빡임 방지)

    setReordering(true);
    try {
      await reorderAuctions(next.map((a) => a.id));             // sort_order 1..N 재할당
    } catch (e) {
      alert(e instanceof Error ? e.message : '순서 저장 실패');
      void reload();                                            // 실패 시 서버 상태로 복구
    } finally {
      setReordering(false);
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* ← [2026-07-10] 관리/지표 뷰 토글 */}
          <div style={{ display: 'flex', gap: 4, background: '#f0f0f0', borderRadius: 8, padding: 3 }}>
            {(['manage', 'metrics'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: view === v ? '#fff' : 'transparent',
                  color: view === v ? '#111' : '#888',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {v === 'manage' ? '⚙️ 관리' : '📊 지표'}
              </button>
            ))}
          </div>
          {view === 'manage' && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              style={{
                padding: '8px 14px',
                background: '#111',
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
          )}
        </div>
      </div>

      {/* ← [2026-07-10] 지표 뷰: 경매별 입찰수·고유입찰자·최종 낙찰가·낙찰자 + 입찰자 명단 */}
      {view === 'metrics' ? (
        <AuctionMetricsPanel />
      ) : (
        <>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        이름, 설명, 이미지, 호가 단위, 시작/종료 시각을 관리. 상세 페이지에서도 편집 가능합니다.
        {/* ← [2026-07-06] 드래그 재정렬 안내 */}
        <span style={{ marginLeft: 6, color: '#16a34a' }}>
          좌측 <strong>⠿</strong> 그립을 드래그하면 노출 순서를 변경할 수 있습니다.
        </span>
        {reordering && <span style={{ marginLeft: 8, color: '#16a34a', fontWeight: 600 }}>· 순서 저장 중…</span>}
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
            border: '2px solid #111',
          }}
        >
          <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#111' }}>➕ 새 경매 등록</h3>
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
        // ← [2026-07-06] 세로 리스트 드래그 재정렬: 좌측 ⠿ 그립이 draggable, 행 전체가 드롭 타깃
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {auctions.map((a, i) => (
            <div
              key={a.id}
              onDragOver={(e) => {                              // ← [2026-07-06] 드롭 허용 + 위치 강조
                e.preventDefault();
                if (dragOverIndex !== i) setDragOverIndex(i);
              }}
              onDrop={() => handleDrop(i)}                      // ← [2026-07-06]
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'stretch',
                borderRadius: 12,
                outline: dragOverIndex === i ? '2px solid #16a34a' : '2px solid transparent', // ← [2026-07-06] 드롭 위치 링
                outlineOffset: 2,
                transition: 'outline-color 0.1s',
              }}
            >
              {/* ⠿ 그립: 드래그 시작점 */}{/* ← [2026-07-06] */}
              <div
                draggable
                onDragStart={() => { dragIndexRef.current = i; }}       // ← [2026-07-06]
                onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(null); }} // ← [2026-07-06]
                title="드래그하여 노출 순서 변경"
                style={{
                  flexShrink: 0,
                  width: 30,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#fafafa',
                  border: '1px solid #eee',
                  borderRadius: 10,
                  color: '#9a9a9a',
                  fontSize: 18,
                  lineHeight: 1,
                  userSelect: 'none',
                  cursor: 'grab',
                }}
              >
                ⠿
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <AuctionAdminCard auction={a} onChange={reload} />
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// 개별 경매 카드 (AuctionEditForm 사용)
// ============================================================================

function AuctionAdminCard({ auction, onChange }: { auction: EsgAuctionRow; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false); // ← [2026-06-23] 삭제 진행중
  const [managingBids, setManagingBids] = useState(false); // ← [2026-07-07] 입찰 관리 모달
  const statusColor = AUCTION_STATUS_COLORS[auction.status];

  // ← [2026-06-23] 상태/입찰 무관 영구 삭제. 입찰/낙찰이 있으면 경고 후 진행.
  const handleDelete = async () => {
    const hasBids = auction.bid_count > 0;
    const warn = hasBids
      ? `입찰 ${auction.bid_count}건이 함께 삭제됩니다. (낙찰/주문이 있으면 주문 기록은 보존되지만 경매 연결은 끊깁니다)\n\n`
      : '';
    if (!window.confirm(`${warn}"${auction.product_name}" 경매를 영구 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    try {
      await deleteAuctionAdmin(auction.id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패');
      setDeleting(false);
    }
  };

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
          {/* ← [2026-07-10] 종료 경매: 최종 낙찰가/낙찰자 한 줄 표기 (없으면 유찰) */}
          {auction.status === 'ended' && (
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {auction.winner_id ? (
                <span style={{ color: '#16a34a', fontWeight: 600 }}>
                  🏆 낙찰 {(auction.winner_final_price ?? auction.current_price).toLocaleString()}원
                  {auction.winner_email && (
                    <span style={{ color: '#888', fontWeight: 400, marginLeft: 6 }}>· {auction.winner_email}</span>
                  )}
                </span>
              ) : (
                <span style={{ color: '#999' }}>유찰 (입찰 없음)</span>
              )}
            </div>
          )}
        </div>

        {!editing && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={auction.status === 'cancelled' || deleting}
              style={{
                padding: '4px 10px',
                background: '#fff',
                border: '1px solid #111',
                color: '#111',
                borderRadius: 4,
                cursor: auction.status === 'cancelled' || deleting ? 'not-allowed' : 'pointer',
                fontSize: 11,
                whiteSpace: 'nowrap',
              }}
            >
              ✏️ 수정
            </button>
            {/* ← [2026-07-07] 입찰 관리(잘못된 입찰 삭제 + 최고가 재산정) */}
            <button
              type="button"
              onClick={() => setManagingBids(true)}
              disabled={deleting}
              style={{
                padding: '4px 10px',
                background: '#fff',
                border: '1px solid #0ea5e9',
                color: '#0ea5e9',
                borderRadius: 4,
                cursor: deleting ? 'not-allowed' : 'pointer',
                fontSize: 11,
                whiteSpace: 'nowrap',
              }}
            >
              🧾 입찰 관리
            </button>
            {/* ← [2026-06-23] 상태/입찰 무관 영구 삭제 */}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              style={{
                padding: '4px 10px',
                background: '#fff',
                border: '1px solid #dc2626',
                color: '#dc2626',
                borderRadius: 4,
                cursor: deleting ? 'not-allowed' : 'pointer',
                fontSize: 11,
                whiteSpace: 'nowrap',
              }}
            >
              {deleting ? '삭제 중…' : '🗑 삭제'}
            </button>
          </div>
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

      {/* ← [2026-07-07] 입찰 관리 모달 — 삭제 시 최고가/입찰수 재산정 → 카드 갱신 */}
      {managingBids && (
        <BidManagerModal
          auction={auction}
          onClose={() => setManagingBids(false)}
          onChanged={onChange}
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
