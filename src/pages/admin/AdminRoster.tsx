// ============================================================================
// AdminRoster — 명단 관리 (버그 #5 / 명단 세분화)
//
// 3개 명단을 사람 단위로 집계(중복 제거 + 누적)하여 조회 + CSV 내보내기:
//   - 물품 기부자 : 이름 1회, 물품 종류/수량/책정가합 합산 (펼치면 물품 상세)
//   - 금액 기부자 : 이름 1회, 누적 기부액·건수, 익명/실명 표시, 메인 노출 기본값
//   - 구매자      : 이름 1회, 누적 구매액·건수 (펼치면 주문 상세)
//
// 보기 전환: [개인별 집계] ↔ [전체 내역(원본 행)]. CSV는 현재 보기 기준으로 내보냄.
// 상세 편집은 각 전용 탭(물품 접수 / 기부 관리 / 주문·입금확인)에서.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  loadItemDonors,
  loadMoneyDonors,
  loadBuyers,
  aggregateItemDonors,
  aggregateMoneyDonors,
  aggregateBuyers,
  loadVisibilityOverrides,
  setMainVisibility,
  clearMainVisibility,
  type ItemDonorRow,
  type MoneyDonorRow,
  type BuyerRow,
  type RosterSubjectType,
  type VisibilityOverrides,
} from '@/lib/adminRoster';
import { downloadCsv, todayStampKst } from '@/utils/csv';

type Tab = 'items' | 'money' | 'buyers';
type ViewMode = 'agg' | 'raw';

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

const typeLabel = (t: string) => (t === 'bazaar' ? '🛍 바자회' : t === 'auction' ? '🔨 경매' : t);

