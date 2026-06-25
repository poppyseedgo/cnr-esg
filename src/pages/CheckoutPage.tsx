// ============================================================================
// CheckoutPage — 바자회 결제 진행
//
// 흐름:
//   1. 장바구니 로드 + 가용재고 재검증 (다른 사람이 먼저 주문했을 수도)
//   2. 결제자명(예금주명) 입력 + 메모 입력
//   3. "주문하기" 클릭 → create_bazaar_order RPC
//   4. 성공 시 → /orders/:orderNumber (입금 안내 페이지)
//
// 가드:
//   - 장바구니 비어있으면 → 바자회로 redirect
//   - 구매 가능 여부는 useBazaarSale() 정책으로 판정 (선판매/공개/종료/기부자/토글, RPC+트리거도 재검증)
//
// 변경 이력:
//   2026-06-25  결제 게이팅을 useBazaarSale 훅으로 이관 (물품 기부자 선판매 정책).
//               shopActive/purchaseEnabled 로컬 계산 제거. payerName 검증은 유지.
//   - 가용재고 부족 시 차단 + 장바구니로 안내
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBazaarSale } from '@/hooks/useBazaarSale'; // ← [2026-06-25] 선판매 정책 훅
import { loadMyCart, calcCartTotal, type CartItemWithProduct } from '@/lib/cart';
import { getAvailableStock, isSoldOut, getDisplayPrice, isOnSale } from '@/lib/products';
import { createBazaarOrder } from '@/lib/orders';

