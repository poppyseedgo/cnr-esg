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
import { BlurImage } from '@/components/BlurImage'; // ← [2026-06-19] 이미지 lazy+블러업
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

export function BazaarProductPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useCurrentUser();
  // ← [2026-06-25] 구매 가능 여부/사유를 정책 훅에서 직접 수신 (선판매·공개·종료·기부자·토글 반영)
  const { canPurchase: windowAllows, blockReason } = useBazaarSale();

  const [product, setProduct] = useState<EsgProductRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageIdx, setImageIdx] = useState(0);
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
          to="/bazaar"
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
  const canPurchase = !soldOut && !paymentPending && windowAllows;

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
    <article style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 16, fontSize: 13 }}>
        <Link to="/bazaar" style={{ color: '#888', textDecoration: 'none' }}>
          🛍 바자회
        </Link>
        <span style={{ color: '#bbb', margin: '0 6px' }}>›</span>
        <span style={{ color: '#444' }}>{product.name}</span>
      </div>

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
                navigate('/bazaar', { replace: true });
              }}
            />
          )}
        </div>
      )}

      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        }}
      >
        {/* 이미지 */}
        <ImageCarousel images={images} currentIdx={imageIdx} onChange={setImageIdx} />

        {/* 정보 */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.4 }}>{product.name}</h1>

            {/* ← [2026-06-23] 카테고리/브랜드 태그 (클릭 시 해당 태그 상품 목록으로) */}
            {tags.length > 0 && (() => {
              const { categories, brands } = splitTagsByKind(tags);
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {categories.map((t) => (
                    <Link key={t.id} to={`/bazaar?cat=${t.slug}`} style={detailTagChip('#ecfdf5', '#047857')}>#{t.name}</Link>
                  ))}
                  {brands.map((t) => (
                    <Link key={t.id} to={`/bazaar?brand=${t.slug}`} style={detailTagChip('#111', '#fff')}>#{t.name}</Link>
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

          {/* ← [2026-06-29] 일일 구매 운영시간 실시간 안내/카운트다운 (버튼 위) */}
          <BazaarHoursNotice compact style={{ margin: 0 }} />

          {/* 버튼 */}
          {canPurchase ? (
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
        </div>
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

// ============================================================================
// 이미지 캐러셀
// ============================================================================

function ImageCarousel({
  images,
  currentIdx,
  onChange,
}: {
  images: string[];
  currentIdx: number;
  onChange: (idx: number) => void;
}) {
  const single = images.length <= 1;
  const goPrev = () => onChange((currentIdx - 1 + images.length) % images.length);
  const goNext = () => onChange((currentIdx + 1) % images.length);

  if (images.length === 0) {
    return (
      <div
        style={{
          aspectRatio: '1 / 1',
          background: 'linear-gradient(135deg, #e0f2fe, #ddd6fe)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 64,
          opacity: 0.3,
        }}
      >
        🛍
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        background: '#000',
        aspectRatio: '1 / 1',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>
        <BlurImage url={images[currentIdx]} width={1080} quality={78} alt={`이미지 ${currentIdx + 1}`} />
      </div>
      {!single && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="이전 이미지"
            style={{ ...arrowStyle, left: 12 }}
          >
            <img src="/icons/arrow-back.svg" alt="" aria-hidden="true" width={16} height={16} style={{ display: 'block' }} />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="다음 이미지"
            style={{ ...arrowStyle, right: 12 }}
          >
            <img src="/icons/arrow-forward.svg" alt="" aria-hidden="true" width={16} height={16} style={{ display: 'block' }} />
          </button>
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 6,
            }}
          >
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onChange(i)}
                aria-label={`이미지 ${i + 1}로 이동`}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  border: 'none',
                  padding: 0,
                  background: i === currentIdx ? '#fff' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// [2026-06-10] 갤러리 화살표: 64×64 글래스 버튼 (Figma 1307:578/582)
//   bg rgba(255,255,255,0.1) + backdrop-blur(글래스) + 미세 테두리. 아이콘은 24px SVG.
const arrowStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  width: 40,                                 // ← [2026-06-10] Figma 1308:615
  height: 40,
  borderRadius: '50%',
  border: '1px solid rgb(241 241 241 / 25%)',               // Figma 1308:615
  background: 'rgba(255, 255, 255, 0.1)',    // 10% 화이트 글래스
  backdropFilter: 'blur(12px)',              // glass 효과
  WebkitBackdropFilter: 'blur(12px)',        // Safari
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};
