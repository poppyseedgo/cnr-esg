// ============================================================================
// AuctionMetricsPanel — 경매 지표(관리자, 읽기 전용)
//
// 경매별: 입찰 횟수 · 고유 입찰자 수 · 최고/최종 낙찰가 · 최종 낙찰자.
//   행을 펼치면 입찰자 명단(누가/얼마/언제)을 조회 — adminListAuctionBids 재사용.
//   집계는 esg_admin_auction_metrics() RPC(SSOT). CSV 내보내기 지원.
//
// [2026-07-10] 신규 — 경매 내역 지표 기능.
// ============================================================================

import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from 'react';
import {
  loadAuctionMetrics,
  adminListAuctionBids,
  type AuctionMetric,
} from '@/lib/adminAuctions';
import { AUCTION_STATUS_LABELS, AUCTION_STATUS_COLORS } from '@/lib/auctions';
import { downloadCsv, todayStampKst } from '@/utils/csv';
import { downloadSvg, buildTableSvg } from '@/utils/svgExport'; // ← [2026-07-10] 경매 지표 SVG
import type { EsgAuctionBidRow } from '@/types/esg';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

// KST 밀리초까지 (낙찰자 뒤바뀜 감사와 동일 포맷)
const kst = (iso: string | null): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  const base = d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${base}.${ms}`;
};

export function AuctionMetricsPanel() {
  const [rows, setRows] = useState<AuctionMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const reload = async () => {
    try {
      setError(null);
      setLoading(true);
      setRows(await loadAuctionMetrics());
    } catch (e) {
      setError(e instanceof Error ? e.message : '경매 지표를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // 요약 지표
  const summary = useMemo(() => {
    const total = rows.length;
    const ended = rows.filter((r) => r.status === 'ended').length;
    const totalBids = rows.reduce((s, r) => s + r.bid_count, 0);
    const wonSum = rows.reduce((s, r) => s + (r.winner_final_price ?? 0), 0);
    return { total, ended, totalBids, wonSum };
  }, [rows]);

  const handleExport = () =>
    downloadCsv(
      `경매지표_${todayStampKst()}.csv`,
      ['물품명', '상태', '시작가', '입찰횟수', '고유입찰자', '최고입찰가', '최종낙찰가', '최종낙찰자', '낙찰자이메일', '기부자', '시작일시', '종료일시'],
      rows.map((r) => [
        r.product_name,
        AUCTION_STATUS_LABELS[r.status],
        r.start_price,
        r.bid_count,
        r.unique_bidders,
        r.highest_bid,
        r.winner_final_price ?? '',
        r.winner_name ?? '',
        r.winner_email ?? '',
        r.donor_name ?? '',
        kst(r.starts_at),
        kst(r.ends_at),
      ]),
    );

  // ← [2026-07-10] 경매 지표 SVG 내보내기
  const handleExportSvg = () => {
    if (rows.length === 0) return;
    const svg = buildTableSvg({
      title: '경매 지표',
      subtitle: `내보낸 시각 ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
      kpis: [
        { label: '경매 수', value: `${summary.total}건` },
        { label: '낙찰 완료', value: `${summary.ended}건` },
        { label: '총 입찰', value: `${summary.totalBids}회` },
        { label: '총 낙찰가', value: won(summary.wonSum) },
      ],
      columns: [
        { header: '물품명', width: 220 },
        { header: '상태', width: 72 },
        { header: '입찰수', width: 72, align: 'right' },
        { header: '입찰자', width: 72, align: 'right' },
        { header: '최고/낙찰가', width: 120, align: 'right' },
        { header: '최종 낙찰자', width: 140 },
      ],
      rows: rows.map((r) => [
        r.product_name,
        AUCTION_STATUS_LABELS[r.status],
        `${r.bid_count}회`,
        `${r.unique_bidders}명`,
        r.status === 'ended'
          ? r.winner_final_price != null
            ? won(r.winner_final_price)
            : '유찰'
          : won(r.highest_bid),
        r.winner_name ?? (r.status === 'ended' ? '유찰' : '-'),
      ]),
    });
    downloadSvg(`경매지표_${todayStampKst()}.svg`, svg);
  };

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>지표 불러오는 중…</div>;
  }
  if (error) {
    return <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>⚠️ {error}</div>;
  }

  return (
    <div>
      {/* 요약 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <SummaryChip label="경매 수" value={`${summary.total}건`} />
        <SummaryChip label="낙찰 완료" value={`${summary.ended}건`} />
        <SummaryChip label="총 입찰" value={`${summary.totalBids}회`} />
        <SummaryChip label="총 낙찰가" value={won(summary.wonSum)} strong />
        <button
          type="button"
          onClick={handleExport}
          style={{ ...exportBtn, marginLeft: 'auto' }}
          disabled={rows.length === 0}
        >
          ⬇ CSV
        </button>
        {/* ← [2026-07-10] SVG 내보내기 */}
        <button
          type="button"
          onClick={handleExportSvg}
          style={{ ...exportBtn, marginLeft: 6 }}
          disabled={rows.length === 0}
        >
          ⬇ SVG
        </button>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>등록된 경매가 없습니다.</div>
      ) : (
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', color: '#666', textAlign: 'left' }}>
                <Th />
                <Th>물품명</Th>
                <Th>상태</Th>
                <Th right>입찰수</Th>
                <Th right>입찰자</Th>
                <Th right>최고/낙찰가</Th>
                <Th>최종 낙찰자</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = expanded.has(r.auction_id);
                const sc = AUCTION_STATUS_COLORS[r.status];
                const isEnded = r.status === 'ended';
                return (
                  <BidRows key={r.auction_id}>
                    <tr
                      onClick={() => toggle(r.auction_id)}
                      style={{ borderTop: '1px solid #f0f0f0', cursor: 'pointer' }}
                    >
                      <Td><span style={{ color: '#bbb' }}>{open ? '▾' : '▸'}</span></Td>
                      <Td strong>{r.product_name}</Td>
                      <Td>
                        <span style={{ padding: '2px 8px', background: sc.bg, color: sc.color, borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                          {AUCTION_STATUS_LABELS[r.status]}
                        </span>
                      </Td>
                      <Td right>{r.bid_count}회</Td>
                      <Td right>{r.unique_bidders}명</Td>
                      <Td right strong>
                        {/* 종료면 최종 낙찰가, 진행 중이면 현재 최고가 */}
                        {isEnded
                          ? r.winner_final_price != null
                            ? won(r.winner_final_price)
                            : '유찰'
                          : won(r.highest_bid)}
                        {!isEnded && (
                          <div style={{ fontSize: 10, fontWeight: 400, color: '#aaa' }}>현재 최고가</div>
                        )}
                      </Td>
                      <Td>
                        {r.winner_id ? (
                          <span>
                            🏆 {r.winner_name ?? '(이름없음)'}
                            {r.winner_anonymous && <span style={{ color: '#888', fontSize: 11, marginLeft: 4 }}>🕶</span>}
                            <div style={{ fontSize: 11, color: '#aaa' }}>{r.winner_email}</div>
                          </span>
                        ) : (
                          <span style={{ color: '#bbb' }}>{isEnded ? '유찰' : '-'}</span>
                        )}
                      </Td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={7} style={{ background: '#fafafa', padding: '10px 16px' }}>
                          <BidderList auctionId={r.auction_id} endsAt={r.ends_at} />
                        </td>
                      </tr>
                    )}
                  </BidRows>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 입찰자 명단 (행 펼침 시 로드) ─────────────────────────────────────────────
function BidderList({ auctionId, endsAt }: { auctionId: string; endsAt: string }) {
  const [bids, setBids] = useState<EsgAuctionBidRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    adminListAuctionBids(auctionId)
      .then((b) => alive && setBids(b))
      .catch((e) => alive && setError(e instanceof Error ? e.message : '입찰 명단 로드 실패'));
    return () => {
      alive = false;
    };
  }, [auctionId]);

  if (error) return <div style={{ color: '#991b1b', fontSize: 12 }}>⚠️ {error}</div>;
  if (bids === null) return <div style={{ color: '#888', fontSize: 12 }}>입찰 명단 불러오는 중…</div>;
  if (bids.length === 0) return <div style={{ color: '#888', fontSize: 12 }}>입찰 내역이 없습니다.</div>;

  const endMs = new Date(endsAt).getTime();

  return (
    <div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 8, fontWeight: 600 }}>
        입찰자 명단 <span style={{ color: '#aaa', fontWeight: 400 }}>· 최신순 · {bids.length}건</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {bids.map((b, idx) => {
          const isTop = idx === 0; // 최신순 → 0번이 현재 최고가
          const afterEnd = new Date(b.created_at).getTime() > endMs; // 종료 후 입찰(무효) 감사
          return (
            <div
              key={b.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 6,
                background: isTop ? '#f0fdf4' : '#fff',
                border: isTop ? '1px solid #bbf7d0' : '1px solid #eee',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111', width: 100, textAlign: 'right' }}>
                {won(b.bid_amount)}
              </span>
              <span style={{ flex: 1, fontSize: 12, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.user_name_snapshot}
                {b.is_anonymous && <span style={{ color: '#888', marginLeft: 4 }}>🕶</span>}
                <span style={{ color: '#aaa', marginLeft: 6 }}>{b.user_email}</span>
              </span>
              {isTop && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>최고가</span>}
              {afterEnd && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>종료후</span>}
              <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>🕒 {kst(b.created_at)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 소품 ─────────────────────────────────────────────────────────────────────
function SummaryChip({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '8px 14px' }}>
      <span style={{ fontSize: 12, color: '#888' }}>{label} </span>
      <strong style={{ fontSize: 14, color: strong ? '#16a34a' : '#222' }}>{value}</strong>
    </div>
  );
}

function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return (
    <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, textAlign: right ? 'right' : 'left' }}>
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  strong,
}: {
  children?: ReactNode;
  right?: boolean;
  strong?: boolean;
}) {
  return (
    <td
      style={{
        padding: '10px 12px',
        textAlign: right ? 'right' : 'left',
        fontWeight: strong ? 600 : 400,
        color: strong ? '#111' : '#444',
        verticalAlign: 'top',
      }}
    >
      {children}
    </td>
  );
}

// tbody 안에서 여러 <tr>을 key로 묶기 위한 Fragment 래퍼
function BidRows({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

const exportBtn: CSSProperties = {
  padding: '8px 14px',
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  color: '#333',
};
