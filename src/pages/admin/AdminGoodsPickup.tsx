// ============================================================================
// AdminGoodsPickup — 굿즈 수령 확인 전용 페이지                 // ← [신규 2026-08-10]
//
// 목적:
//   행사 데스크에서 구매자 이름으로 찾아 수령 체크만 빠르게 하는 화면.
//   (AdminOrders 는 입금확인·취소 등 기능이 많아 데스크 용도로 무거움)
//
// 설계 원칙 (SSOT):
//   - 수령 상태는 esg_orders.received_at 하나만 사용 (AdminOrders 와 동일 컬럼).
//     별도 테이블/컬럼을 만들지 않으므로 두 화면이 항상 같은 상태를 보여줌.
//   - 실측 근거: 굿즈 결제완료 주문 65건 전부 단일 품목 주문(2026-08-10 CSV 검증)
//     → 주문 단위 토글 = 품목 단위 토글. 스키마 변경 불필요.
//   - 조회/토글은 기존 adminOrders.ts 의 loadAllOrders / setOrderReceived 재사용.
//
// 데이터:
//   loadAllOrders({ statuses:['paid'], type:'goods' }) — 결제 완료 굿즈 주문 전량.
//   Realtime(subscribeAllOrders)로 다중 기기(데스크 폰 2대 등) 동기화.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  loadAllOrders,
  setOrderReceived,
  subscribeAllOrders,
} from '@/lib/adminOrders';
import type { OrderWithItems } from '@/lib/orders';
import { matchesQuery } from '@/utils/search';

