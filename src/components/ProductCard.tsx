// ============================================================================
// ProductCard — 바자회 상품 카드 (BazaarPage 등에서 공통 사용)
//
// [변경 이력]
//   2026-06-25  [15분 결제정책] "입금 대기 중" 표시 + 실시간 카운트다운.
//               · isSoldOut → getDisplayStatus(파생: 판매중/입금대기중/판매완료)
//               · 입금 대기 중: 가용 0 & 활성예약 → 앰버 오버레이 + MM:SS 카운트다운
//               · 카운트다운 0(만료) 통과 시 즉시 판매중 복귀(낙관, 서버 자가치유가 구매 보장)
//               · useProductReservation(공유 스토어) + useNowTick(공유 1초틱) — N구독/N타이머 회피
//   2026-06-25  [선판매 정책] 빠른 담기(add to cart)를 구매권한 정책과 일치시킴.
//               · canQuickAdd/quickAddBlockReason prop 추가(페이지에서 useBazaarSale 1회 판정 후 주입)
//               · 불가 구간(시작전/선판매 비기부자/종료/중단)엔 버튼 회색 비활성 + 호버 tooltip
//               · 카드별 훅 호출 회피(N Realtime 구독/RPC 방지) — wishlist 패턴과 동일 철학
//   2026-06-24  [Task 2] Figma 리스트 카드 3-상태 1:1 재구현.
//               · 기본(1791:216) / 호버·찜안함(1791:194) / 호버·찜함(1791:411)
//               · full-bleed 정사각 이미지(aspect 1/1, bg #d7d7d7) + 모서리/보더/그림자 제거
//               · 호버 시 이미지 하단 액션바 [Add To Cart | 찜/이미 찜 함] 슬라이드 등장
//               · 찜 상태 → 본문에 초록 "찜" 뱃지 상시 노출(#beff9b) + 액션바 버튼 전환
//               · 본문 패딩 16/20/20/0(좌 0=Figma), 뱃지/제목/가격 14·20px Pretendard Regular
//               · add-to-cart=기존 cart API(qty 1), 찜=신규 useWishlist 훅
//               · 품절/저재고 등 필수 안전 동작 보존(품절 시 액션바 미노출)
//   2026-06-24  [모바일 최적화] 호버 액션바 버튼을 카드 폭 비례(container query)로 재설계.
//               · 고정 padding 16/32·font 16 → cqi+clamp 로 카드폭에 비례 축소(2열 모바일 안 넘침)
//               · 런타임 <style> 주입(ensureStyles) 제거 → 전역 index.css 클래스로 이관(공유/캐시)
//               · .pcard / .pcard-img / .pcard-actions / .pcard-btn 사용
//   2026-06-23  카테고리/브랜드 태그 칩(splitTagsByKind) — Task2 카드에서 제거됨(필터는 사이드바로 이관)
//
// [Figma SSOT] node 1791:216 / 1791:194 / 1791:411 (file ydfT0xP6nc83VxFd7GyEx4)
// ============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getAvailableStock, isNewProduct, getDisplayStatus } from '@/lib/products'; // ← [2026-06-25] getDisplayStatus
import { formatShortCountdown } from '@/lib/orders'; // ← [2026-06-25] MM:SS 카운트다운
import { useNowTick } from '@/hooks/useNowTick'; // ← [2026-06-25] 공유 1초 틱
import { useProductReservation } from '@/hooks/useProductReservation'; // ← [2026-06-25] 활성 예약
import { BlurImage } from './BlurImage'; // ← 썸네일 lazy+블러업
import { PriceTag } from './PriceTag'; // ← [2026-06-25] 원가/판매가/할인율 표시
import { addToCart } from '@/lib/cart'; // ← [2026-06-24] 카드 빠른 담기
import { signInWithMicrosoft } from '@/lib/auth'; // ← [2026-06-24] 비로그인 가드
import { useCurrentUser } from '@/hooks/useCurrentUser'; // ← [2026-06-24]
import { useWishlist } from '@/hooks/useWishlist'; // ← [2026-06-24] 찜 토글
import type { EsgProductRow } from '@/types/esg';

// 호버 액션바/카드 스타일은 전역 index.css(.pcard*)로 이관됨 (런타임 주입 제거).

interface ProductCardProps {
  product: EsgProductRow;
  /** 빠른 담기 허용 여부(선판매 정책). 페이지에서 useBazaarSale로 1회 판정해 전달. 기본 true.
   *  ← [2026-06-25] 카드마다 훅 호출 시 N개의 Realtime 구독+기부자 RPC가 생기므로 prop으로 주입. */
  canQuickAdd?: boolean;
  /** 빠른 담기 불가 사유(데스크톱 호버 tooltip 표시용). 상세 사유 안내는 상세페이지가 담당. */
  quickAddBlockReason?: string | null;
}

