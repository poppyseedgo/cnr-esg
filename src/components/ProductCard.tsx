// ============================================================================
// ProductCard — 바자회 상품 카드 (BazaarPage 등에서 공통 사용)
//
// [변경 이력]
//   2026-06-24  [Task 2] Figma 리스트 카드 3-상태 1:1 재구현.
//               · 기본(1791:216) / 호버·찜안함(1791:194) / 호버·찜함(1791:411)
//               · full-bleed 정사각 이미지(aspect 1/1, bg #d7d7d7) + 모서리/보더/그림자 제거
//               · 호버 시 이미지 하단 액션바 [Add To Cart | 찜/이미 찜 함] 슬라이드 등장
//               · 찜 상태 → 본문에 초록 "찜" 뱃지 상시 노출(#beff9b) + 액션바 버튼 전환
//               · 본문 패딩 16/20/20/0(좌 0=Figma), 뱃지/제목/가격 14·20px Pretendard Regular
//               · add-to-cart=기존 cart API(qty 1), 찜=신규 useWishlist 훅
//               · 품절/저재고 등 필수 안전 동작 보존(품절 시 액션바 미노출)
//   2026-06-23  카테고리/브랜드 태그 칩(splitTagsByKind) — Task2 카드에서 제거됨(필터는 사이드바로 이관)
//
// [Figma SSOT] node 1791:216 / 1791:194 / 1791:411 (file ydfT0xP6nc83VxFd7GyEx4)
// ============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getAvailableStock, isSoldOut, isNewProduct } from '@/lib/products';
import { BlurImage } from './BlurImage'; // ← 썸네일 lazy+블러업
import { addToCart } from '@/lib/cart'; // ← [2026-06-24] 카드 빠른 담기
import { signInWithMicrosoft } from '@/lib/auth'; // ← [2026-06-24] 비로그인 가드
import { useCurrentUser } from '@/hooks/useCurrentUser'; // ← [2026-06-24]
import { useWishlist } from '@/hooks/useWishlist'; // ← [2026-06-24] 찜 토글
import type { EsgProductRow } from '@/types/esg';

// ── 호버 액션바 등장 스타일(1회 주입). 터치(hover:none) 기기는 상시 노출 ──────────
const STYLE_ID = 'pcard-styles-v2';
function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
    .pcard-actions { opacity: 0; transform: translateY(8px); transition: opacity .15s ease, transform .15s ease; pointer-events: none; }
    .pcard:hover .pcard-actions { opacity: 1; transform: translateY(0); pointer-events: auto; }
    @media (hover: none) { .pcard-actions { opacity: 1; transform: none; pointer-events: auto; } }
  `;
  document.head.appendChild(el);
}

interface ProductCardProps {
  product: EsgProductRow;
}

export function ProductCard({ product }: ProductCardProps) {
  ensureStyles();
  const { currentUser } = useCurrentUser();
  const { wishlisted, toggle } = useWishlist(product.id); // ← [2026-06-24]

  const available = getAvailableStock(product);
  const soldOut = isSoldOut(product);

  const [adding, setAdding] = useState(false); // ← [2026-06-24] 담기 진행/완료 transient
  const [justAdded, setJustAdded] = useState(false);

  // 빠른 담기 — 카드는 Link이므로 버튼 클릭 시 네비게이션 차단
  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); // ← Link 이동 방지
    if (!currentUser) { signInWithMicrosoft().catch(console.error); return; }
    if (soldOut || adding) return;
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
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        textDecoration: 'none',
        color: 'inherit',
        position: 'relative',
        opacity: soldOut ? 0.6 : 1, // ← 품절 시각 약화(필수 동작 보존)
      }}
    >
      {/* ── 이미지(정사각 full-bleed) ── */}
      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          background: '#d7d7d7', // ← Figma image 2356 placeholder
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {product.thumbnail_url && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <BlurImage url={product.thumbnail_url} width={680} />
          </div>
        )}

        {/* 품절 오버레이 — 품절 시 액션바 대신 노출 */}
        {soldOut && (
          <div
            style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: 0.5,
            }}
          >
            품절
          </div>
        )}

        {/* 호버 액션바 [Add To Cart | 찜/이미 찜 함] — 8px 인셋, 하단 정렬 (품절 시 미노출) */}
        {!soldOut && (
          <div
            className="pcard-actions"
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              padding: 8, display: 'flex', alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={adding}
              style={{
                flex: 1, minWidth: 0, padding: '16px 32px', border: 'none',
                background: '#000', color: '#fff', fontSize: 16, lineHeight: 1.4,
                fontFamily: 'inherit', cursor: adding ? 'default' : 'pointer',
                textTransform: 'capitalize', whiteSpace: 'nowrap',
              }}
            >
              {justAdded ? '담음!' : 'add to cart'}
            </button>
            <button
              type="button"
              onClick={handleToggleWishlist}
              style={{
                flex: 1, minWidth: 0, padding: '16px 32px', border: 'none',
                background: wishlisted ? '#beff9b' : '#fff',
                color: '#111', fontSize: 16, lineHeight: 1.4,
                fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
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
            <p style={{ margin: 0, fontSize: 20, lineHeight: 1.4, color: '#111', letterSpacing: '0.2px' }}>
              {product.price.toLocaleString()}원
            </p>
          </div>
        </div>

        {/* 저재고 안내(품절 임박) — Figma 미표기지만 필수 정보로 최소 노출 */}
        {!soldOut && available <= 5 && available > 0 && (
          <span style={{ marginTop: 4, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
            {available}개 남음
          </span>
        )}
      </div>
    </Link>
  );
}
