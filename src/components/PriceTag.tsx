// ============================================================================
// PriceTag — 원가/판매가/할인율 표시 공용 컴포넌트
//
// [변경 이력]
//   2026-06-25  신규. 카드/상세의 가격 출력을 일원화.
//               세일 판정·할인율은 lib/products 의 세일 헬퍼(SSOT)를 그대로 사용.
//
// [설계]
//   · 세일 중(sale_price != null && sale_price < price)이면:
//       원가(취소선, 흐림) + [할인%] 판매가(강조)  ← 한국 커머스 관용 레이아웃
//   · 세일 아니면: 정상가만 (기존 외형 유지 — size별 폰트/두께/색).
//   · 판정/표시 규칙은 서버 create_bazaar_order 와 1:1 (lib/products 주석 참조).
// ============================================================================

import { getEffectiveSalePrice, getDiscountPercent } from '@/lib/products';
import type { EsgProductRow } from '@/types/esg';

export type PriceTagSize = 'card' | 'detail';

// size별 외형(정상가 케이스는 기존 카드/상세 스타일과 동일하게 유지)
const SZ: Record<PriceTagSize, { price: number; weight: number; color: string; orig: number; pct: number }> = {
  card:   { price: 20, weight: 400, color: '#111', orig: 13, pct: 14 }, // 카드: 기존 20px #111 regular
  detail: { price: 28, weight: 700, color: '#222', orig: 16, pct: 18 }, // 상세: 기존 28px #222 bold
};

interface PriceTagProps {
  product: Pick<EsgProductRow, 'price' | 'sale_price'>;
  size?: PriceTagSize;
}

export function PriceTag({ product, size = 'card' }: PriceTagProps) {
  const sale = getEffectiveSalePrice(product); // 세일 아니면 null
  const pct = getDiscountPercent(product);      // 세일 아니면 null
  const s = SZ[size];

  // ── 세일 아님 — 정상가만 (기존 외형 그대로) ──
  if (sale === null) {
    return (
      <span style={{ fontSize: s.price, fontWeight: s.weight, lineHeight: 1.4, color: s.color, letterSpacing: '0.2px' }}>
        {product.price.toLocaleString()}원
      </span>
    );
  }

  // ── 세일 중 — 원가(취소선) + [할인%] 판매가 ──
  const saleWeight = size === 'detail' ? 700 : 600;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      {/* 원가(취소선, 흐림) */}
      <span style={{ fontSize: s.orig, lineHeight: 1.3, color: '#9ca3af', textDecoration: 'line-through' }}>
        {product.price.toLocaleString()}원
      </span>
      {/* [할인%] 판매가 */}
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        {pct != null && (
          <span style={{ fontSize: s.pct, fontWeight: 700, color: '#ef4444', letterSpacing: '-0.2px' }}>
            {pct}%
          </span>
        )}
        <span style={{ fontSize: s.price, fontWeight: saleWeight, lineHeight: 1.4, color: s.color, letterSpacing: '0.2px' }}>
          {sale.toLocaleString()}원
        </span>
      </span>
    </span>
  );
}