export function AdminRoster() {
  const [tab, setTab] = useState<Tab>('items');
  const [view, setView] = useState<ViewMode>('agg');
  const [items, setItems] = useState<ItemDonorRow[]>([]);
  const [money, setMoney] = useState<MoneyDonorRow[]>([]);
  const [buyers, setBuyers] = useState<BuyerRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<VisibilityOverrides>({ item: new Map(), money: new Map() });
  const [busyVis, setBusyVis] = useState<string | null>(null); // 처리 중인 subject_key
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setError(null);
      setLoading(true);
      const [i, m, b, ov] = await Promise.all([
        loadItemDonors(),
        loadMoneyDonors(),
        loadBuyers(),
        loadVisibilityOverrides(),
      ]);
      setItems(i);
      setMoney(m);
      setBuyers(b);
      setOverrides(ov);
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

  // 집계 (사람 단위)
  const itemAgg = useMemo(() => aggregateItemDonors(items), [items]);
  const moneyAgg = useMemo(() => aggregateMoneyDonors(money), [money]);
  const buyerAgg = useMemo(() => aggregateBuyers(buyers), [buyers]);

  // 탭 전환 시 펼침 초기화
  const switchTab = (t: Tab) => {
    setTab(t);
    setExpanded(new Set());
  };
  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // 메인 노출 override 설정(강제 노출/숨김). 낙관적 갱신 후 실패 시 reload로 복원.
  const handleSetVis = async (type: RosterSubjectType, key: string, show: boolean) => {
    setBusyVis(key);
    setOverrides((prev) => {
      const map = new Map(prev[type]);
      map.set(key, show);
      return { ...prev, [type]: map };
    });
    try {
      await setMainVisibility(type, key, show);
    } catch (e) {
      alert(e instanceof Error ? e.message : '노출 설정 실패');
      void reload();
    } finally {
      setBusyVis(null);
    }
  };

  // override 해제(기본값으로 복귀)
  const handleClearVis = async (type: RosterSubjectType, key: string) => {
    setBusyVis(key);
    setOverrides((prev) => {
      const map = new Map(prev[type]);
      map.delete(key);
      return { ...prev, [type]: map };
    });
    try {
      await clearMainVisibility(type, key);
    } catch (e) {
      alert(e instanceof Error ? e.message : '노출 해제 실패');
      void reload();
    } finally {
      setBusyVis(null);
    }
  };

  // 헤더 카운트 (집계=사람 수 / 전체=행 수)
  const headerCount = (t: Tab) => {
    if (view === 'agg') return t === 'items' ? itemAgg.length : t === 'money' ? moneyAgg.length : buyerAgg.length;
    return t === 'items' ? items.length : t === 'money' ? money.length : buyers.length;
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: '0 0 4px' }}>📋 명단 관리</h2>
        <button type="button" onClick={() => void reload()} disabled={loading} style={refreshBtn(loading)}>
          {loading ? '🔄 갱신 중…' : '🔄 새로고침'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        물품 기부자 · 금액 기부자 · 구매자 명단을 <strong>사람 단위로 집계</strong>(중복 제거 + 누적)하여 열람하고 CSV로 내보냅니다.
      </p>

      {/* 서브 탭 + 보기 전환 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button key={t.key} type="button" onClick={() => switchTab(t.key)} style={tabBtn(active)}>
                {t.icon} {t.label}
                {!loading && <span style={{ opacity: 0.7, marginLeft: 6 }}>{headerCount(t.key)}</span>}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', background: '#f0f0f0', borderRadius: 8, padding: 3 }}>
          {(['agg', 'raw'] as ViewMode[]).map((v) => (
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
              {v === 'agg' ? '개인별 집계' : '전체 내역'}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>⚠️ {error}</div>}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
      ) : tab === 'items' ? (
        view === 'agg' ? (
          <ItemDonorsAgg
            rows={itemAgg}
            expanded={expanded}
            onToggle={toggleExpand}
            overrides={overrides.item}
            busyVis={busyVis}
            onSetVis={(k, s) => handleSetVis('item', k, s)}
            onClearVis={(k) => handleClearVis('item', k)}
          />
        ) : (
          <ItemDonorsRaw rows={items} />
        )
      ) : tab === 'money' ? (
        view === 'agg' ? (
          <MoneyDonorsAgg
            rows={moneyAgg}
            expanded={expanded}
            onToggle={toggleExpand}
            overrides={overrides.money}
            busyVis={busyVis}
            onSetVis={(k, s) => handleSetVis('money', k, s)}
            onClearVis={(k) => handleClearVis('money', k)}
          />
        ) : (
          <MoneyDonorsRaw rows={money} />
        )
      ) : view === 'agg' ? (
        <BuyersAgg rows={buyerAgg} expanded={expanded} onToggle={toggleExpand} />
      ) : (
        <BuyersRaw rows={buyers} />
      )}
    </div>
  );
}

// ============================================================================
// 물품 기부자 — 집계
// ============================================================================
function ItemDonorsAgg({
  rows,
  expanded,
  onToggle,
  overrides,
  busyVis,
  onSetVis,
  onClearVis,
}: {
  rows: ReturnType<typeof aggregateItemDonors>;
  expanded: Set<string>;
  onToggle: (k: string) => void;
  overrides: Map<string, boolean>;
  busyVis: string | null;
  onSetVis: (key: string, show: boolean) => void;
  onClearVis: (key: string) => void;
}) {
  const people = rows.length;
  const totalQty = rows.reduce((s, r) => s + r.total_qty, 0);
  const totalValue = rows.reduce((s, r) => s + r.total_value, 0);
  // 물품 기부자 기본 노출 = true. override 있으면 우선.
  const effShow = (key: string) => overrides.get(key) ?? true;
  const shownCount = rows.filter((r) => effShow(r.key)).length;

  const handleExport = () =>
    downloadCsv(
      `물품기부자_집계_${todayStampKst()}.csv`,
      ['기부자', '부서', '구분', '물품종류수', '총수량', '책정가합', '메인노출'],
      rows.map((r) => [
        r.donor_name,
        r.donor_dept ?? '',
        r.is_internal ? '임직원' : '외부',
        r.item_kinds,
        r.total_qty,
        r.total_value,
        effShow(r.key) ? '노출' : '숨김',
      ])
    );

  return (
    <RosterShell
      summary={[
        ['기부자', `${people}명`],
        ['총 수량', `${totalQty}개`],
        ['책정가 합계', `${totalValue.toLocaleString()}원`],
        ['메인 노출', `${shownCount}/${people}명`],
      ]}
      onExport={handleExport}
      empty={rows.length === 0}
    >
      <Table head={['', '기부자', '부서', '구분', '물품종류', '총수량', '책정가합', '메인 노출']}>
        {rows.map((r) => {
          const open = expanded.has(r.key);
          return (
            <FragmentRows key={r.key}>
              <tr style={rowHover} onClick={() => onToggle(r.key)}>
                <Td><Caret open={open} /></Td>
                <Td strong>{r.donor_name}</Td>
                <Td muted>{r.donor_dept ?? '-'}</Td>
                <Td muted>{r.is_internal ? '임직원' : '외부'}</Td>
                <Td right>{r.item_kinds}종</Td>
                <Td right>{r.total_qty}개</Td>
                <Td right strong>{r.total_value.toLocaleString()}원</Td>
                <Td>
                  <VisibilityToggle
                    subjectKey={r.key}
                    defaultShow={true}
                    override={overrides.has(r.key) ? overrides.get(r.key)! : null}
                    busy={busyVis === r.key}
                    onSet={onSetVis}
                    onClear={onClearVis}
                  />
                </Td>
              </tr>
              {open && (
                <tr>
                  <td colSpan={8} style={detailCell}>
                    {r.items.map((it, i) => (
                      <div key={i} style={detailLine}>
                        <span style={{ flex: 1 }}>{it.name}</span>
                        <span style={{ color: '#888', width: 90 }}>{it.category_label}</span>
                        <span style={{ color: '#888', width: 60, textAlign: 'right' }}>{it.qty}개</span>
                        <span style={{ color: '#888', width: 80, textAlign: 'right' }}>
                          {INTAKE_STATUS_LABELS[it.status] ?? it.status}
                        </span>
                      </div>
                    ))}
                  </td>
                </tr>
              )}
            </FragmentRows>
          );
        })}
      </Table>
    </RosterShell>
  );
}

// ============================================================================
// 금액 기부자 — 집계
// ============================================================================
function MoneyDonorsAgg({
  rows,
  expanded,
  onToggle,
  overrides,
  busyVis,
  onSetVis,
  onClearVis,
}: {
  rows: ReturnType<typeof aggregateMoneyDonors>;
  expanded: Set<string>;
  onToggle: (k: string) => void;
  overrides: Map<string, boolean>;
  busyVis: string | null;
  onSetVis: (key: string, show: boolean) => void;
  onClearVis: (key: string) => void;
}) {
  const people = rows.length;
  const total = rows.reduce((s, r) => s + r.total_amount, 0);
  // 금액 기부자 기본 노출 = 실명 건 존재(default_show_on_main). override 있으면 우선.
  const effShow = (r: (typeof rows)[number]) => overrides.get(r.key) ?? r.default_show_on_main;
  const shownCount = rows.filter(effShow).length;

  const handleExport = () =>
    downloadCsv(
      `금액기부자_집계_${todayStampKst()}.csv`,
      ['기부자', '부서', '이메일', '누적기부액', '기부건수', '익명건수', '실명건수', '메인노출'],
      rows.map((r) => [
        r.donor_name,
        r.donor_dept ?? '',
        r.user_email,
        r.total_amount,
        r.donation_count,
        r.anonymous_count,
        r.named_count,
        effShow(r) ? '노출' : '숨김',
      ])
    );

  return (
    <RosterShell
      summary={[
        ['기부자', `${people}명`],
        ['누적 기부액', `${total.toLocaleString()}원`],
        ['메인 노출', `${shownCount}/${people}명`],
      ]}
      onExport={handleExport}
      empty={rows.length === 0}
    >
      <Table head={['', '기부자', '부서', '이메일', '누적 기부액', '건수', '익명', '메인 노출']}>
        {rows.map((r) => {
          const open = expanded.has(r.key);
          return (
            <FragmentRows key={r.key}>
              <tr style={rowHover} onClick={() => onToggle(r.key)}>
                <Td><Caret open={open} /></Td>
                <Td strong>{r.donor_name}</Td>
                <Td muted>{r.donor_dept ?? '-'}</Td>
                <Td muted>{r.user_email}</Td>
                <Td right strong>{r.total_amount.toLocaleString()}원</Td>
                <Td right>{r.donation_count}건</Td>
                <Td muted>{r.anonymous_count > 0 ? `🕶 ${r.anonymous_count}` : '-'}</Td>
                <Td>
                  <VisibilityToggle
                    subjectKey={r.key}
                    defaultShow={r.default_show_on_main}
                    override={overrides.has(r.key) ? overrides.get(r.key)! : null}
                    busy={busyVis === r.key}
                    onSet={onSetVis}
                    onClear={onClearVis}
                  />
                </Td>
              </tr>
              {open && (
                <tr>
                  <td colSpan={8} style={detailCell}>
                    {r.donations.map((d, i) => (
                      <div key={i} style={detailLine}>
                        <span style={{ flex: 1, fontFamily: 'monospace', color: '#888' }}>{d.number}</span>
                        <span style={{ width: 110, textAlign: 'right' }}>{d.amount.toLocaleString()}원</span>
                        <span style={{ width: 60, textAlign: 'right', color: '#888' }}>{d.anonymous ? '🕶 익명' : '실명'}</span>
                        <span style={{ width: 130, textAlign: 'right', color: '#888' }}>{fmtKst(d.paid_at)}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              )}
            </FragmentRows>
          );
        })}
      </Table>
    </RosterShell>
  );
}

// ============================================================================
// 구매자 — 집계
// ============================================================================
function BuyersAgg({
  rows,
  expanded,
  onToggle,
}: {
  rows: ReturnType<typeof aggregateBuyers>;
  expanded: Set<string>;
  onToggle: (k: string) => void;
}) {
  const people = rows.length;
  const total = rows.reduce((s, r) => s + r.total_amount, 0);

  const handleExport = () =>
    downloadCsv(
      `구매자_집계_${todayStampKst()}.csv`,
      ['구매자', '부서', '이메일', '누적구매액', '구매건수'],
      rows.map((r) => [r.buyer_name, r.buyer_dept ?? '', r.user_email, r.total_amount, r.order_count])
    );

  return (
    <RosterShell
      summary={[
        ['구매자', `${people}명`],
        ['누적 구매액', `${total.toLocaleString()}원`],
      ]}
      onExport={handleExport}
      empty={rows.length === 0}
    >
      <Table head={['', '구매자', '부서', '이메일', '누적 구매액', '건수']}>
        {rows.map((r) => {
          const open = expanded.has(r.key);
          return (
            <FragmentRows key={r.key}>
              <tr style={rowHover} onClick={() => onToggle(r.key)}>
                <Td><Caret open={open} /></Td>
                <Td strong>{r.buyer_name}</Td>
                <Td muted>{r.buyer_dept ?? '-'}</Td>
                <Td muted>{r.user_email}</Td>
                <Td right strong>{r.total_amount.toLocaleString()}원</Td>
                <Td right>{r.order_count}건</Td>
              </tr>
              {open && (
                <tr>
                  <td colSpan={6} style={detailCell}>
                    {r.orders.map((o, i) => (
                      <div key={i} style={detailLine}>
                        <span style={{ flex: 1, fontFamily: 'monospace', color: '#888' }}>{o.number}</span>
                        <span style={{ width: 90, color: '#888' }}>{typeLabel(o.type)}</span>
                        <span style={{ width: 110, textAlign: 'right' }}>{o.amount.toLocaleString()}원</span>
                        <span style={{ width: 130, textAlign: 'right', color: '#888' }}>{fmtKst(o.paid_at)}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              )}
            </FragmentRows>
          );
        })}
      </Table>
    </RosterShell>
  );
}

// ============================================================================
// 전체 내역(원본 행) — 회계/대조용
// ============================================================================
function ItemDonorsRaw({ rows }: { rows: ItemDonorRow[] }) {
  const handleExport = () =>
    downloadCsv(
      `물품기부자_전체내역_${todayStampKst()}.csv`,
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
  return (
    <RosterShell summary={[['물품 수', `${rows.length}건`]]} onExport={handleExport} empty={rows.length === 0}>
      <Table head={['기부자', '부서', '물품명', '카테고리', '책정가', '수량', '상태', '접수일']}>
        {rows.map((r) => (
          <tr key={r.id}>
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

function MoneyDonorsRaw({ rows }: { rows: MoneyDonorRow[] }) {
  const handleExport = () =>
    downloadCsv(
      `금액기부자_전체내역_${todayStampKst()}.csv`,
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
  return (
    <RosterShell summary={[['기부 건수', `${rows.length}건`]]} onExport={handleExport} empty={rows.length === 0}>
      <Table head={['기부번호', '기부자', '부서', '이메일', '금액', '입금자명', '익명', '완료일']}>
        {rows.map((r) => (
          <tr key={r.id}>
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

function BuyersRaw({ rows }: { rows: BuyerRow[] }) {
  const handleExport = () =>
    downloadCsv(
      `구매자_전체내역_${todayStampKst()}.csv`,
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
  return (
    <RosterShell summary={[['구매 건수', `${rows.length}건`]]} onExport={handleExport} empty={rows.length === 0}>
      <Table head={['주문번호', '유형', '구매자', '부서', '이메일', '금액', '입금자명', '완료일']}>
        {rows.map((r) => (
          <tr key={r.id}>
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
        <button type="button" onClick={onExport} disabled={empty} style={exportBtn(empty)}>
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
          {head.map((h, i) => (
            <th
              key={i}
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

// React.Fragment 래퍼 (key 유지용)
function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// 메인 노출 토글: effective = override ?? defaultShow.
//   클릭 → 반대값으로 강제(override 설정). override 있으면 '기본' 버튼으로 해제 가능.
//   행 펼침과 충돌하지 않도록 클릭 전파 차단.
function VisibilityToggle({
  subjectKey,
  defaultShow,
  override,
  busy,
  onSet,
  onClear,
}: {
  subjectKey: string;
  defaultShow: boolean;
  override: boolean | null;
  busy: boolean;
  onSet: (key: string, show: boolean) => void;
  onClear: (key: string) => void;
}) {
  const effective = override ?? defaultShow;
  const overridden = override !== null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={stop}>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          stop(e);
          onSet(subjectKey, !effective);
        }}
        title={overridden ? '관리자 강제 설정됨' : '기본값'}
        style={{
          padding: '3px 10px',
          borderRadius: 999,
          border: '1px solid',
          borderColor: effective ? '#16a34a' : '#d4d4d4',
          background: effective ? '#dcfce7' : '#f3f4f6',
          color: effective ? '#166534' : '#6b7280',
          fontSize: 11,
          fontWeight: 700,
          cursor: busy ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {effective ? '노출' : '숨김'}
        {overridden && <span style={{ marginLeft: 4, opacity: 0.7 }}>•</span>}
      </button>
      {overridden && (
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            stop(e);
            onClear(subjectKey);
          }}
          title="기본값으로 복귀"
          style={{
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid #ddd',
            background: '#fff',
            color: '#888',
            fontSize: 10,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          기본
        </button>
      )}
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return <span style={{ color: '#bbb', fontSize: 11, userSelect: 'none' }}>{open ? '▼' : '▶'}</span>;
}

const detailCell: React.CSSProperties = {
  padding: '4px 12px 12px 40px',
  background: '#fafafa',
  borderBottom: '1px solid #f0f0f0',
};
const detailLine: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  padding: '4px 0',
  borderBottom: '1px dashed #eee',
};
const rowHover: React.CSSProperties = { cursor: 'pointer' };

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid',
  borderColor: active ? '#111' : '#ddd',
  background: active ? '#111' : '#fff',
  color: active ? '#fff' : '#444',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
});

const refreshBtn = (loading: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  background: loading ? '#ccc' : '#fff',
  border: '1px solid #ddd',
  borderRadius: 6,
  cursor: loading ? 'not-allowed' : 'pointer',
  fontSize: 12,
});

const exportBtn = (empty: boolean): React.CSSProperties => ({
  marginLeft: 'auto',
  padding: '8px 14px',
  background: empty ? '#f0f0f0' : '#111',
  color: empty ? '#aaa' : '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: empty ? 'not-allowed' : 'pointer',
});

function fmtKst(utcIso: string | null): string {
  if (!utcIso) return '-';
  const d = new Date(utcIso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(
    kst.getUTCDate()
  ).padStart(2, '0')} ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}