// ----------------------------------------------------------------------------
// KST 짧은 포맷 (AdminOrders.tsx 로컬 유틸과 동일 규약)
// ----------------------------------------------------------------------------
function fmtKstShort(utcIso: string): string {
  const d = new Date(utcIso);
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// ----------------------------------------------------------------------------
// 구매자 그룹 구조
// ----------------------------------------------------------------------------
interface BuyerGroup {
  key: string;          // user_email(lower) 기준 — 이름 동명이인 안전
  name: string;
  dept: string | null;
  orders: OrderWithItems[];
}

function groupByBuyer(orders: OrderWithItems[]): BuyerGroup[] {
  const map = new Map<string, BuyerGroup>();
  for (const o of orders) {
    const key = (o.user_email || o.user_name_snapshot).toLowerCase();
    const g = map.get(key);
    if (g) {
      g.orders.push(o);
    } else {
      map.set(key, {
        key,
        name: o.user_name_snapshot,
        dept: o.user_dept_snapshot,
        orders: [o],
      });
    }
  }
  // 가나다순 (데스크에서 이름으로 찾는 흐름)
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

// 주문의 품목 요약 문자열 (검색 대상)
function itemsText(o: OrderWithItems): string {
  return o.items.map((it) => it.product_name_snapshot).join(' ');
}

// 주문 총 수량
function orderQty(o: OrderWithItems): number {
  return o.items.reduce((s, it) => s + it.quantity, 0);
}

// ============================================================================
// 페이지
// ============================================================================
export function AdminGoodsPickup() {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      setError(null);
      const rows = await loadAllOrders({
        statuses: ['paid'],
        type: 'goods',
        sortOrder: 'oldest',
      });
      setOrders(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : '주문을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Realtime: 다른 기기의 수령 처리 즉시 반영
    const unsub = subscribeAllOrders(load);
    return unsub;
  }, []);

  // ── 토글 (성공 시 로컬 상태 즉시 갱신 — 전체 리로드 없이 스크롤 유지) ────
  const toggle = async (order: OrderWithItems) => {
    const next = !order.received_at;
    // 실수 방지: '수령완료 → 미수령' 되돌리기만 확인
    if (!next && !window.confirm(`${order.user_name_snapshot} 님의 수령완료를 취소할까요?`)) {
      return;
    }
    setBusyIds((prev) => new Set(prev).add(order.id));
    try {
      await setOrderReceived(order.id, next);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, received_at: next ? new Date().toISOString() : null }
            : o
        )
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : '수령 처리에 실패했습니다.');
    } finally {
      setBusyIds((prev) => {
        const s = new Set(prev);
        s.delete(order.id);
        return s;
      });
    }
  };

  // ── 구매자 단위 '모두 수령' ────────────────────────────────────────────────
  const receiveAll = async (g: BuyerGroup) => {
    const targets = g.orders.filter((o) => !o.received_at);
    if (targets.length === 0) return;
    setBusyIds((prev) => {
      const s = new Set(prev);
      targets.forEach((o) => s.add(o.id));
      return s;
    });
    try {
      for (const o of targets) {
        await setOrderReceived(o.id, true); // 순차 처리 (부분 실패 시 남은 건 표시 유지)
        setOrders((prev) =>
          prev.map((x) => (x.id === o.id ? { ...x, received_at: new Date().toISOString() } : x))
        );
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '일괄 수령 처리 중 오류가 발생했습니다.');
    } finally {
      setBusyIds((prev) => {
        const s = new Set(prev);
        targets.forEach((o) => s.delete(o.id));
        return s;
      });
    }
  };

  // ── 집계/필터 ─────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalOrders = orders.length;
    const receivedOrders = orders.filter((o) => o.received_at).length;
    const totalQty = orders.reduce((s, o) => s + orderQty(o), 0);
    const receivedQty = orders
      .filter((o) => o.received_at)
      .reduce((s, o) => s + orderQty(o), 0);
    return { totalOrders, receivedOrders, totalQty, receivedQty };
  }, [orders]);

  const groups = useMemo(() => {
    let gs = groupByBuyer(orders);
    if (search.trim()) {
      gs = gs.filter((g) =>
        g.orders.some((o) =>
          matchesQuery(search, g.name, g.dept, o.order_number, itemsText(o))
        )
      );
    }
    if (onlyPending) {
      gs = gs.filter((g) => g.orders.some((o) => !o.received_at));
    }
    return gs;
  }, [orders, search, onlyPending]);

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  if (loading) return <p style={{ color: '#666' }}>불러오는 중…</p>;
  if (error) {
    return (
      <div>
        <p style={{ color: '#dc2626' }}>{error}</p>
        <button type="button" onClick={() => { setLoading(true); load(); }}>다시 시도</button>
      </div>
    );
  }

  const pct =
    summary.totalOrders === 0
      ? 0
      : Math.round((summary.receivedOrders / summary.totalOrders) * 100);

  return (
    <div>
      <h2 style={{ color: '#111', marginTop: 0 }}>✅ 굿즈 수령 확인</h2>
      <p style={{ color: '#666', marginTop: 4, fontSize: 13 }}>
        결제 완료된 굿즈 주문만 표시됩니다. 체크 상태는 주문/입금확인 탭의
        수령완료와 동일하게 저장됩니다.
      </p>

      {/* ── 진행 요약 ── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 16,
          padding: '12px 16px',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <strong style={{ fontSize: 20, color: '#166534' }}>
          {summary.receivedOrders} / {summary.totalOrders} 건 수령
        </strong>
        <span style={{ color: '#166534', fontSize: 13 }}>
          수량 {summary.receivedQty} / {summary.totalQty} 개
        </span>
        <div
          style={{
            flex: '1 1 160px',
            height: 8,
            background: '#dcfce7',
            borderRadius: 999,
            overflow: 'hidden',
            minWidth: 120,
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: '#16a34a',
              transition: 'width .3s',
            }}
          />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>{pct}%</span>
      </div>

      {/* ── 검색/필터 ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 · 부서 · 품목 · 주문번호 검색"
          style={{
            flex: '1 1 240px',
            padding: '10px 12px',
            fontSize: 15,
            border: '1px solid #ddd',
            borderRadius: 8,
          }}
        />
        <button
          type="button"
          onClick={() => setOnlyPending((v) => !v)}
          style={{
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 8,
            border: '1px solid',
            borderColor: onlyPending ? '#16a34a' : '#ddd',
            background: onlyPending ? '#dcfce7' : '#fff',
            color: onlyPending ? '#166534' : '#555',
            cursor: 'pointer',
          }}
        >
          미수령만 {onlyPending ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* ── 구매자 카드 ── */}
      {groups.length === 0 && (
        <p style={{ color: '#888' }}>
          {orders.length === 0 ? '결제 완료된 굿즈 주문이 없습니다.' : '검색 결과가 없습니다.'}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groups.map((g) => {
          const pendingCount = g.orders.filter((o) => !o.received_at).length;
          const done = pendingCount === 0;
          return (
            <div
              key={g.key}
              style={{
                border: '1px solid',
                borderColor: done ? '#bbf7d0' : '#e5e7eb',
                background: done ? '#f0fdf4' : '#fff',
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 17, color: '#111' }}>{g.name}</strong>
                  {g.dept && <span style={{ fontSize: 12, color: '#888' }}>{g.dept}</span>}
                  <span style={{ fontSize: 12, color: done ? '#166534' : '#b45309', fontWeight: 700 }}>
                    {done ? '전부 수령 완료' : `미수령 ${pendingCount}건`}
                  </span>
                </div>
                {g.orders.length > 1 && !done && (
                  <button
                    type="button"
                    onClick={() => receiveAll(g)}
                    disabled={g.orders.some((o) => busyIds.has(o.id))}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      borderRadius: 999,
                      border: '1px solid #16a34a',
                      background: '#16a34a',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    모두 수령
                  </button>
                )}
              </div>

              {/* 품목 행 (주문 1건 = 품목 1행, 2026-08-10 실측) */}
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {g.orders.map((o) => {
                  const received = !!o.received_at;
                  const busy = busyIds.has(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggle(o)}
                      disabled={busy}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid',
                        borderColor: received ? '#16a34a' : '#e5e7eb',
                        background: received ? '#dcfce7' : '#fafafa',
                        cursor: busy ? 'wait' : 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 18, lineHeight: 1 }}>
                        {received ? '✅' : '⬜️'}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {o.items.map((it) => (
                          <span
                            key={it.id}
                            style={{
                              display: 'block',
                              fontSize: 14,
                              fontWeight: 600,
                              color: received ? '#166534' : '#111',
                              textDecoration: received ? 'line-through' : 'none',
                            }}
                          >
                            {it.product_name_snapshot}
                            <b style={{ marginLeft: 6 }}>×{it.quantity}</b>
                          </span>
                        ))}
                        <span style={{ display: 'block', fontSize: 11, color: '#999', marginTop: 2 }}>
                          {o.order_number}
                          {received && o.received_at && ` · 수령 ${fmtKstShort(o.received_at)}`}
                          {busy && ' · 처리 중…'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
