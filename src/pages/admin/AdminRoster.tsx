// ============================================================================
// AdminRoster — 명단 관리 (버그 #5)
//
// 3개 명단을 한곳에서 조회 + CSV 내보내기:
//   - 물품 기부자 (esg_bazaar_intake)
//   - 금액 기부자 (esg_donations, paid)
//   - 구매자     (esg_orders, paid)
//
// 상세 편집은 각 전용 탭(물품 접수 / 기부 관리 / 주문·입금확인)에서. 여기선 통합 열람/내보내기.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  loadItemDonors,
  loadMoneyDonors,
  loadBuyers,
  type ItemDonorRow,
  type MoneyDonorRow,
  type BuyerRow,
} from '@/lib/adminRoster';
import { downloadCsv, todayStampKst } from '@/utils/csv';

type Tab = 'items' | 'money' | 'buyers';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'items', label: '물품 기부자', icon: '📦' },
  { key: 'money', label: '금액 기부자', icon: '💚' },
  { key: 'buyers', label: '구매자', icon: '🛍' },
];

const INTAKE_STATUS_LABELS: Record<string, string> = {
  pending: '검수 대기',
  passed: '검수 통과',
  rejected: '반려',
  published: '게시 중',
  unpublished: '게시 중단',
};

export function AdminRoster() {
  const [tab, setTab] = useState<Tab>('items');
  const [items, setItems] = useState<ItemDonorRow[]>([]);
  const [money, setMoney] = useState<MoneyDonorRow[]>([]);
  const [buyers, setBuyers] = useState<BuyerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setError(null);
      setLoading(true);
      const [i, m, b] = await Promise.all([loadItemDonors(), loadMoneyDonors(), loadBuyers()]);
      setItems(i);
      setMoney(m);
      setBuyers(b);
    } catch (e) {
      console.error('[AdminRoster]', e);
      setError(e instanceof Error ? e.message : '명단을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: '0 0 4px' }}>📋 명단 관리</h2>
        <button type="button" onClick={() => void reload()} disabled={loading} style={refreshBtn(loading)}>
          {loading ? '🔄 갱신 중…' : '🔄 새로고침'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        물품 기부자 · 금액 기부자 · 구매자 명단을 통합 열람하고 CSV로 내보냅니다. 상세 편집은 각 전용 탭에서 진행하세요.
      </p>

      {/* 서브 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const count = t.key === 'items' ? items.length : t.key === 'money' ? money.length : buyers.length;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid',
                borderColor: active ? '#111' : '#ddd',
                background: active ? '#111' : '#fff',
                color: active ? '#fff' : '#444',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t.icon} {t.label}
              {!loading && <span style={{ opacity: 0.7, marginLeft: 6 }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>⚠️ {error}</div>
      )}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
      ) : tab === 'items' ? (
        <ItemDonorsTable rows={items} />
      ) : tab === 'money' ? (
        <MoneyDonorsTable rows={money} />
      ) : (
        <BuyersTable rows={buyers} />
      )}
    </div>
  );
}

// ============================================================================
// 1) 물품 기부자
// ============================================================================
function ItemDonorsTable({ rows }: { rows: ItemDonorRow[] }) {
  const totalQty = useMemo(() => rows.reduce((s, r) => s + r.quantity, 0), [rows]);
  const totalValue = useMemo(() => rows.reduce((s, r) => s + r.listed_price * r.quantity, 0), [rows]);

  const handleExport = () => {
    downloadCsv(
      `물품기부자명단_${todayStampKst()}.csv`,
      ['기부자', '부서', '물품명', '카테고리', '책정가', '수량', '상태', '비고', '접수일시'],
      rows.map((r) => [
        r.donor_name,
        r.donor_dept ?? '',
        r.item_name,
        r.category_label,
        r.listed_price,
        r.quantity,
        INTAKE_STATUS_LABELS[r.publish_status] ?? r.publish_status,
        r.note ?? '',
        fmtKst(r.created_at),
      ])
    );
  };

  return (
    <RosterShell
      summary={[
        ['물품 수', `${rows.length}건`],
        ['총 수량', `${totalQty}개`],
        ['책정가 합계', `${totalValue.toLocaleString()}원`],
      ]}
      onExport={handleExport}
      empty={rows.length === 0}
    >
      <Table head={['기부자', '부서', '물품명', '카테고리', '책정가', '수량', '상태', '접수일']}>
        {rows.map((r) => (
          <tr key={r.id} style={trStyle}>
            <Td strong>{r.donor_name}</Td>
            <Td muted>{r.donor_dept ?? '-'}</Td>
            <Td>{r.item_name}</Td>
            <Td muted>{r.category_label}</Td>
            <Td right>{r.listed_price.toLocaleString()}원</Td>
            <Td right>{r.quantity}</Td>
            <Td muted>{INTAKE_STATUS_LABELS[r.publish_status] ?? r.publish_status}</Td>
            <Td muted>{fmtKst(r.created_at)}</Td>
          </tr>
        ))}
      </Table>
    </RosterShell>
  );
}

// ============================================================================
// 2) 금액 기부자
// ============================================================================
function MoneyDonorsTable({ rows }: { rows: MoneyDonorRow[] }) {
  const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);

  const handleExport = () => {
    downloadCsv(
      `금액기부자명단_${todayStampKst()}.csv`,
      ['기부번호', '기부자', '부서', '이메일', '금액', '입금자명', '익명표시', '완료일시', '메시지'],
      rows.map((r) => [
        r.donation_number,
        r.donor_name,
        r.donor_dept ?? '',
        r.user_email,
        r.amount,
        r.payer_name ?? '',
        r.is_anonymous ? 'Y' : 'N',
        fmtKst(r.paid_at),
        r.message ?? '',
      ])
    );
  };

  return (
    <RosterShell
      summary={[
        ['기부자 수', `${rows.length}명`],
        ['기부 합계', `${total.toLocaleString()}원`],
      ]}
      onExport={handleExport}
      empty={rows.length === 0}
    >
      <Table head={['기부번호', '기부자', '부서', '이메일', '금액', '입금자명', '익명', '완료일']}>
        {rows.map((r) => (
          <tr key={r.id} style={trStyle}>
            <Td mono muted>{r.donation_number}</Td>
            <Td strong>{r.donor_name}</Td>
            <Td muted>{r.donor_dept ?? '-'}</Td>
            <Td muted>{r.user_email}</Td>
            <Td right strong>{r.amount.toLocaleString()}원</Td>
            <Td>{r.payer_name ?? '-'}</Td>
            <Td muted>{r.is_anonymous ? '🕶' : '-'}</Td>
            <Td muted>{fmtKst(r.paid_at)}</Td>
          </tr>
        ))}
      </Table>
    </RosterShell>
  );
}

// ============================================================================
// 3) 구매자
// ============================================================================
function BuyersTable({ rows }: { rows: BuyerRow[] }) {
  const total = useMemo(() => rows.reduce((s, r) => s + r.total_amount, 0), [rows]);
  const typeLabel = (t: string) => (t === 'bazaar' ? '🛍 바자회' : t === 'auction' ? '🔨 경매' : t);

  const handleExport = () => {
    downloadCsv(
      `구매자명단_${todayStampKst()}.csv`,
      ['주문번호', '유형', '구매자', '부서', '이메일', '금액', '입금자명', '완료일시'],
      rows.map((r) => [
        r.order_number,
        r.order_type === 'bazaar' ? '바자회' : r.order_type === 'auction' ? '경매' : r.order_type,
        r.buyer_name,
        r.buyer_dept ?? '',
        r.user_email,
        r.total_amount,
        r.payer_name ?? '',
        fmtKst(r.paid_at),
      ])
    );
  };

  return (
    <RosterShell
      summary={[
        ['구매 건수', `${rows.length}건`],
        ['결제 합계', `${total.toLocaleString()}원`],
      ]}
      onExport={handleExport}
      empty={rows.length === 0}
    >
      <Table head={['주문번호', '유형', '구매자', '부서', '이메일', '금액', '입금자명', '완료일']}>
        {rows.map((r) => (
          <tr key={r.id} style={trStyle}>
            <Td mono muted>{r.order_number}</Td>
            <Td muted>{typeLabel(r.order_type)}</Td>
            <Td strong>{r.buyer_name}</Td>
            <Td muted>{r.buyer_dept ?? '-'}</Td>
            <Td muted>{r.user_email}</Td>
            <Td right strong>{r.total_amount.toLocaleString()}원</Td>
            <Td>{r.payer_name ?? '-'}</Td>
            <Td muted>{fmtKst(r.paid_at)}</Td>
          </tr>
        ))}
      </Table>
    </RosterShell>
  );
}

// ============================================================================
// 공용 UI
// ============================================================================
function RosterShell({
  summary,
  onExport,
  empty,
  children,
}: {
  summary: [string, string][];
  onExport: () => void;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {summary.map(([k, v]) => (
          <div key={k} style={{ padding: '6px 12px', background: '#f5f5f5', borderRadius: 6, fontSize: 12 }}>
            <span style={{ opacity: 0.7 }}>{k}: </span>
            <strong>{v}</strong>
          </div>
        ))}
        <button
          type="button"
          onClick={onExport}
          disabled={empty}
          style={{
            marginLeft: 'auto',
            padding: '8px 14px',
            background: empty ? '#f0f0f0' : '#111',
            color: empty ? '#aaa' : '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: empty ? 'not-allowed' : 'pointer',
          }}
        >
          ⬇ CSV 내보내기
        </button>
      </div>

      {empty ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: 48, textAlign: 'center', border: '1px dashed #ddd', color: '#888' }}>
          명단이 비어 있습니다.
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, padding: 8, overflowX: 'auto', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
      <thead>
        <tr>
          {head.map((h) => (
            <th
              key={h}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderBottom: '2px solid #eee',
                color: '#666',
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Td({
  children,
  strong,
  muted,
  right,
  mono,
}: {
  children: React.ReactNode;
  strong?: boolean;
  muted?: boolean;
  right?: boolean;
  mono?: boolean;
}) {
  return (
    <td
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid #f3f3f3',
        color: muted ? '#888' : '#222',
        fontWeight: strong ? 700 : 400,
        textAlign: right ? 'right' : 'left',
        fontFamily: mono ? 'monospace' : 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}

const trStyle: React.CSSProperties = {};

const refreshBtn = (loading: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  background: loading ? '#ccc' : '#fff',
  border: '1px solid #ddd',
  borderRadius: 6,
  cursor: loading ? 'not-allowed' : 'pointer',
  fontSize: 12,
});

function fmtKst(utcIso: string | null): string {
  if (!utcIso) return '-';
  const d = new Date(utcIso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(
    kst.getUTCDate()
  ).padStart(2, '0')} ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}
