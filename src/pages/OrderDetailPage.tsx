// ============================================================================
// OrderDetailPage — 주문 상세 / 입금 안내
//
// 라우트: /orders/:orderNumber
// 접근: 본인 또는 관리자만 (RLS가 차단)
//
// 기능:
//   - 주문 정보 (주문번호, 상태, 항목, 총액, 결제 정보)
//   - pending 상태: 입금 계좌 안내 + 만료 카운트다운 + 취소 버튼
//   - paid 상태: 결제 완료 안내 + 수령 정보
//   - cancelled/expired 상태: 안내 + 다시 주문 유도
//   - Realtime 구독 (어드민이 입금 확인 시 즉시 paid로 반영)
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEventPhase } from '@/hooks/useEventPhase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  loadOrderByNumberOrId,
  subscribeMyOrders,
  formatTimeLeft,
  formatKstEndDate,
  getOrderTimeLeft,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  type OrderWithItems,
} from '@/lib/orders';
import { formatKSTFull } from '@/utils/time';

export function OrderDetailPage() {
  const { orderNumber } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useCurrentUser();
  const { settings } = useEventPhase();
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0); // 카운트다운용 강제 리렌더

  const reload = async () => {
    if (!orderNumber) return;
    try {
      setError(null);
      const o = await loadOrderByNumberOrId(orderNumber); // ← [2026-06-25] order_number/id 둘 다 해석(알림 링크 복구)
      if (!o) {
        setError('주문을 찾을 수 없습니다.');
      } else {
        setOrder(o);
      }
    } catch (e) {
      console.error('[OrderDetailPage]', e);
      setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber]);

  // Realtime — 어드민이 입금 확인 시 즉시 반영
  useEffect(() => {
    if (!currentUser) return;
    const cleanup = subscribeMyOrders(currentUser.id, () => {
      void reload();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // pending이면 1초마다 카운트다운 갱신
  useEffect(() => {
    if (order?.payment_status !== 'pending') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [order?.payment_status]);

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>주문 정보 불러오는 중…</div>
    );
  }

  if (error || !order) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🚫</div>
        <h2>{error ?? '주문을 찾을 수 없습니다'}</h2>
        <Link
          to="/mypage/pending"
          style={{
            display: 'inline-block',
            marginTop: 16,
            padding: '10px 20px',
            background: '#1a1a1a',
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
          }}
        >
          마이페이지로
        </Link>
      </div>
    );
  }

  const statusColor = PAYMENT_STATUS_COLORS[order.payment_status];
  const timeLeftMs = getOrderTimeLeft(order.expires_at);
  const isExpired = timeLeftMs <= 0 && order.payment_status === 'pending';
  const bankInfo = settings.bank_account_info;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* 헤더 */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>주문번호</div>
        <h1 style={{ margin: '0 0 12px', fontSize: 24, letterSpacing: 1 }}>
          {order.order_number}
        </h1>
        <span
          style={{
            display: 'inline-block',
            padding: '6px 14px',
            background: statusColor.bg,
            color: statusColor.color,
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {PAYMENT_STATUS_LABELS[order.payment_status]}
          {isExpired && ' (만료)'}
        </span>
        <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
          주문일시: {formatKSTFull(order.created_at)}
        </div>
      </div>

      {/* 상태별 안내 */}
      {order.payment_status === 'pending' && !isExpired && bankInfo && (
        <BankAccountGuide
          bankInfo={bankInfo}
          totalAmount={order.total_amount}
          payerName={extractPayerName(order.memo)}
          timeLeftMs={timeLeftMs}
          expiresAt={order.expires_at}
        />
      )}
      {isExpired && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: 12,
            textAlign: 'center',
            fontSize: 14,
          }}
        >
          ⏰ 입금 기한이 만료되었습니다. 관리자가 곧 처리할 예정이며, 다시 주문해주세요.
        </div>
      )}
      {order.payment_status === 'paid' && (
        <div
          style={{
            marginTop: 16,
            padding: 20,
            background: '#dcfce7',
            color: '#166534',
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <strong style={{ fontSize: 16 }}>결제가 완료되었습니다!</strong>
          {order.paid_at && (
            <div style={{ marginTop: 4, fontSize: 12 }}>
              결제 확인: {formatKSTFull(order.paid_at)}
            </div>
          )}
          <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13, lineHeight: 1.6 }}>
            사내에서 수령 가능합니다. 수령 일정은 별도 공지됩니다.
          </p>
        </div>
      )}
      {order.payment_status === 'cancelled' && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: '#f0f0f0',
            color: '#666',
            borderRadius: 12,
            textAlign: 'center',
            fontSize: 13,
          }}
        >
          이 주문은 취소되었습니다.
          {order.cancelled_reason && (
            <div style={{ marginTop: 4, fontSize: 12 }}>사유: {order.cancelled_reason}</div>
          )}
        </div>
      )}

      {/* 주문 항목 */}
      <section
        style={{
          marginTop: 16,
          background: '#fff',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>📦 주문 상품</h2>
        {order.items.map((item, idx) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              gap: 12,
              padding: '12px 0',
              borderTop: idx === 0 ? 'none' : '1px solid #f5f5f5',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                flexShrink: 0,
                borderRadius: 8,
                background: item.thumbnail_snapshot
                  ? `url(${item.thumbnail_snapshot}) center / cover`
                  : '#f5f5f5',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                {item.product_name_snapshot}
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                {item.price_snapshot.toLocaleString()}원 × {item.quantity}개
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {(item.price_snapshot * item.quantity).toLocaleString()}원
            </div>
          </div>
        ))}
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '2px solid #f0f0f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 14, color: '#666' }}>총 결제 금액</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#222' }}>
            {order.total_amount.toLocaleString()}원
          </span>
        </div>
      </section>

      {/* 메모 */}
      {order.memo && (
        <section
          style={{
            marginTop: 16,
            background: '#fff',
            borderRadius: 12,
            padding: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <h2 style={{ margin: '0 0 8px', fontSize: 14 }}>📝 전달사항</h2>
          <pre
            style={{
              margin: 0,
              fontSize: 13,
              color: '#444',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'inherit',
            }}
          >
            {order.memo}
          </pre>
        </section>
      )}

      {/* 액션 */}
      <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => navigate('/mypage/pending')}
          style={{
            padding: '12px 20px',
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          마이페이지로
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 입금 안내 박스
// ============================================================================

function BankAccountGuide({
  bankInfo,
  totalAmount,
  payerName,
  timeLeftMs,
  expiresAt,
}: {
  bankInfo: { bank: string; account: string; holder: string; memo?: string };
  totalAmount: number;
  payerName: string | null;
  timeLeftMs: number;
  expiresAt: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(`${bankInfo.bank} ${bankInfo.account}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('clipboard error', e);
    }
  };

  return (
    <section
      style={{
        marginTop: 16,
        background: '#fff',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        border: '2px solid #0ea5e9',
      }}
    >
      <h2 style={{ margin: '0 0 4px', fontSize: 18, color: '#0ea5e9' }}>
        💳 입금 정보
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#666' }}>
        아래 계좌로 입금해주시면 관리자가 확인 후 결제 완료 처리됩니다.
      </p>

      <div
        style={{
          padding: 16,
          background: '#f0f9ff',
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <Row label="은행" value={bankInfo.bank} />
        <Row label="계좌번호" value={bankInfo.account} bold copyable onCopy={copyAccount} copied={copied} />
        <Row label="예금주" value={bankInfo.holder} />
        <Row
          label="입금 금액"
          value={`${totalAmount.toLocaleString()}원`}
          bold
          highlight
        />
        {payerName && <Row label="입금자명" value={payerName} />}
      </div>

      {/* 만료 카운트다운 */}
      <div
        style={{
          padding: 12,
          background: timeLeftMs < 3600 * 1000 ? '#fee2e2' : '#fef3c7',
          color: timeLeftMs < 3600 * 1000 ? '#991b1b' : '#92400e',
          borderRadius: 8,
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>
          {formatKstEndDate(expiresAt)}
        </div>
        ⏰ 입금 기한: <strong>{formatTimeLeft(timeLeftMs)}</strong> 남음
        <div style={{ marginTop: 4, fontSize: 11, opacity: 0.85 }}>
          위 입금 기한까지 미입금 시 주문이 자동 취소되며, 재고는 다시 구매 가능 상태로 복원됩니다.
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 10,
          background: '#f0f0f0',
          color: '#666',
          borderRadius: 6,
          fontSize: 11,
          lineHeight: 1.5,
        }}
      >
        ※ 결제 진행 후 사용자가 직접 주문을 취소할 수 없습니다.
        입금 기한 내 미입금 시에만 자동으로 취소됩니다.
      </div>

      {bankInfo.memo && (
        <p style={{ marginTop: 12, marginBottom: 0, fontSize: 11, color: '#888' }}>
          ※ {bankInfo.memo}
        </p>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  bold,
  highlight,
  copyable,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
  copyable?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 0',
        fontSize: 14,
      }}
    >
      <span style={{ color: '#666' }}>{label}</span>
      <span
        style={{
          fontWeight: bold ? 700 : 400,
          color: highlight ? '#0ea5e9' : '#222',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {value}
        {copyable && onCopy && (
          <button
            type="button"
            onClick={onCopy}
            style={{
              padding: '2px 8px',
              background: copied ? '#10b981' : '#1a1a1a',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {copied ? '복사됨!' : '복사'}
          </button>
        )}
      </span>
    </div>
  );
}

// ============================================================================
// 헬퍼: memo 첫 줄에서 입금자명 추출 (CheckoutPage에서 "입금자명: XXX" 형식으로 저장)
// ============================================================================
function extractPayerName(memo: string | null): string | null {
  if (!memo) return null;
  const match = memo.match(/^입금자명:\s*(.+)/);
  return match ? match[1].trim() : null;
}
