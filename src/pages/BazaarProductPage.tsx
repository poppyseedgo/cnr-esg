// ============================================================================
// BazaarProductPage — 상품 상세 + 장바구니 추가
//
// 기능:
//   - 이미지 캐러셀 (썸네일 + detail_images)
//   - 상품 정보 (이름, 가격, 재고, 설명)
//   - 수량 선택 (1 ~ 가용재고)
//   - 장바구니 추가 / 즉시 구매
//   - 구매 가능 여부는 useBazaarSale() 정책으로 판정 (선판매/공개/종료/기부자)
//
// 변경 이력:
//   2026-06-25  구매 게이팅을 useBazaarSale 훅으로 이관 (물품 기부자 선판매 정책).
//               기존 shopActive/purchaseEnabled 로컬 계산 제거 → 정책 SSOT 사용.
// ============================================================================

import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Breadcrumb } from '@/components/Breadcrumb'; // ← [2026-07-08] 공용 브레드크럼(경매와 동일)
import { ImageScroll } from '@/components/ImageScroll'; // ← [2026-07-08] 경매식 세로 스크롤 이미지
import { StickyPanel } from '@/components/StickyPanel'; // ← [2026-07-08] 경매식 우측 정보 sticky
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBazaarSale } from '@/hooks/useBazaarSale'; // ← [2026-06-25] 선판매 정책 훅
import { BazaarHoursNotice } from '@/components/bazaar/BazaarHoursNotice'; // ← [2026-06-29] 운영시간 안내
import {
  loadProduct,
  getAvailableStock,
  getDisplayStatus,
  isNewProduct,
  getDisplayPrice,
  subscribeProducts,
} from '@/lib/products';
import { formatShortCountdown } from '@/lib/orders'; // ← [2026-06-25] MM:SS 카운트다운
import { loadReservationStatus } from '@/lib/reservations'; // ← [2026-06-25]
import { useNowTick } from '@/hooks/useNowTick'; // ← [2026-06-25]
import { useProductReservation } from '@/hooks/useProductReservation'; // ← [2026-06-25]
import { PriceTag } from '@/components/PriceTag'; // ← [2026-06-25] 원가/판매가/할인율 표시
import { addToCart } from '@/lib/cart';
import { signInWithMicrosoft } from '@/lib/auth';
import { ProductEditForm } from '@/components/admin/ProductEditForm';
import { ProductDetailTabs } from '@/components/ProductDetailTabs';
import { FundingSidebar } from '@/components/goods/FundingSidebar'; // ← [2026-07-08] 펀딩 사이드바(Figma 2320:55)
import { CustomLabel } from '@/components/CustomLabel'; // ← [2026-07-06] 커스텀 라벨
import { getProductTags, splitTagsByKind } from '@/lib/tags'; // ← [2026-06-23] 상세 태그
import type { EsgProductRow, EsgTagRow } from '@/types/esg';

// ← [2026-06-23] 상세 태그 칩(클릭 시 해당 태그 필터로 이동)
function detailTagChip(bg: string, color: string): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    background: bg,
    color,
    borderRadius: 5,
    padding: '4px 9px',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  };
}

