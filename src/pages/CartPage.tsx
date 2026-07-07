// ============================================================================
// CartPage — 장바구니
//
// 기능:
//   - 장바구니 항목 목록 (상품 정보 JOIN)
//   - 수량 변경 (+/-)
//   - 항목 삭제
//   - 총액 계산
//   - 결제 진행 (Phase 3-B에서 CheckoutPage)
//   - Realtime (다른 탭/디바이스에서 변경 시 동기화)
//
// 가용 재고 초과 시 경고 표시 (어드민이 재고를 줄였거나 다른 사람이 먼저 주문한 경우)
//
// 변경 이력:
//   2026-06-25  결제 게이팅을 useBazaarSale 훅으로 이관 (물품 기부자 선판매 정책).
//               shopActive/purchaseEnabled 로컬 계산 + 2개 메시지 블록 → blockReason 단일화.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBazaarSale } from '@/hooks/useBazaarSale'; // ← [2026-06-25] 선판매 정책 훅
import { BazaarHoursNotice } from '@/components/bazaar/BazaarHoursNotice'; // ← [2026-06-29] 운영시간 안내
import {
  loadMyCart,
  updateCartQuantity,
  removeFromCart,
  subscribeMyCart,
  calcCartTotal,
  type CartItemWithProduct,
} from '@/lib/cart';
import { getAvailableStock, isSoldOut, getDisplayPrice, isOnSale } from '@/lib/products';

