// ============================================================================
// FundingSummaryPanel — 굿즈(펀딩) 집계 패널                    // ← [2026-07-14]
//
// 요구사항 2:
//   굿즈는 입금이 완료되지 않아도, 펀딩이 종료된 상품이면 펀딩 내역을 모두
//   합산한 금액을 알 수 있어야 하고 CSV로도 뽑을 수 있어야 한다.
//
// 표시 규칙:
//   - 합산 금액(유효 합계) = 펀딩참여중(pledged) + 입금대기(pending) + 결제완료(paid)
//     → 입금 여부와 무관. "펀딩 참여 총액".
//   - 취소/만료/환불은 유효 합계에서 제외하되 별도 컬럼으로 노출(은폐 없음).
//   - 종료 판정: funding_status ≠ 'live' 이거나 마감일 경과.
//
// CSV:
//   1) 펀딩집계_YYYYMMDD.csv       — 상품 단위 요약(상태별 금액 전부 포함)
//   2) 펀딩참여상세_YYYYMMDD.csv   — 참여 1건 단위(참여자/수량/금액/상태)
//   두 CSV 모두 화면 토글(종료만 보기)이 적용된 대상 그대로 내보낸다.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadFundingSummary, type FundingProductSummary, type FundingParticipationRow } from '@/lib/adminFunding';
import { downloadCsv, todayStampKst } from '@/utils/csv';
import { PAYMENT_STATUS_LABELS } from '@/lib/orders';

const won = (n: number) => n.toLocaleString('ko-KR');

