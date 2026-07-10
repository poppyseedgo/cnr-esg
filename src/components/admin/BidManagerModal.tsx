// ============================================================================
// BidManagerModal — 경매 입찰 관리(관리자)
//
// 용도: 잘못된 입찰 건을 확인하고 삭제. 삭제 시 admin_delete_auction_bid RPC 가
//   최고가/최고입찰자/입찰수를 남은 입찰로 재산정 → 목록/상세 즉시 갱신.
//
// [2026-07-07] 신규 — 경매 입찰 삭제 관리(어드민).
// [2026-07-10] 낙찰자 뒤바뀜(0.01초 차이) 감사: 입찰/종료 시각을 밀리초·24시간제까지 표시.
//              (DB timestamptz엔 이미 마이크로초 저장 — 표시만 분 단위로 잘려 있던 문제. 마이그레이션 불필요)
// ============================================================================

import { useEffect, useState } from 'react';
import { adminListAuctionBids, adminDeleteAuctionBid } from '@/lib/adminAuctions';
import type { EsgAuctionRow, EsgAuctionBidRow } from '@/types/esg';

interface BidManagerModalProps {
  auction: EsgAuctionRow;
  onClose: () => void;
  /** 삭제 반영 후 부모 목록 갱신(현재가/입찰수 변동) */
  onChanged?: () => void;
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
// [2026-07-10] 낙찰자 뒤바뀜(0.01초) 감사용 — 초 단위로는 sub-second 차이가 안 보여 밀리초(3자리)까지 표시.
//              24시간제(hour12:false)로 AM/PM 혼동 제거. 밀리초는 Intl fractionalSecondDigits 대신 getMilliseconds()로 직접 조립.
//              (이 프로젝트 tsconfig lib이 ES2020 → fractionalSecondDigits 타입 미존재로 tsc TS2769 발생. ms는 TZ 오프셋 무관이라 직접 조립이 안전·호환.)
//              timestamptz엔 이미 마이크로초가 저장돼 있어 표시만 바꾸면 됨(마이그레이션 불필요).
const kst = (iso: string) => {
  const d = new Date(iso);
  const base = d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); // ← [2026-07-10] second 추가 + 24시간제
  const ms = String(d.getMilliseconds()).padStart(3, '0'); // ← [2026-07-10] 밀리초 3자리(앞자리 0 패딩) 직접 조립
  return `${base}.${ms}`;                                   // ← [2026-07-10] 최종 형태 "07. 08. 23:59:59.987"
};

export function BidManagerModal({ auction, onClose, onChanged }: BidManagerModalProps) {
  const [bids, setBids] = useState<EsgAuctionBidRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // 재산정 결과 표시용(현재가/입찰수) — 삭제 후 즉시 반영
  const [curPrice, setCurPrice] = useState(auction.current_price);
  const [curCount, setCurCount] = useState(auction.bid_count);

  const reload = async () => {
    try {
      setError(null);
      setBids(await adminListAuctionBids(auction.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '입찰 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auction.id]);

  const locked = auction.status === 'ended' || auction.status === 'cancelled'; // 삭제 불가 상태

  const handleDelete = async (bid: EsgAuctionBidRow) => {
    const who = bid.is_anonymous ? `익명(${bid.user_name_snapshot})` : bid.user_name_snapshot;
    if (!window.confirm(
      `이 입찰을 삭제할까요?\n\n· 입찰자: ${who}\n· 금액: ${won(bid.bid_amount)}\n· 시각: ${kst(bid.created_at)}\n\n` +
      `삭제하면 남은 입찰로 현재 최고가·최고입찰자·입찰수가 자동 재산정됩니다. (되돌릴 수 없음)`
    )) return;

    setDeletingId(bid.id);
    try {
      const res = await adminDeleteAuctionBid(bid.id);
      setCurPrice(res.new_current_price); // 재산정 결과 즉시 반영
      setCurCount(res.new_bid_count);
      await reload();     // 목록 갱신
      onChanged?.();      // 부모(경매 카드) 갱신
    } catch (e) {
      alert(e instanceof Error ? e.message : '입찰 삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560,
          maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* 헤더 */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>🧾 입찰 관리 — {auction.product_name}</h3>
            <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: '#555' }}>
            현재 최고가 <strong>{won(curPrice)}</strong> · 입찰 <strong>{curCount}</strong>건 · 상태 <strong>{auction.status}</strong>
          </div>
          {/* ← [2026-07-10] 낙찰자 뒤바뀜 감사: 종료 시각을 밀리초까지 노출 → 아래 입찰 시각과 직접 비교(이 시각 이전 입찰만 유효) */}
          <div style={{ marginTop: 4, fontSize: 12, color: '#888' }}>
            경매 종료 <strong style={{ color: '#dc2626', fontFamily: 'monospace' }}>{kst(auction.ends_at)}</strong> — 이 시각 이전 입찰만 유효
          </div>
          {locked && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: '#fef3c7', color: '#92400e', borderRadius: 6, fontSize: 12 }}>
              ⚠️ {auction.status === 'ended' ? '종료(낙찰)된' : '취소된'} 경매입니다 — 정산 보호를 위해 입찰 삭제가 차단됩니다.
            </div>
          )}
        </div>

        {/* 본문 */}
        <div style={{ padding: 12, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
          ) : error ? (
            <div style={{ padding: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>⚠️ {error}</div>
          ) : bids.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>입찰 내역이 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {bids.map((b, idx) => {
                const isTop = idx === 0; // 최신순 → 0번이 최고가(정상 오름차순 경매 기준)
                return (
                  <div
                    key={b.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      background: isTop ? '#f0fdf4' : '#fafafa',
                      border: isTop ? '1px solid #bbf7d0' : '1px solid #eee',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>
                        {won(b.bid_amount)}
                        {isTop && <span style={{ marginLeft: 6, fontSize: 11, color: '#16a34a', fontWeight: 700 }}>최고가</span>}
                        {b.is_anonymous && <span style={{ marginLeft: 6, fontSize: 11, color: '#888' }}>🕶 익명</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.user_name_snapshot} · {b.user_email}
                      </div>
                      {/* ← [2026-07-10] 입찰 시각 밀리초 표시 — 종료 시각과 대조해 낙찰 유효성 감사. 이메일이 길어도 안 잘리게 별도 줄+monospace */}
                      <div style={{ fontSize: 12, color: '#444', fontFamily: 'monospace', marginTop: 2 }}>
                        🕒 {kst(b.created_at)}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={locked || deletingId === b.id}
                      onClick={() => handleDelete(b)}
                      style={{
                        padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                        border: '1px solid #ef4444', background: '#fff', color: '#ef4444',
                        cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.5 : 1, whiteSpace: 'nowrap',
                      }}
                    >
                      {deletingId === b.id ? '삭제 중…' : '삭제'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
