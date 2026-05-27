// ============================================================================
// ProductCard — 바자회 상품 카드 (BazaarPage 등에서 공통 사용)
//
// 디자인은 Phase 6에서 피그마 기반 교체.
// ============================================================================

import { Link } from 'react-router-dom';
import { getAvailableStock, isSoldOut } from '@/lib/products';
import type { EsgProductRow } from '@/types/esg';

interface ProductCardProps {
  product: EsgProductRow;
}

export function ProductCard({ product }: ProductCardProps) {
  const available = getAvailableStock(product);
  const soldOut = isSoldOut(product);

  return (
    <Link
      to={`/bazaar/${product.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid #eee',
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        textDecoration: 'none',
        color: 'inherit',
        opacity: soldOut ? 0.6 : 1,
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
    >
      {/* 썸네일 */}
      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          background: product.thumbnail_url
            ? `url(${product.thumbnail_url}) center / cover`
            : 'linear-gradient(135deg, #e0f2fe, #ddd6fe)',
          position: 'relative',
        }}
      >
        {soldOut && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            품절
          </div>
        )}
        {!soldOut && available <= 5 && available > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              padding: '3px 8px',
              background: '#ef4444',
              color: '#fff',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {available}개 남음
          </div>
        )}
      </div>

      {/* 본문 */}
      <div
        style={{
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flex: 1,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: 'calc(1.4em * 2)',
          }}
        >
          {product.name}
        </h3>
        <div style={{ marginTop: 'auto' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#222' }}>
            {product.price.toLocaleString()}원
          </div>
        </div>
      </div>
    </Link>
  );
}
