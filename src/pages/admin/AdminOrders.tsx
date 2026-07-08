// ============================================================================
// AdminOrders — 주문/입금 확인 어드민 페이지
//
// 운영 흐름:
//   1. 어드민이 은행 앱에서 입금 내역 확인 ("홍길동 50,000원 입금")
//   2. 이 페이지에서 입금자명/금액으로 검색
//   3. 매칭되는 pending 주문 발견 → "✅ 입금 확인" 클릭
//   4. 모달에서 실제 입금자명 입력 → 확인 → status='paid' 전환
//   5. 바자회 주문이면 reserved_stock에서 stock으로 차감 (mark_order_paid RPC가 처리)
//
// 필터:
//   - 상태: 결제 대기 / 결제 완료 / 취소됨 / 만료됨 / 전체
//   - 타입: 바자회 / 경매 / 전체
//   - 검색: 주문번호 / 이름 / 이메일 / 입금자명 부분일치
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  loadAllOrders,
  markOrderPaid,
  cancelOrderAdmin,
  revertOrderPayment,
  cancelPaidOrder,
  updateAdminMemo,
  subscribeAllOrders,
  type LoadAllOrdersFilters,
} from '@/lib/adminOrders';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, getOrderTimeLeft, formatTimeLeft } from '@/lib/orders';
import type { OrderWithItems } from '@/lib/orders';
import type { EsgPaymentStatus, EsgOrderType } from '@/types/esg';

// ← [2026-07-01] 상태 필터 버튼 나열용 (드롭다운 대체)
const STATUS_TABS: { value: EsgPaymentStatus | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '결제 대기' },
  { value: 'paid', label: '결제 완료' },
  { value: 'cancelled', label: '취소됨' },
  { value: 'expired', label: '만료됨' },
  { value: 'refunded', label: '환불됨' },
];

// ── [2026-07-08] 굿즈(펀딩) 주문 묶음 뷰 ───────────────────────────────────
//   한 사용자가 같은 상품에 여러 번 주문한 경우(펀딩 다회 참여), 개별 주문은
//   그대로 두되 (사용자 × 상품) 단위로 묶어 합산 총액을 헤더에 표시한다.
//   대상: order_type='goods' 이고 단일 품목 주문 중 같은 (user,product) ≥2건.
//   그 외(바자회/경매/단건)는 손대지 않고 개별 카드로 렌더.
type AdminOrderView =
  | { kind: 'single'; order: OrderWithItems }
  | { kind: 'group'; key: string; userName: string; productName: string; total: number; orders: OrderWithItems[] };

function groupAdminOrders(orders: OrderWithItems[]): AdminOrderView[] {
  const groupKeyOf = (o: OrderWithItems): string | null => {
    if (o.order_type !== 'goods') return null;          // 굿즈(펀딩)만 대상
    if (!o.items || o.items.length !== 1) return null;   // 단일 품목만(펀딩 주문 = 1품목)
    return `${o.user_id}::${o.items[0].product_id}`;
  };

  // 1) 그룹 후보 수집(첫 등장 순서 보존)
  const buckets = new Map<string, OrderWithItems[]>();
  const order: string[] = []; // 첫 등장 순서(그룹키 or 'single:'+id)
  for (const o of orders) {
    const k = groupKeyOf(o);
    if (k) {
      if (!buckets.has(k)) { buckets.set(k, []); order.push(k); }
      buckets.get(k)!.push(o);
    } else {
      const sk = 'single:' + o.id;
      buckets.set(sk, [o]); order.push(sk);
    }
  }

  // 2) 뷰 변환: 그룹 후보라도 1건뿐이면 single 로 강등
  return order.map((k): AdminOrderView => {
    const arr = buckets.get(k)!;
    if (k.startsWith('single:') || arr.length < 2) return { kind: 'single', order: arr[0] };
    return {
      kind: 'group',
      key: k,
      userName: arr[0].user_name_snapshot ?? arr[0].user_email,
      productName: arr[0].items[0]?.product_name_snapshot ?? '상품',
      total: arr.reduce((s, o) => s + o.total_amount, 0),
      orders: arr,
    };
  });
}