export function CartPage() {
  const { currentUser } = useCurrentUser();
  const navigate = useNavigate();
  // ← [2026-06-25] 결제 가능 여부/사유를 정책 훅에서 수신 (기간·기부자·토글·어드민·아카이브 반영)
  const { canPurchase: windowAllows, blockReason } = useBazaarSale();

  const [items, setItems] = useState<CartItemWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const reload = async () => {
    if (!currentUser) return;
    try {
      setError(null);
      const list = await loadMyCart(currentUser.id);
      setItems(list);
    } catch (e) {
      console.error('[CartPage] load error:', e);
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

  useEffect(() => {
    if (!currentUser) return;
    const cleanup = subscribeMyCart(currentUser.id, () => {
      void reload();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  if (!currentUser) {
    return <div>로그인이 필요합니다.</div>; // RequireAuth가 막아주지만 안전망
  }

  const totals = calcCartTotal(items);

  // 가용 재고를 초과한 항목 (어드민이 재고 줄였거나 다른 사람 주문)
  const overstockItems = items.filter((item) => {
    const available = getAvailableStock(item.product);
    return item.quantity > available || isSoldOut(item.product);
  });

  // ← [2026-07-07] 결제는 섹션별(bazaarCanCheckout/goodsCanCheckout)로 분리 판정 → 통합 canCheckout 제거

  // ── [2026-07-07] 섹션 분리 결제: 바자회/굿즈는 주문 정책이 달라 각각 주문 ──
  const overstockOf = (arr: CartItemWithProduct[]) =>
    arr.filter((item) => item.quantity > getAvailableStock(item.product) || isSoldOut(item.product));
  const bazaarItems = items.filter((i) => (i.product.section ?? 'bazaar') === 'bazaar');
  const goodsItems = items.filter((i) => (i.product.section ?? 'bazaar') === 'goods');
  const bazaarTotals = calcCartTotal(bazaarItems);
  const goodsTotals = calcCartTotal(goodsItems);
  const bazaarCanCheckout = bazaarItems.length > 0 && overstockOf(bazaarItems).length === 0 && windowAllows; // 바자회=이벤트 게이트
  const goodsCanCheckout = goodsItems.length > 0 && overstockOf(goodsItems).length === 0;                    // 굿즈=상시

  // 수량 변경
  const handleChangeQuantity = async (item: CartItemWithProduct, delta: number) => {
    const newQty = item.quantity + delta;
    const available = getAvailableStock(item.product);
    if (newQty < 1) return;
    if (newQty > available) {
      alert(`재고가 ${available}개밖에 없습니다.`);
      return;
    }
    setBusyIds((prev) => new Set(prev).add(item.id));
    // 낙관적 업데이트
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, quantity: newQty } : i))
    );
    try {
      await updateCartQuantity(item.id, newQty);
    } catch (e) {
      console.error('[CartPage] update error:', e);
      // rollback
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, quantity: item.quantity } : i))
      );
      alert('수량 변경에 실패했습니다.');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // 삭제
  const handleRemove = async (item: CartItemWithProduct) => {
    if (!confirm(`"${item.product.name}"을(를) 장바구니에서 삭제하시겠습니까?`)) return;
    setBusyIds((prev) => new Set(prev).add(item.id));
    // 낙관적
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await removeFromCart(item.id);
    } catch (e) {
      console.error('[CartPage] remove error:', e);
      alert('삭제에 실패했습니다.');
      void reload();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1>🛒 장바구니</h1>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
      ) : error ? (
        <div
          style={{
            padding: 16,
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: 8,
          }}
        >
          ⚠️ {error}
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 48,
            textAlign: 'center',
            border: '1px dashed #ddd',
            marginTop: 24,
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🛒</div>
          <h3 style={{ margin: '0 0 8px' }}>장바구니가 비어있어요</h3>
          <p style={{ color: '#888', marginBottom: 24 }}>
            바자회에서 마음에 드는 상품을 담아보세요.
          </p>
          <Link
            to="/bazaar"
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              background: '#1a1a1a',
              color: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            🛍 바자회로 가기
          </Link>
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
              ⚠️ 일부 상품의 재고가 부족합니다. 수량을 조절하거나 삭제해주세요.
            </div>
          )}

          {/* 항목 목록 */}
          <div
            style={{
              marginTop: 24,
              background: '#fff',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            {items.map((item, idx) => {
              const available = getAvailableStock(item.product);
              const overstock = item.quantity > available || isSoldOut(item.product);
              const busy = busyIds.has(item.id);
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    padding: 16,
                    borderTop: idx === 0 ? 'none' : '1px solid #f0f0f0',
                    alignItems: 'flex-start',
                  }}
                >
                  {/* 썸네일 */}
                  <Link
                    to={`/bazaar/${item.product.id}`}
                    style={{
                      width: 72,
                      height: 72,
                      flexShrink: 0,
                      borderRadius: 8,
                      background: item.product.thumbnail_url
                        ? `url(${item.product.thumbnail_url}) center / cover`
                        : '#f5f5f5',
                      overflow: 'hidden',
                    }}
                    aria-label={item.product.name}
                  />

                  {/* 정보 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      to={`/bazaar/${item.product.id}`}
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#222',
                        textDecoration: 'none',
                        display: 'block',
                        marginBottom: 4,
                      }}
                    >
                      {item.product.name}
                    </Link>
                    <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
                      {/* ← [2026-06-25] 세일가 반영(원가 취소선 병기) */}
                      {isOnSale(item.product) && (
                        <span style={{ textDecoration: 'line-through', color: '#bbb', marginRight: 6 }}>
                          {item.product.price.toLocaleString()}원
                        </span>
                      )}
                      {getDisplayPrice(item.product).toLocaleString()}원
                    </div>

                    {overstock && (
                      <div
                        style={{
                          fontSize: 11,
                          color: '#991b1b',
                          marginBottom: 8,
                        }}
                      >
                        {isSoldOut(item.product)
                          ? '⚠️ 품절'
                          : `⚠️ 재고 ${available}개만 가능`}
                      </div>
                    )}

                    {/* 수량 + 삭제 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          border: '1px solid #ddd',
                          borderRadius: 6,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleChangeQuantity(item, -1)}
                          disabled={busy || item.quantity <= 1}
                          style={{
                            width: 28,
                            height: 28,
                            border: 'none',
                            background: '#fff',
                            cursor: busy || item.quantity <= 1 ? 'not-allowed' : 'pointer',
                            fontSize: 16,
                          }}
                          aria-label="수량 감소"
                        >
                          −
                        </button>
                        <span
                          style={{
                            minWidth: 32,
                            textAlign: 'center',
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleChangeQuantity(item, 1)}
                          disabled={busy || item.quantity >= available}
                          style={{
                            width: 28,
                            height: 28,
                            border: 'none',
                            background: '#fff',
                            cursor: busy || item.quantity >= available ? 'not-allowed' : 'pointer',
                            fontSize: 16,
                          }}
                          aria-label="수량 증가"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemove(item)}
                        disabled={busy}
                        style={{
                          padding: '4px 8px',
                          background: 'none',
                          border: 'none',
                          color: '#888',
                          cursor: busy ? 'not-allowed' : 'pointer',
                          fontSize: 12,
                          textDecoration: 'underline',
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </div>

                  {/* 항목 합계 */}
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#222',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {(getDisplayPrice(item.product) * item.quantity).toLocaleString()}원
                  </div>
                </div>
              );
            })}
          </div>

          {/* 총합 + 결제 */}
          <div
            style={{
              marginTop: 24,
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
                paddingBottom: 16,
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <span style={{ fontSize: 13, color: '#666' }}>
                {totals.itemCount}개 상품 · {totals.totalQuantity}개 수량
              </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#222' }}>
                {totals.totalAmount.toLocaleString()}원
              </span>
            </div>

            {/* ← [2026-07-07] 섹션별 결제. 두 섹션이 섞여 있으면 각각 주문(정책이 다름). */}
            {bazaarItems.length > 0 && (
              <div style={{ marginBottom: goodsItems.length > 0 ? 16 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#666' }}>🛍 바자회 {bazaarTotals.itemCount}개 · {bazaarTotals.totalQuantity}개 수량</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#222' }}>{bazaarTotals.totalAmount.toLocaleString()}원</span>
                </div>
                <BazaarHoursNotice compact style={{ marginTop: 0, marginBottom: 8 }} />
                {!bazaarCanCheckout && blockReason && (
                  <div style={{ padding: 10, background: '#fef3c7', color: '#92400e', borderRadius: 6, fontSize: 12, marginBottom: 8, textAlign: 'center' }}>{blockReason}</div>
                )}
                <button
                  type="button"
                  onClick={() => navigate('/checkout?section=bazaar')}
                  disabled={!bazaarCanCheckout}
                  style={checkoutBtnStyle(bazaarCanCheckout)}
                >
                  {bazaarCanCheckout ? '🛍 바자회 상품 주문하기' : '바자회 결제 불가'}
                </button>
              </div>
            )}

            {goodsItems.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#666' }}>🎁 굿즈 {goodsTotals.itemCount}개 · {goodsTotals.totalQuantity}개 수량</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#222' }}>{goodsTotals.totalAmount.toLocaleString()}원</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/checkout?section=goods')}
                  disabled={!goodsCanCheckout}
                  style={checkoutBtnStyle(goodsCanCheckout)}
                >
                  {goodsCanCheckout ? '🎁 굿즈 상품 주문하기' : '굿즈 결제 불가'}
                </button>
              </div>
            )}
            <p style={{ marginTop: 8, fontSize: 11, color: '#aaa', textAlign: 'center' }}>
              계좌이체 결제 · 사내 수령 · 수익금 전부 생명의 숲 기부
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ← [2026-07-07] 섹션별 주문 버튼 공통 스타일
function checkoutBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '14px 20px',
    background: enabled ? '#1a1a1a' : '#ccc',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontSize: 15,
    fontWeight: 700,
  };
}