function fmtKst(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`;
}

export function FundingSummaryPanel() {
  const [products, setProducts] = useState<FundingProductSummary[]>([]);
  const [parts, setParts] = useState<FundingParticipationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closedOnly, setClosedOnly] = useState(true); // 기본: 종료된 펀딩만
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadFundingSummary();
      setProducts(res.products);
      setParts(res.participations);
    } catch (e) {
      setError(e instanceof Error ? e.message : '펀딩 집계를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () => (closedOnly ? products.filter((p) => p.closed) : products),
    [products, closedOnly]
  );
  const shownIds = useMemo(() => new Set(shown.map((p) => p.product_id)), [shown]);
  const shownParts = useMemo(
    () => parts.filter((p) => shownIds.has(p.product_id)),
    [parts, shownIds]
  );

  const totalValid = shown.reduce((s, p) => s + p.valid.amount, 0);
  const totalPaid = shown.reduce((s, p) => s + p.paid.amount, 0);
  const totalUnpaid = shown.reduce((s, p) => s + p.unpaid.amount, 0);

  // ── CSV 1) 상품 단위 요약 ────────────────────────────────────────────────
  const exportSummaryCsv = () => {
    if (shown.length === 0) return;
    downloadCsv(
      `펀딩집계_${todayStampKst()}.csv`,
      [
        '상품명', '펀딩상태', '종료여부', '마감일', '입금기한',
        '목표기준', '목표금액', '목표수량', '달성률(%)',
        '참여인원',
        '합산 건수', '합산 수량', '합산 금액(미입금+입금완료)',
        '미입금 건수', '미입금 수량', '미입금 금액',
        '입금완료 건수', '입금완료 수량', '입금완료 금액',
        '펀딩참여중 금액', '입금대기 금액', '결제완료 금액',
        '취소 금액', '만료 금액', '환불 금액',
      ],
      shown.map((p) => [
        p.name,
        p.funding_status ?? '',
        p.closed ? '종료' : '진행중',
        fmtKst(p.funding_deadline),
        fmtKst(p.payment_deadline),
        p.goal_type === 'amount' ? '금액' : p.goal_type === 'quantity' ? '수량' : '',
        p.goal_amount ?? '',
        p.goal_quantity ?? '',
        p.achievement ?? '',
        p.backers,
        p.valid.count, p.valid.quantity, p.valid.amount,
        p.unpaid.count, p.unpaid.quantity, p.unpaid.amount,
        p.paid.count, p.paid.quantity, p.paid.amount,
        p.byStatus.pledged.amount,
        p.byStatus.pending.amount,
        p.byStatus.paid.amount,
        p.byStatus.cancelled.amount,
        p.byStatus.expired.amount,
        p.byStatus.refunded.amount,
      ])
    );
  };

  // ── CSV 2) 참여 1건 단위 상세 ────────────────────────────────────────────
  const exportDetailCsv = () => {
    if (shownParts.length === 0) return;
    downloadCsv(
      `펀딩참여상세_${todayStampKst()}.csv`,
      ['상품명', '종료여부', '주문번호', '참여자', '부서', '이메일', '입금자명', '수량', '금액', '상태', '입금확인일시', '참여일시'],
      shownParts.map((r) => [
        r.product_name,
        r.closed ? '종료' : '진행중',
        r.order_number,
        r.user_name,
        r.user_dept,
        r.user_email,
        r.payer_name,
        r.quantity,
        r.amount,
        PAYMENT_STATUS_LABELS[r.payment_status] ?? r.payment_status,
        fmtKst(r.paid_at),
        fmtKst(r.created_at),
      ])
    );
  };

  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px', fontSize: 13, color: '#111', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' };
  const btn: React.CSSProperties = { padding: '8px 12px', background: '#fff', border: '1px solid #ddd', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#333', whiteSpace: 'nowrap' };

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ ...btn, border: 'none', background: 'transparent', padding: 0, fontSize: 15, fontWeight: 700 }}
        >
          {open ? '▾' : '▸'} 🎯 굿즈 펀딩 집계 (입금 여부 무관 합산)
        </button>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>· {shown.length}개 상품</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555', cursor: 'pointer' }}>
            <input type="checkbox" checked={closedOnly} onChange={(e) => setClosedOnly(e.target.checked)} />
            종료된 펀딩만
          </label>
          <button type="button" onClick={exportSummaryCsv} style={btn} disabled={shown.length === 0}>⬇ CSV (펀딩 집계)</button>
          <button type="button" onClick={exportDetailCsv} style={btn} disabled={shownParts.length === 0}>⬇ CSV (참여 상세)</button>
          <button type="button" onClick={() => void load()} style={btn}>↻ 새로고침</button>
        </div>
      </div>

      {open && (
        <>
          {error && (
            <div style={{ marginTop: 12, padding: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 8, fontSize: 13 }}>⚠️ {error}</div>
          )}

          {loading ? (
            <p style={{ margin: '16px 0 0', fontSize: 13, color: '#888' }}>불러오는 중…</p>
          ) : shown.length === 0 ? (
            <p style={{ margin: '16px 0 0', fontSize: 13, color: '#888' }}>
              {closedOnly ? '종료된 펀딩 상품이 없습니다. (체크 해제 시 진행 중 펀딩도 표시)' : '펀딩 상품이 없습니다.'}
            </p>
          ) : (
            <>
              {/* 총합 */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
                <Chip label="합산 금액(전체)" value={`${won(totalValid)}원`} bg="#f3e8ff" color="#6b21a8" />
                <Chip label="미입금" value={`${won(totalUnpaid)}원`} bg="#fef3c7" color="#92400e" />
                <Chip label="입금 완료" value={`${won(totalPaid)}원`} bg="#dcfce7" color="#166534" />
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>상품</th>
                      <th style={th}>상태</th>
                      <th style={th}>마감일</th>
                      <th style={th}>목표</th>
                      <th style={th}>달성률</th>
                      <th style={th}>참여</th>
                      <th style={{ ...th, textAlign: 'right' }}>합산 금액</th>
                      <th style={{ ...th, textAlign: 'right' }}>미입금</th>
                      <th style={{ ...th, textAlign: 'right' }}>입금 완료</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((p) => (
                      <tr key={p.product_id}>
                        <td style={{ ...td, whiteSpace: 'normal', minWidth: 160 }}>{p.name}</td>
                        <td style={td}>
                          <span
                            style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                              background: p.closed ? '#f3f4f6' : '#ede9fe',
                              color: p.closed ? '#374151' : '#6d28d9',
                            }}
                          >
                            {p.closed ? (p.funding_status === 'succeeded' ? '성사' : p.funding_status === 'failed' ? '미달' : '종료') : '진행중'}
                          </span>
                        </td>
                        <td style={{ ...td, color: '#6b7280' }}>{fmtKst(p.funding_deadline) || '-'}</td>
                        <td style={{ ...td, color: '#6b7280' }}>
                          {p.goal_type === 'amount' ? `${won(p.goal_amount ?? 0)}원` : p.goal_type === 'quantity' ? `${won(p.goal_quantity ?? 0)}개` : '-'}
                        </td>
                        <td style={td}>{p.achievement === null ? '-' : `${p.achievement}%`}</td>
                        <td style={{ ...td, color: '#6b7280' }}>{p.valid.count}건 · {p.valid.quantity}개 · {p.backers}명</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{won(p.valid.amount)}원</td>
                        <td style={{ ...td, textAlign: 'right', color: '#92400e' }}>{won(p.unpaid.amount)}원</td>
                        <td style={{ ...td, textAlign: 'right', color: '#166534' }}>{won(p.paid.amount)}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p style={{ margin: '12px 0 0', fontSize: 11, color: '#9ca3af', lineHeight: 1.6 }}>
                · 합산 금액 = 펀딩참여중 + 입금대기 + 결제완료 (입금 여부 무관). 취소·만료·환불 참여는 제외되며, CSV에는 해당 금액이 별도 컬럼으로 포함됩니다.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Chip({ label, value, bg, color }: { label: string; value: string; bg: string; color: string }) {
  return (
    <div style={{ padding: '6px 12px', background: bg, color, borderRadius: 6, fontSize: 12 }}>
      <span style={{ opacity: 0.75 }}>{label}: </span>
      <strong>{value}</strong>
    </div>
  );
}