export function CheckoutPage() {
  const { currentUser } = useCurrentUser();
  const navigate = useNavigate();
  // ← [2026-06-25] 결제 가능 여부/사유를 정책 훅에서 수신 (기간·기부자·토글·어드민·아카이브 반영)
  const { canPurchase: windowAllows, blockReason } = useBazaarSale();

  const [items, setItems] = useState<CartItemWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payerName, setPayerName] = useState(currentUser?.name ?? '');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 장바구니 로드
  const reload = async () => {
    if (!currentUser) return;
    try {
      setError(null);
      const list = await loadMyCart(currentUser.id);
      setItems(list);
    } catch (e) {
      console.error('[CheckoutPage] load error:', e);
      setError(e instanceof Error ? e.message : '장바구니를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  if (!currentUser) return null; // RequireAuth가 막아줌

  // 장바구니 비어있으면 안내
  if (!loading && items.length === 0 && !error) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🛒</div>
        <h2 style={{ margin: '0 0 8px' }}>장바구니가 비어있습니다</h2>
        <p style={{ color: '#888', marginBottom: 24 }}>먼저 상품을 담아주세요.</p>
        <Link
          to="/bazaar"
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            background: '#1a1a1a',
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
          }}
        >
          🛍 바자회로 가기
        </Link>
      </div>
    );
  }

  const totals = calcCartTotal(items);
  const overstockItems = items.filter((item) => {
    const available = getAvailableStock(item.product);
    return item.quantity > available || isSoldOut(item.product);
  });
  // ← [2026-06-25] 기간/기부자/토글/어드민 판정은 windowAllows로 일원화. 재고/항목수/결제자명은 별도 AND.
  const canCheckout =
    items.length > 0 &&
    overstockItems.length === 0 &&
    windowAllows &&
    payerName.trim().length > 0;

  // 주문 진행
  const handleSubmit = async () => {
    setSubmitError(null);

    if (!payerName.trim()) {
      setSubmitError('예금주명(입금자명)을 입력해주세요.');
      return;
    }
    if (items.length === 0) return;

    setSubmitting(true);
    try {
      // memo 첫 줄에 예금주명 기록 (어드민이 입금 확인 시 사용)
      const fullMemo = [`입금자명: ${payerName.trim()}`, memo.trim()].filter(Boolean).join('\n');

      const result = await createBazaarOrder(
        items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
        { memo: fullMemo, clearCart: true }
      );

      if (result.order_number) {
        // 입금 안내 페이지로 이동
        navigate(`/orders/${result.order_number}`, { replace: true });
      } else {
        throw new Error('주문번호가 발급되지 않았습니다.');
      }
    } catch (e) {
      console.error('[CheckoutPage] submit error:', e);
      setSubmitError(e instanceof Error ? e.message : '주문에 실패했습니다.');
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1>💳 결제</h1>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
      ) : error ? (
        <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>
          ⚠️ {error}
        </div>
      ) : (
        <>
          {/* 재고 경고 */}
          {overstockItems.length > 0 && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: '#fee2e2',
                color: '#991b1b',
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              ⚠️ 일부 상품의 재고가 부족합니다.{' '}
              <Link
                to="/cart"
                style={{ color: '#991b1b', fontWeight: 600, textDecoration: 'underline' }}
              >
                장바구니에서 수정
              </Link>
            </div>
          )}

          {/* 주문 항목 요약 */}
          <section
            style={{
              marginTop: 24,
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>📦 주문 상품 ({items.length}개)</h2>
            {items.map((item, idx) => (
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
                    background: item.product.thumbnail_url
                      ? `url(${item.product.thumbnail_url}) center / cover`
                      : '#f5f5f5',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                    {item.product.name}
                  </div>
                  <div style={{ fontSize: 13, color: '#666' }}>
                    {/* ← [2026-06-25] 세일가 반영(원가 취소선 병기) */}
                    {isOnSale(item.product) && (
                      <span style={{ textDecoration: 'line-through', color: '#bbb', marginRight: 6 }}>
                        {item.product.price.toLocaleString()}원
                      </span>
                    )}
                    {getDisplayPrice(item.product).toLocaleString()}원 × {item.quantity}개
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {(getDisplayPrice(item.product) * item.quantity).toLocaleString()}원
                </div>
              </div>
            ))}
            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: '2px solid #f0f0f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 14, color: '#666' }}>총 결제 금액</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#222' }}>
                {totals.totalAmount.toLocaleString()}원
              </span>
            </div>
          </section>

          {/* 결제 정보 입력 */}
          <section
            style={{
              marginTop: 16,
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>📝 입금자 정보</h2>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
              >
                예금주명(입금자명) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                placeholder="실제 입금할 분의 이름"
                disabled={submitting}
                maxLength={20}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                💡 본인이 직접 입금하지 않을 경우, 실제 입금자명으로 변경해주세요.
              </div>
            </div>

            <div>
              <label
                style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
              >
                전달사항 (선택)
              </label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="수령 관련 요청사항 등"
                disabled={submitting}
                rows={3}
                maxLength={500}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 8,
                  fontSize: 14,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </section>

          {/* 결제 안내 */}
          <section
            style={{
              marginTop: 16,
              background: '#fef3c7',
              borderRadius: 12,
              padding: 20,
              fontSize: 13,
              color: '#92400e',
              lineHeight: 1.6,
            }}
          >
            <strong>📌 결제 안내</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              <li>결제 방법: <strong>계좌이체</strong></li>
              <li>주문 후 안내되는 계좌로 입금해주시면 관리자가 확인 후 결제 완료 처리됩니다.</li>
              <li>
                <strong>입금 기한: 주문 후 15분 이내</strong> · 미입금 시 자동으로 취소되며,
                재고는 다시 구매 가능 상태로 복원됩니다.
              </li>
              <li>주문 후에는 사용자가 직접 취소할 수 없습니다.</li>
              <li>수령은 사내에서 진행됩니다.</li>
              <li>수익금 전부 생명의 숲에 기부됩니다 🌱</li>
            </ul>
          </section>

          {/* 에러 + 액션 */}
          {submitError && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: '#fee2e2',
                color: '#991b1b',
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              ⚠️ {submitError}
            </div>
          )}

          {/* ← [2026-06-25] 구매 불가 사유 안내 (선판매/구경전/종료/중단). /checkout 직접 진입 대비 */}
          {blockReason && overstockItems.length === 0 && (
            <div
              style={{
                marginTop: 16,
                padding: 10,
                background: '#fef3c7',
                color: '#92400e',
                borderRadius: 6,
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              {blockReason}
            </div>
          )}

          <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => navigate('/cart')}
              disabled={submitting}
              style={{
                padding: '14px 24px',
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: 8,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: 14,
              }}
            >
              ← 장바구니로
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canCheckout || submitting}
              style={{
                flex: 1,
                padding: '14px 24px',
                background: !canCheckout || submitting ? '#ccc' : '#1a1a1a',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: !canCheckout || submitting ? 'not-allowed' : 'pointer',
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              {submitting
                ? '주문 진행 중…'
                : `${totals.totalAmount.toLocaleString()}원 주문하기`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