export function ProductCard({ product, canQuickAdd = true, quickAddBlockReason = null }: ProductCardProps) {
  const { currentUser } = useCurrentUser();
  const { wishlisted, toggle } = useWishlist(product.id); // ← [2026-06-24]

  const reservation = useProductReservation(product.id); // ← [2026-06-25] 활성 예약(없으면 null)
  const nowMs = useNowTick();                              // ← [2026-06-25] 1초 틱(카운트다운 구동)

  const available = getAvailableStock(product);
  const displayStatus = getDisplayStatus(product, reservation?.until ?? null, nowMs); // ← [2026-06-25] 파생 상태
  const soldOut = displayStatus === 'sold_out';            // 판매 완료(품절)
  const paymentPending = displayStatus === 'payment_pending'; // 입금 대기 중
  const blocked = soldOut || paymentPending;               // 액션바 미노출/담기 차단
  const countdownMs = reservation ? new Date(reservation.until).getTime() - nowMs : 0; // ← [2026-06-25]

  const [adding, setAdding] = useState(false); // ← [2026-06-24] 담기 진행/완료 transient
  const [justAdded, setJustAdded] = useState(false);

  // 빠른 담기 — 카드는 Link이므로 버튼 클릭 시 네비게이션 차단
  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); // ← Link 이동 방지
    if (!canQuickAdd) return; // ← [2026-06-25] 선판매 정책: 구매 불가 구간/비기부자 차단(버튼도 비활성)
    if (!currentUser) { signInWithMicrosoft().catch(console.error); return; }
    if (blocked || adding) return; // ← [2026-06-25] 품절+입금대기중 모두 담기 차단
    setAdding(true);
    try {
      await addToCart({ id: currentUser.id, email: currentUser.email }, product.id, 1); // notifyCartChanged 포함
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 1200); // ← 1.2s "담음!" 표시 후 복귀
    } catch (err) {
      console.error('[ProductCard] addToCart error:', err);
      alert(err instanceof Error ? err.message : '장바구니 추가에 실패했습니다.');
    } finally {
      setAdding(false);
    }
  };

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); // ← Link 이동 방지
    toggle().catch(console.error);
  };

  return (
    <Link
      to={`/bazaar/${product.id}`}
      className="pcard"
      style={{
        opacity: soldOut ? 0.6 : 1, // ← 품절 시각 약화(필수 동작 보존, 동적값이라 인라인 유지)
      }}
    >
      {/* ── 이미지(정사각 full-bleed, 컨테이너 쿼리 기준) ── */}
      <div className="pcard-img">
        {product.thumbnail_url && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <BlurImage url={product.thumbnail_url} width={680} />
          </div>
        )}

        {/* 판매 완료(품절) 오버레이 — 액션바 대신 노출 */}
        {soldOut && (
          <div
            style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: 0.5,
            }}
          >
            판매 완료
          </div>
        )}

        {/* ← [2026-06-25] 입금 대기 중 오버레이 — 앰버 + 실시간 카운트다운(MM:SS) */}
        {paymentPending && (
          <div
            style={{
              position: 'absolute', inset: 0, background: 'rgba(180,83,9,0.62)',
              display: 'flex', flexDirection: 'column', gap: 4,
              alignItems: 'center', justifyContent: 'center', color: '#fff',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: 0.3 }}>입금 대기 중</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>
              {formatShortCountdown(countdownMs)}
            </span>
            <span style={{ fontSize: 11, opacity: 0.85 }}>미입금 시 다시 판매됩니다</span>
          </div>
        )}

        {/* 호버 액션바 [Add To Cart | 찜/이미 찜 함] — 판매중일 때만 노출(품절/입금대기 미노출) */}
        {!blocked && (
          <div className="pcard-actions">
            <button
              type="button"
              className="pcard-btn"
              onClick={handleAddToCart}
              disabled={adding || !canQuickAdd}
              title={!canQuickAdd ? (quickAddBlockReason ?? undefined) : undefined}
              style={{
                background: !canQuickAdd ? '#9ca3af' : '#000', // ← [2026-06-25] 선판매 불가 시 회색 비활성
                color: '#fff', textTransform: 'capitalize',
              }}
            >
              {justAdded ? '담음!' : 'add to cart'}
            </button>
            <button
              type="button"
              className="pcard-btn"
              onClick={handleToggleWishlist}
              style={{
                background: wishlisted ? '#beff9b' : '#fff', color: '#111',
              }}
            >
              {wishlisted ? '이미 찜 함' : '찜'}
            </button>
          </div>
        )}
      </div>

      {/* ── 본문(좌 패딩 0 = Figma) ── */}
      <div
        style={{
          background: '#fff',
          padding: '16px 20px 20px 0', // ← Figma pt16 pr20 pb20 pl0
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* 뱃지 행: [찜(상시, 찜한 경우)] [새 제품(is_new)] */}
          {(wishlisted || isNewProduct(product)) && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
              {wishlisted && (
                <span style={{
                  background: '#beff9b', color: '#111', fontSize: 14, lineHeight: 1.3,
                  padding: '4px 8px', whiteSpace: 'nowrap',
                }}>
                  찜
                </span>
              )}
              {isNewProduct(product) && (
                <span style={{
                  background: '#fff', color: '#000', border: '1px solid #000',
                  fontSize: 14, lineHeight: 1.3, padding: '4px 8px', whiteSpace: 'nowrap',
                  textTransform: 'capitalize',
                }}>
                  새 제품
                </span>
              )}
            </div>
          )}

          {/* 제목 + 가격 (Pretendard Regular 20px) */}
          <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
            <p
              style={{
                margin: 0, fontSize: 20, lineHeight: 1.4, color: '#111',
                letterSpacing: '-0.2px',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {product.name}
            </p>
            {/* ← [2026-06-25] 가격: 세일이면 원가(취소선)+할인%+판매가, 아니면 정상가 */}
            <div style={{ marginTop: 2 }}>
              <PriceTag product={product} size="card" />
            </div>
          </div>
        </div>

        {/* 저재고 안내(품절 임박) — Figma 미표기지만 필수 정보로 최소 노출 */}
        {!blocked && available <= 5 && available > 0 && (
          <span style={{ marginTop: 4, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
            {available}개 남음
          </span>
        )}
      </div>
    </Link>
  );
}