export function AdminOrders() {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0); // 카운트다운 실시간 갱신용

  // 1초마다 강제 리렌더 (입금 기한 카운트다운)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // 필터
  const [statusFilter, setStatusFilter] = useState<EsgPaymentStatus | 'all'>('pending');
  const [typeFilter, setTypeFilter] = useState<EsgOrderType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // 디바운스
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // 입금 확인 모달
  const [confirmTarget, setConfirmTarget] = useState<OrderWithItems | null>(null);

  const filters = useMemo<LoadAllOrdersFilters>(
    () => ({
      statuses: statusFilter === 'all' ? undefined : [statusFilter],
      type: typeFilter === 'all' ? undefined : typeFilter,
      search: searchDebounced || undefined,
      sortOrder: 'newest',
    }),
    [statusFilter, typeFilter, searchDebounced]
  );

  const reload = async () => {
    try {
      setError(null);
      const data = await loadAllOrders(filters);
      setOrders(data);
    } catch (e) {
      console.error('[AdminOrders]', e);
      setError(e instanceof Error ? e.message : '주문을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter, searchDebounced]);

  useEffect(() => {
    const cleanup = subscribeAllOrders(() => {
      void reload();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // 통계 (현재 필터 결과 기준)
  const pendingCount = orders.filter((o) => o.payment_status === 'pending').length;
  const totalAmount = orders
    .filter((o) => o.payment_status === 'paid')
    .reduce((sum, o) => sum + o.total_amount, 0);

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>💳 주문 / 입금 확인</h2>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        은행 앱과 대조하여 입금을 확인하세요. 입금 확인 시 즉시 사용자에게 반영됩니다.
      </p>

      {/* 필터 영역 */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        }}
      >
        {/* ← [2026-07-01] 상태: 드롭다운 → 버튼 나열 */}
        <Field label="상태">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_TABS.map((t) => {
              const active = statusFilter === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setStatusFilter(t.value)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 8,
                    border: '1px solid',
                    borderColor: active ? '#111' : '#ddd',
                    background: active ? '#111' : '#fff',
                    color: active ? '#fff' : '#444',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
          <Field label="타입">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as EsgOrderType | 'all')}
              style={inputStyle}
            >
              <option value="all">전체</option>
              <option value="bazaar">🛍 바자회</option>
              <option value="auction">🔨 경매</option>
            </select>
          </Field>
          <Field label="검색 (주문번호/이름/이메일/입금자명/상품명)">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="예: 홍길동, 텀블러, BZ20260526..."
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      {/* 요약 */}
      {!loading && orders.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginBottom: 12,
            flexWrap: 'wrap',
            fontSize: 12,
          }}
        >
          <SummaryChip label="결과 수" value={`${orders.length}건`} />
          <SummaryChip
            label="결제 대기"
            value={`${pendingCount}건`}
            color={pendingCount > 0 ? '#92400e' : '#888'}
            bg={pendingCount > 0 ? '#fef3c7' : '#f5f5f5'}
          />
          {totalAmount > 0 && (
            <SummaryChip
              label="결제 완료 합계"
              value={`${totalAmount.toLocaleString()}원`}
              color="#166534"
              bg="#dcfce7"
            />
          )}
        </div>
      )}

      {/* 본문 */}
      {error && (
        <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 12 }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
      ) : orders.length === 0 ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 48,
            textAlign: 'center',
            border: '1px dashed #ddd',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>📭</div>
          <p style={{ margin: 0, color: '#888' }}>조건에 맞는 주문이 없습니다.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* ← [2026-07-08] 굿즈 펀딩 다회 참여는 (사용자×상품) 묶음으로 표시(합산 헤더 + 개별 카드) */}
          {groupAdminOrders(orders).map((v) =>
            v.kind === 'single' ? (
              <OrderAdminCard
                key={v.order.id}
                order={v.order}
                onConfirmPaid={() => setConfirmTarget(v.order)}
                onChange={reload}
              />
            ) : (
              <div
                key={v.key}
                style={{
                  border: '1.5px solid #d8b4fe', borderRadius: 12, background: '#faf5ff',
                  padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '2px 4px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#6b21a8', background: '#f3e8ff', borderRadius: 6, padding: '2px 8px' }}>
                    🤝 펀딩 묶음
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{v.userName}</span>
                  <span style={{ fontSize: 12, color: '#888' }}>· {v.productName}</span>
                  <span style={{ fontSize: 12, color: '#888' }}>· {v.orders.length}건</span>
                  <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 700, color: '#6b21a8' }}>
                    합산 {v.total.toLocaleString()}원
                  </span>
                </div>
                {v.orders.map((o) => (
                  <OrderAdminCard
                    key={o.id}
                    order={o}
                    onConfirmPaid={() => setConfirmTarget(o)}
                    onChange={reload}
                  />
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* 입금 확인 모달 */}
      {confirmTarget && (
        <ConfirmPaidModal
          order={confirmTarget}
          onClose={() => setConfirmTarget(null)}
          onSuccess={() => {
            setConfirmTarget(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// 개별 주문 카드
// ============================================================================

function OrderAdminCard({
  order,
  onConfirmPaid,
  onChange,
}: {
  order: OrderWithItems;
  onConfirmPaid: () => void;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [memoEditing, setMemoEditing] = useState(false);
  const [memoDraft, setMemoDraft] = useState(order.admin_memo ?? '');
  // ← [2026-06-30] 구매내역 전체 품목 모달 열림 상태 (데이터는 order.items에 이미 전부 있음)
  const [detailOpen, setDetailOpen] = useState(false);

  const statusColor = PAYMENT_STATUS_COLORS[order.payment_status];
  const isPending = order.payment_status === 'pending';
  const timeLeftMs = isPending ? getOrderTimeLeft(order.expires_at) : 0;
  const firstItem = order.items[0];
  const extraCount = order.items.length - 1;

  const handleCancel = async () => {
    if (!isPending) return;
    const reason = prompt(
      `주문 "${order.order_number}"을(를) 강제 취소합니다.\n취소 사유를 입력하세요:`,
      ''
    );
    if (!reason || !reason.trim()) {
      if (reason !== null) alert('취소 사유는 필수입니다.');
      return;
    }
    setBusy(true);
    try {
      await cancelOrderAdmin(order.id, reason);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '취소 실패');
    } finally {
      setBusy(false);
    }
  };

  const isPaid = order.payment_status === 'paid'; // ← [2026-06-23] paid 복구 액션 노출용

  // [2026-06-23] 입금 확인 취소 (paid → pending). 매출에서 자동 제외.
  const handleRevertPaid = async () => {
    if (!isPaid) return;
    if (!confirm(
      `⚠️ 입금 확인을 취소합니다.\n\n주문 "${order.order_number}" (${order.total_amount.toLocaleString()}원)\n→ '결제 대기'로 되돌아가고 매출 합계에서 제외됩니다.\n바자회 주문이면 재고가 다시 선점(reserved) 처리됩니다.\n\n계속할까요?`
    )) return;
    const reason = prompt('사유(선택) — 어드민 메모에 기록됩니다:', '입금 확인 오클릭 정정') ?? undefined;
    setBusy(true);
    try {
      await revertOrderPayment(order.id, reason);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '입금 확인 취소 실패');
    } finally {
      setBusy(false);
    }
  };

  // [2026-06-23] 주문 취소 (paid → cancelled). 판매분 재고 복원 + 매출 제외.
  const handleCancelPaid = async () => {
    if (!isPaid) return;
    const reason = prompt(
      `⚠️ 결제 완료된 주문 "${order.order_number}" (${order.total_amount.toLocaleString()}원)을(를) 취소합니다.\n매출에서 제외되고 바자회 재고가 복원됩니다.\n\n취소 사유를 입력하세요(필수):`,
      ''
    );
    if (!reason || !reason.trim()) {
      if (reason !== null) alert('취소 사유는 필수입니다.');
      return;
    }
    setBusy(true);
    try {
      await cancelPaidOrder(order.id, reason);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '주문 취소 실패');
    } finally {
      setBusy(false);
    }
  };

  const saveMemo = async () => {
    setBusy(true);
    try {
      await updateAdminMemo(order.id, memoDraft);
      onChange();
      setMemoEditing(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '메모 저장 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        border: '1px solid #eee',
        opacity: order.payment_status === 'cancelled' || order.payment_status === 'expired' ? 0.7 : 1,
      }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            padding: '3px 10px',
            background: statusColor.bg,
            color: statusColor.color,
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {PAYMENT_STATUS_LABELS[order.payment_status]}
        </span>
        <span
          style={{
            padding: '3px 8px',
            // ← [2026-07-08] 굿즈(goods) 배지 추가 — 기존엔 goods 가 '경매'로 오표기됨
            background: order.order_type === 'bazaar' ? '#f0f9ff' : order.order_type === 'goods' ? '#f0fdf4' : '#fdf4ff',
            color: order.order_type === 'bazaar' ? '#0c4a6e' : order.order_type === 'goods' ? '#166534' : '#6b21a8',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {order.order_type === 'bazaar' ? '🛍 바자회' : order.order_type === 'goods' ? '🎁 굿즈' : '🔨 경매'}
        </span>
        <Link
          to={`/orders/${order.order_number}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 12,
            color: '#111',
            textDecoration: 'none',
            fontFamily: 'monospace',
            fontWeight: 600,
          }}
        >
          {order.order_number} ↗
        </Link>
        <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>
          {fmtKstShort(order.created_at)}
        </span>
      </div>

      {/* 본문: 좌측 상품 + 우측 사용자/메모 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
        {/* 좌측: 상품 */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {firstItem?.thumbnail_snapshot && (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 6,
                background: `url(${firstItem.thumbnail_snapshot}) center / cover`,
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
              {firstItem?.product_name_snapshot ?? '(상품 정보 없음)'}
              {extraCount > 0 && (
                <span style={{ color: '#888', fontWeight: 400 }}> 외 {extraCount}개</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>
              {firstItem && (
                <>
                  {firstItem.price_snapshot.toLocaleString()}원
                  {firstItem.quantity > 1 && <span> × {firstItem.quantity}</span>}
                </>
              )}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
              총 {order.total_amount.toLocaleString()}원
            </div>

            {/* ← [2026-06-30] 전체 품목 보기 — 모달로 크게 표시(카드 좌측 컬럼이 좁아 가독성 개선) */}
            {order.items.length > 0 && (
              <button
                type="button"
                onClick={() => setDetailOpen(true)}
                style={{
                  marginTop: 8, padding: '5px 12px', borderRadius: 6,
                  border: '1px solid #d1d5db', background: '#fff',
                  color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                🧾 전체 품목 보기
                <span style={{ color: '#888', fontWeight: 500 }}>({order.items.length}개)</span>
              </button>
            )}
          </div>
        </div>

        {/* 우측: 사용자 + 입금 정보 */}
        <div style={{ fontSize: 12, lineHeight: 1.7, color: '#555' }}>
          <div>
            <span style={{ color: '#888' }}>주문자: </span>
            <strong>{order.user_name_snapshot}</strong>
            {order.user_dept_snapshot && (
              <span style={{ color: '#aaa' }}> · {order.user_dept_snapshot}</span>
            )}
          </div>
          <div style={{ color: '#888' }}>{order.user_email}</div>
          {order.payer_name && (
            <div>
              <span style={{ color: '#888' }}>입금자명: </span>
              <strong style={{ color: '#111' }}>{order.payer_name}</strong>
            </div>
          )}
          {order.memo && (
            <div style={{ fontSize: 11, color: '#888' }}>
              사용자 메모: {order.memo}
            </div>
          )}
          {/* ← [2026-07-08] 굿즈 펀딩: 자동취소 없음 → 결제 기한(절대날짜) 표시 */}
          {isPending && order.order_type === 'goods' && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#3730a3' }}>
              💳 결제 기한: {order.expires_at ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric', hour12: true }).format(new Date(order.expires_at)).replace(/\.\s*$/, '') : '별도 안내'} · 자동취소 없음
            </div>
          )}
          {isPending && order.order_type !== 'goods' && timeLeftMs > 0 && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#92400e' }}>
              ⏰ 입금 기한: {formatTimeLeft(timeLeftMs)}
            </div>
          )}
          {order.payment_status === 'paid' && order.paid_at && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#16a34a' }}>
              ✅ {fmtKstShort(order.paid_at)} 입금 확인됨
            </div>
          )}
          {order.cancelled_at && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#dc2626' }}>
              🚫 {fmtKstShort(order.cancelled_at)} 취소
              {order.cancelled_reason && <span> · {order.cancelled_reason}</span>}
            </div>
          )}
        </div>
      </div>

      {/* 어드민 메모 */}
      <div
        style={{
          marginTop: 12,
          padding: 10,
          background: '#fefce8',
          borderRadius: 6,
          fontSize: 12,
          border: '1px solid #fef3c7',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <strong style={{ color: '#92400e' }}>📝 어드민 메모</strong>
          {!memoEditing && (
            <button
              type="button"
              onClick={() => {
                setMemoDraft(order.admin_memo ?? '');
                setMemoEditing(true);
              }}
              style={{
                marginLeft: 'auto',
                padding: '2px 8px',
                background: '#fff',
                border: '1px solid #fde68a',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 11,
                color: '#92400e',
              }}
            >
              ✏️ 수정
            </button>
          )}
        </div>
        {memoEditing ? (
          <div>
            <textarea
              value={memoDraft}
              onChange={(e) => setMemoDraft(e.target.value)}
              disabled={busy}
              rows={2}
              placeholder="예: 입금자명 다름, 본인 이름 확인 완료"
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <button
                type="button"
                onClick={saveMemo}
                disabled={busy}
                style={{
                  padding: '4px 10px',
                  background: '#92400e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => setMemoEditing(false)}
                disabled={busy}
                style={{
                  padding: '4px 10px',
                  background: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <div style={{ color: '#92400e' }}>
            {order.admin_memo || <span style={{ color: '#aaa' }}>메모 없음</span>}
          </div>
        )}
      </div>

      {/* 액션 */}
      {isPending && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button
            type="button"
            onClick={onConfirmPaid}
            disabled={busy}
            style={{
              flex: 1,
              padding: '10px 12px',
              background: busy ? '#ccc' : '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            ✅ 입금 확인
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            style={{
              padding: '10px 14px',
              background: '#fff',
              border: '1px solid #fecaca',
              color: '#dc2626',
              borderRadius: 6,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            🚫 강제 취소
          </button>
        </div>
      )}

      {/* [2026-06-23] 결제 완료(paid) 주문 복구 액션 — 잘못 확인 정정/매출 원복 */}
      {isPaid && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button
            type="button"
            onClick={handleRevertPaid}
            disabled={busy}
            title="입금 확인을 취소하고 '결제 대기'로 되돌립니다 (매출 원복)"
            style={{
              flex: 1,
              padding: '10px 12px',
              background: '#fff',
              border: '1px solid #fcd34d',
              color: '#92400e',
              borderRadius: 6,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            ↩️ 입금 확인 취소
          </button>
          <button
            type="button"
            onClick={handleCancelPaid}
            disabled={busy}
            title="주문을 취소 처리합니다 (재고 복원 + 매출 원복)"
            style={{
              padding: '10px 14px',
              background: '#fff',
              border: '1px solid #fecaca',
              color: '#dc2626',
              borderRadius: 6,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            🚫 주문 취소
          </button>
        </div>
      )}
    </div>
    {detailOpen && <OrderItemsModal order={order} onClose={() => setDetailOpen(false)} />}
    </>
  );
}

// ============================================================================
// 전체 품목 보기 모달  (← 2026-06-30 신규: 카드 좌측 컬럼이 좁아 가독성이 떨어지는 문제 해결)
//   order.items 는 이미 JOIN으로 전부 로드돼 있으므로 추가 조회 없이 그대로 표시.
// ============================================================================
function OrderItemsModal({
  order,
  onClose,
}: {
  order: OrderWithItems;
  onClose: () => void;
}) {
  const statusColor = PAYMENT_STATUS_COLORS[order.payment_status];

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const totalQty = order.items.reduce((sum, it) => sum + it.quantity, 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          width: '100%',
          maxWidth: 560,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        {/* 헤더 (고정) */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>🧾 주문 상세</span>
              <span
                style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                  background: statusColor.bg, color: statusColor.color,
                }}
              >
                {PAYMENT_STATUS_LABELS[order.payment_status]}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>{order.order_number}</div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
              {order.user_name_snapshot}
              {order.user_dept_snapshot && <span style={{ color: '#aaa' }}> · {order.user_dept_snapshot}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, color: '#999', cursor: 'pointer', flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        {/* 품목 리스트 (스크롤) */}
        <div style={{ padding: '12px 22px', overflowY: 'auto', flex: 1 }}>
          <div style={{ fontSize: 12, color: '#888', margin: '4px 0 10px' }}>
            총 {order.items.length}개 품목 · {totalQty}개 수량
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {order.items.map((it, idx) => (
              <li
                key={it.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 0',
                  borderTop: idx === 0 ? 'none' : '1px solid #f0f0f0',
                }}
              >
                {it.thumbnail_snapshot ? (
                  <div
                    style={{
                      width: 48, height: 48, borderRadius: 6, flexShrink: 0,
                      background: `url(${it.thumbnail_snapshot}) center / cover`,
                    }}
                  />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 6, flexShrink: 0, background: '#f3f3f3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#ccc' }}>🛍</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>
                    {it.product_name_snapshot}
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {it.price_snapshot.toLocaleString()}원 × {it.quantity}개
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111', whiteSpace: 'nowrap' }}>
                  {(it.price_snapshot * it.quantity).toLocaleString()}원
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* 합계 (고정) */}
        <div style={{ padding: '16px 22px', borderTop: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa' }}>
          <span style={{ fontSize: 14, color: '#555' }}>총 결제 금액</span>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{order.total_amount.toLocaleString()}원</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 입금 확인 모달
// ============================================================================

function ConfirmPaidModal({
  order,
  onClose,
  onSuccess,
}: {
  order: OrderWithItems;
  onClose: () => void;
  onSuccess: () => void;
}) {
  // 사용자가 입력한 payer_name이 있으면 기본값으로 채움
  const [payerName, setPayerName] = useState(order.payer_name ?? order.user_name_snapshot);
  const [adminMemo, setAdminMemo] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!payerName.trim()) {
      alert('입금자명을 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      await markOrderPaid({
        orderId: order.id,
        payerName: payerName.trim(),
        adminMemo: adminMemo.trim() || undefined,
      });
      onSuccess();
    } catch (e) {
      alert(e instanceof Error ? e.message : '입금 확인 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>✅ 입금 확인</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#666', lineHeight: 1.6 }}>
          은행 앱에서 입금을 확인하셨나요? 확인 후 즉시 사용자에게 반영됩니다.
        </p>

        <div
          style={{
            background: '#f9fafb',
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <div>
            <span style={{ color: '#888' }}>주문번호: </span>
            <strong style={{ fontFamily: 'monospace' }}>{order.order_number}</strong>
          </div>
          <div>
            <span style={{ color: '#888' }}>주문자: </span>
            <strong>{order.user_name_snapshot}</strong>
            {order.user_dept_snapshot && (
              <span style={{ color: '#888' }}> · {order.user_dept_snapshot}</span>
            )}
          </div>
          <div>
            <span style={{ color: '#888' }}>금액: </span>
            <strong style={{ fontSize: 16, color: '#222' }}>
              {order.total_amount.toLocaleString()}원
            </strong>
          </div>
          {order.order_type === 'bazaar' && (
            <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>
              ⚠️ 바자회 주문 - 입금 확인 시 재고가 실제 차감됩니다.
            </div>
          )}
        </div>

        <Field label="입금자명 *">
          <input
            type="text"
            value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
            disabled={busy}
            placeholder="은행 앱에 표시된 이름 (예: 홍길동)"
            style={inputStyle}
            autoFocus
          />
        </Field>
        <p style={{ fontSize: 11, color: '#888', margin: '-6px 0 12px' }}>
          사용자가 입력한 이름이 자동으로 채워졌습니다. 실제 입금자명과 다르면 수정하세요.
        </p>

        <Field label="어드민 메모 (선택)">
          <textarea
            value={adminMemo}
            onChange={(e) => setAdminMemo(e.target.value)}
            disabled={busy}
            rows={2}
            placeholder="예: 가족 이름으로 입금됨, 본인 확인 완료"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Field>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            style={{
              flex: 1,
              padding: '12px',
              background: busy ? '#ccc' : '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {busy ? '처리 중…' : '✅ 입금 확인'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '12px 20px',
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 공통 UI
// ============================================================================

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: 13,
  boxSizing: 'border-box',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function SummaryChip({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: string;
  color?: string;
  bg?: string;
}) {
  return (
    <div
      style={{
        padding: '6px 12px',
        background: bg ?? '#f5f5f5',
        color: color ?? '#444',
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <span style={{ opacity: 0.7 }}>{label}: </span>
      <strong>{value}</strong>
    </div>
  );
}

function fmtKstShort(utcIso: string): string {
  if (!utcIso) return '-';
  const d = new Date(utcIso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  const min = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}
