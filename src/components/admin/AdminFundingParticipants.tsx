// ============================================================================
// AdminFundingParticipants — 관리자: 펀딩 참여자 목록 + 개별 참여 삭제(소프트 취소)
//   [2026-07-08] 신규. 펀딩 상품 관리 영역에서만 노출.
//   삭제는 진행 중 참여(pledged)만 가능(성사 후 pending/paid 는 주문 관리에서).
//   삭제 시 참여자에게 인앱+이메일 통지(RPC 내부에서 처리).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import {
  loadFundingParticipants, adminCancelFundingPledge, type FundingParticipant,
} from '@/lib/orders';

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  pledged: { label: '참여중', bg: '#ede9fe', color: '#6d28d9' },
  pending: { label: '입금대기', bg: '#fef3c7', color: '#92400e' },
  paid: { label: '결제완료', bg: '#dcfce7', color: '#166534' },
};

const won = (n: number) => n.toLocaleString('ko-KR');
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export function AdminFundingParticipants({ productId, onChanged }: { productId: string; onChanged?: () => void }) {
  const [rows, setRows] = useState<FundingParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    loadFundingParticipants(productId).then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, [productId]);
  useEffect(() => { load(); }, [load]);

  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);

  const remove = async (r: FundingParticipant) => {
    if (r.payment_status !== 'pledged') return;
    const reason = window.prompt(
      `"${r.user_name}"님의 펀딩 참여(${r.quantity}개 · ${won(r.total_amount)}원)를 취소합니다.\n달성률에서 제외되고, 참여자에게 인앱+이메일로 안내됩니다.\n\n취소 사유를 입력하세요:`,
      '',
    );
    if (reason === null) return; // 취소
    setBusyId(r.order_id);
    try {
      await adminCancelFundingPledge(r.order_id, reason);
      load();
      onChanged?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : '참여 취소 실패');
    } finally {
      setBusyId(null);
    }
  };

  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px', fontSize: 13, color: '#111', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' };

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15, color: '#111' }}>🎯 펀딩 참여자 관리</h3>
        <span style={{ fontSize: 13, color: '#6b7280' }}>총 {rows.length}건 · {totalQty}개</span>
      </div>

      {loading ? (
        <p style={{ margin: 0, fontSize: 13, color: '#888' }}>불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: '#888' }}>아직 참여자가 없습니다.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>참여자</th>
                <th style={th}>수량</th>
                <th style={th}>금액</th>
                <th style={th}>상태</th>
                <th style={th}>참여일</th>
                <th style={{ ...th, textAlign: 'right' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS[r.payment_status] ?? { label: r.payment_status, bg: '#f3f4f6', color: '#374151' };
                const canRemove = r.payment_status === 'pledged';
                return (
                  <tr key={r.order_id}>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{r.user_name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.user_email}</div>
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-num)' }}>{r.quantity}개</td>
                    <td style={{ ...td, fontFamily: 'var(--font-num)' }}>{won(r.total_amount)}원</td>
                    <td style={td}>
                      <span style={{ background: st.bg, color: st.color, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999 }}>{st.label}</span>
                    </td>
                    <td style={{ ...td, color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {canRemove ? (
                        <button
                          type="button"
                          onClick={() => remove(r)}
                          disabled={busyId === r.order_id}
                          style={{
                            padding: '6px 12px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626',
                            borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: busyId === r.order_id ? 'not-allowed' : 'pointer',
                            opacity: busyId === r.order_id ? 0.6 : 1, whiteSpace: 'nowrap',
                          }}
                        >
                          {busyId === r.order_id ? '취소 중…' : '참여 삭제'}
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>주문 관리에서 처리</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ margin: '12px 0 0', fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
        · 삭제 시 달성률에서 제외되고 참여자에게 인앱+이메일로 안내됩니다. 진행 중 참여(참여중)만 삭제할 수 있으며, 결제 단계(입금대기/결제완료)는 주문 관리에서 처리하세요.
      </p>
    </div>
  );
}