// ← [2026-07-07] section prop 으로 바자회/굿즈 공용화. 기본 'bazaar'(기존과 100% 동일).
export function BazaarProductPage({ section = 'bazaar' }: { section?: 'bazaar' | 'goods' } = {}) {
  const isGoods = section === 'goods';
  const listPath = isGoods ? '/goods' : '/bazaar'; // 뒤로가기/브레드크럼/태그칩 베이스
  const { productId } = useParams();
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useCurrentUser();
  // ← [2026-06-25] 구매 가능 여부/사유를 정책 훅에서 수신. 굿즈는 상시판매 → 창(window) 항상 허용.
  const sale = useBazaarSale(); // 훅은 항상 호출(조건부 호출 불가). 굿즈면 결과 무시.
  const windowAllows = isGoods ? true : sale.canPurchase;       // ← [2026-07-07] 굿즈=게이트 없음
  const blockReason = isGoods ? null : sale.blockReason;        // ← [2026-07-07]

  const [product, setProduct] = useState<EsgProductRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [adminEditing, setAdminEditing] = useState(false);
  const [tags, setTags] = useState<EsgTagRow[]>([]); // ← [2026-06-23] 상세 태그

  // ← [2026-06-25] 입금 대기(예약) 상태 + 1초 틱 (early return 전에 무조건 호출)
  const reservation = useProductReservation(product?.id ?? '');
  const nowMs = useNowTick();

  useEffect(() => {
    if (!product?.id) { setTags([]); return; }
    let alive = true;
    getProductTags(product.id).then((rows) => { if (alive) setTags(rows); }).catch(() => { if (alive) setTags([]); });
    return () => { alive = false; };
  }, [product?.id]);

  const reload = async () => {
    if (!productId) return;
    try {
      setError(null);
      const p = await loadProduct(productId);
      if (!p) {
        setError('상품을 찾을 수 없습니다.');
      } else if (p.status === 'hidden') {
        setError('판매 중지된 상품입니다.');
      } else {
        setProduct(p);
        // 수량을 가용재고 한도로 제한
        const available = getAvailableStock(p);
        setQuantity((q) => Math.min(Math.max(1, q), Math.max(available, 1)));
      }
    } catch (e) {
      console.error('[BazaarProductPage]', e);
      setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // Realtime — 재고 / 상태 변경 즉시 반영
  useEffect(() => {
    void loadReservationStatus(); // ← [2026-06-25] 진입 시 예약 현황 로드
    const cleanup = subscribeProducts(() => {
      void reload();
      void loadReservationStatus(); // ← [2026-06-25] reserved_stock 변동 동기화
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>
        🛍 불러오는 중…
      </div>
    );
  }

  if (error || !product) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🚫</div>
        <h2>{error ?? '상품을 찾을 수 없습니다'}</h2>
        <Link
          to={listPath}
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
          바자회로 돌아가기
        </Link>
      </div>
    );
  }

  // 이미지 리스트 (썸네일 우선 + detail_images)
  const images: string[] = [];
  if (product.thumbnail_url) images.push(product.thumbnail_url);
  for (const img of product.detail_images ?? []) {
    if (img && !images.includes(img)) images.push(img);
  }

  const available = getAvailableStock(product);
  const displayStatus = getDisplayStatus(product, reservation?.until ?? null, nowMs); // ← [2026-06-25] 파생 상태
  const soldOut = displayStatus === 'sold_out';            // 판매 완료(품절)
  const paymentPending = displayStatus === 'payment_pending'; // 입금 대기 중
  const countdownMs = reservation ? new Date(reservation.until).getTime() - nowMs : 0; // ← [2026-06-25]
  // ← [2026-06-25] 재고/예약(soldOut·paymentPending)은 정책이 모르는 영역이라 별도 AND. 나머지는 windowAllows가 판정.
  const isFundingProduct = product.purchase_type === 'funding'; // ← [2026-07-07] 펀딩은 FundingPanel이 담당
  const canPurchase = !soldOut && !paymentPending && windowAllows && !isFundingProduct; // ← [2026-07-07]

  const handleAddToCart = async () => {
    if (!currentUser) {
      signInWithMicrosoft().catch(console.error);
      return;
    }
    if (!canPurchase || quantity < 1) return;

    setActionLoading(true);
    setActionMessage(null);
    try {
      await addToCart(
        { id: currentUser.id, email: currentUser.email },
        product.id,
        quantity
      );
      setActionMessage({ type: 'success', text: '장바구니에 담았습니다!' });
    } catch (e) {
      console.error('[BazaarProductPage] addToCart error:', e);
      setActionMessage({
        type: 'error',
        text: e instanceof Error ? e.message : '장바구니 추가에 실패했습니다.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleBuyNow = async () => {
    if (!currentUser) {
      signInWithMicrosoft().catch(console.error);
      return;
    }
    if (!canPurchase || quantity < 1) return;
    // 장바구니에 담은 다음 결제 페이지로
    setActionLoading(true);
    try {
      await addToCart(
        { id: currentUser.id, email: currentUser.email },
        product.id,
        quantity
      );
      navigate('/checkout');
    } catch (e) {
      console.error('[BazaarProductPage] buy now error:', e);
      setActionMessage({
        type: 'error',
        text: e instanceof Error ? e.message : '주문에 실패했습니다.',
      });
      setActionLoading(false);
    }
  };

  return (
    <article style={{ maxWidth: 1360, margin: '0 auto' }}>
      {/* ← [2026-07-08] 경매 상세와 동일한 2열 그리드(좌 이미지 크게 / 우 정보). 모바일=단일열 */}
      <style>{`
        .pd-grid { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 40px; }
        .pd-media { min-width: 0; }
        .pd-side { min-width: 0; }
        .pd-side > div { min-width: 0; }
        @media (max-width: 1023px) {
          .pd-grid { grid-template-columns: 1fr; gap: 24px; }
        }
      `}</style>

      {/* Breadcrumb (경매와 동일 공용 컴포넌트) */}
      <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: isGoods ? 'Goods' : 'Bazaar', to: listPath }]} current={product.name} />

      {/* 어드민 편집 도구 */}
      {isAdmin && (
        <div
          style={{
            background: '#fff',
            border: '2px solid #0ea5e9',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: adminEditing ? 12 : 0,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  padding: '2px 8px',
                  background: '#0ea5e9',
                  color: '#fff',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                🔧 ADMIN
              </span>
              <span style={{ fontSize: 13, color: '#444' }}>
                관리자 편집 (상태: <strong>{product.status}</strong> · 가용 재고{' '}
                {getAvailableStock(product)}/{product.stock})
              </span>
            </div>
            {!adminEditing && (
              <button
                type="button"
                onClick={() => setAdminEditing(true)}
                style={{
                  padding: '6px 12px',
                  background: '#0ea5e9',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                ✏️ 상품 편집
              </button>
            )}
          </div>

          {adminEditing && (
            <ProductEditForm
              product={product}
              onSuccess={() => {
                setAdminEditing(false);
                void reload();
              }}
              onCancel={() => setAdminEditing(false)}
              onDeleted={() => {
                setAdminEditing(false);
                navigate(listPath, { replace: true });
              }}
            />
          )}
        </div>
      )}

      <div className="pd-grid">
        {/* 이미지: 경매식 세로 스크롤 스택(썸네일+상세이미지 원본비율) */}
        <div className="pd-media">
          <ImageScroll images={images} placeholder={isGoods ? '🎁' : '🛍️'} />
        </div>

        {/* 정보: 경매식 우측 sticky 패널 */}
        <StickyPanel className="pd-side" offsetTop={24} offsetBottom={24}>
        <div style={{ padding: 0, display: 'flex', flexDirection: 'column', gap: isFundingProduct ? 0 : 16 }}>
          {/* ← [2026-07-08] 펀딩 상품: 라벨~CTA 전체를 FundingSidebar(Figma 2320:55)가 담당 */}
          {isFundingProduct ? (
            <FundingSidebar product={product} />
          ) : (
          <>
          <div>
            {isNewProduct(product) && (
              <span
                style={{
                  display: 'inline-block',
                  marginBottom: 8,
                  padding: '3px 10px',
                  background: '#0ea5e9',
                  color: '#fff',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.2,
                }}
              >
                🆕 새 상품
              </span>
            )}
            {/* ← [2026-07-06] 커스텀 라벨 (제목 위). 텍스트 없으면 미표시 */}
            {product.label_text && product.label_text.trim() && (
              <div style={{ marginBottom: 8 }}>
                <CustomLabel text={product.label_text} bg={product.label_bg} color={product.label_color} />
              </div>
            )}
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.4 }}>{product.name}</h1>

            {/* ← [2026-06-23] 카테고리/브랜드 태그 (클릭 시 해당 태그 상품 목록으로) */}
            {tags.length > 0 && (() => {
              const { categories, brands } = splitTagsByKind(tags);
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {categories.map((t) => (
                    <Link key={t.id} to={`${listPath}?cat=${t.slug}`} style={detailTagChip('#ecfdf5', '#047857')}>#{t.name}</Link>
                  ))}
                  {brands.map((t) => (
                    <Link key={t.id} to={`${listPath}?brand=${t.slug}`} style={detailTagChip('#111', '#fff')}>#{t.name}</Link>
                  ))}
                </div>
              );
            })()}

            {/* ← [2026-06-25] 세일이면 원가(취소선)+할인%+판매가, 아니면 정상가 */}
            <div style={{ marginTop: 12 }}>
              <PriceTag product={product} size="detail" />
            </div>
          </div>

          {/* 재고 / 입금 대기 상태 */}
          <div
            style={{
              padding: 12,
              background: paymentPending ? '#fffbeb' : soldOut ? '#fee2e2' : available <= 5 ? '#fef3c7' : '#f0fdf4',
              color: paymentPending ? '#b45309' : soldOut ? '#991b1b' : available <= 5 ? '#92400e' : '#166534',
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {paymentPending ? (
              <>⏳ 다른 분이 입금 대기 중입니다 · 남은 시간{' '}
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatShortCountdown(countdownMs)}</strong>
                {' '}· 미입금 시 다시 구매 가능</>
            ) : soldOut ? (
              <>🚫 판매 완료되었습니다</>
            ) : available <= 5 ? (
              <>⚠️ {available}개 남았어요. 서두르세요!</>
            ) : (
              <>✅ 재고 충분 ({available}개)</>
            )}
          </div>

          {/* 설명은 하단 탭 영역에서 마크다운으로 표시 */}

          {/* ← [2026-07-07] 펀딩 상품: 일반 구매영역 대신 펀딩 참여 패널 */}
          {/* ← [2026-07-08] 펀딩은 상단 FundingSidebar 전담(여기 도달 안 함) */}

          {/* 수량 선택 */}
          {canPurchase && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 13, color: '#666' }}>수량:</label>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #ddd', borderRadius: 6 }}>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  style={{
                    width: 32,
                    height: 32,
                    border: 'none',
                    background: '#fff',
                    cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
                    fontSize: 18,
                  }}
                  aria-label="수량 감소"
                >
                  −
                </button>
                <span
                  style={{
                    minWidth: 40,
                    textAlign: 'center',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(available, q + 1))}
                  disabled={quantity >= available}
                  style={{
                    width: 32,
                    height: 32,
                    border: 'none',
                    background: '#fff',
                    cursor: quantity >= available ? 'not-allowed' : 'pointer',
                    fontSize: 18,
                  }}
                  aria-label="수량 증가"
                >
                  +
                </button>
              </div>
              <span style={{ fontSize: 12, color: '#888' }}>
                {/* ← [2026-06-25] 세일가 기준 합계(서버 청구액과 일치) */}
                총 {(getDisplayPrice(product) * quantity).toLocaleString()}원
              </span>
            </div>
          )}

          {/* 액션 메시지 */}
          {actionMessage && (
            <div
              style={{
                padding: 10,
                background: actionMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
                color: actionMessage.type === 'success' ? '#166534' : '#991b1b',
                borderRadius: 6,
                fontSize: 13,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{actionMessage.text}</span>
              {actionMessage.type === 'success' && (
                <Link
                  to="/cart"
                  style={{
                    fontWeight: 600,
                    color: 'inherit',
                    textDecoration: 'underline',
                  }}
                >
                  장바구니 보기 →
                </Link>
              )}
            </div>
          )}

          {/* ← [2026-06-29] 일일 구매 운영시간 안내(버튼 위). 굿즈는 상시판매 → 미표시 */}
          {!isGoods && <BazaarHoursNotice compact style={{ margin: 0 }} />}

          {/* 버튼 (펀딩은 위 FundingPanel이 담당 → 여기선 렌더 안 함) */}
          {isFundingProduct ? null : canPurchase ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={actionLoading}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: '1px solid #1a1a1a',
                  background: '#fff',
                  color: '#1a1a1a',
                  borderRadius: 8,
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                🛒 장바구니
              </button>
              <button
                type="button"
                onClick={handleBuyNow}
                disabled={actionLoading}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: 'none',
                  background: '#1a1a1a',
                  color: '#fff',
                  borderRadius: 8,
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                바로 구매
              </button>
            </div>
          ) : (
            <div
              style={{
                padding: 16,
                background: '#f5f5f5',
                borderRadius: 8,
                textAlign: 'center',
                color: '#666',
                fontSize: 13,
              }}
            >
              {/* ← [2026-06-25] 품절은 정책이 모르므로 최우선, 그 외 사유는 정책 blockReason 사용 */}
              {soldOut
                ? '품절된 상품입니다'
                : blockReason ?? '지금은 구매할 수 없습니다'}
            </div>
          )}
          </>
          )}
        </div>
        </StickyPanel>
      </div>

      {/* 하단 탭 영역 */}
      <ProductDetailTabs
        productType="bazaar"
        productId={product.id}
        description={product.description}
      />
    </article>
  );
}

