// ============================================================================
// AdminProducts — 바자회 상품 어드민 페이지
//
// 편집 폼은 ProductEditForm 공통 컴포넌트 사용 (상세 페이지와 코드 공유).
//
// 변경 이력:
//   2026-06-17  [정책㉠] 카드에 숨김/숨김해제 1-click CTA 추가 (수정 폼 진입 불필요).
//               완료 주문/Q&A 상품은 하드삭제 대신 숨김으로 유도.
//   2026-06-17  [고정/정렬] 전체 리스트 드래그 재정렬(sort_order 일괄) + 📌 고정 배지.
//   2026-06-23  [UX] 수정→저장 시 해당 카드를 화면 중앙으로 스크롤.
//               기존엔 폼 접힘으로 문서 높이가 줄며 스크롤이 상단으로 클램프됐음.
//               카드 ref + 저장 후 scrollIntoView(block:'center')로 최종 위치 보정.
//   2026-06-25  [찜 명단] 카드에 "❤️ 찜 N" 배지 버튼 추가 → 클릭 시 찜한 사람 모달.
//               찜 수는 esg_product_wishlist_counts() 1회 집계(N+1 방지),
//               명단은 esg_product_wishlist_users() (둘 다 어드민 가드 RPC).
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadAllProducts, hideProduct, unhideProduct, reorderProducts } from '@/lib/adminProducts'; // ← [고정/정렬] reorderProducts
import { loadWishlistCounts } from '@/lib/adminWishlist'; // ← [2026-06-25] 상품별 찜 수 일괄 집계
import { subscribeProducts, getAvailableStock } from '@/lib/products';
import { SearchBar } from '@/components/SearchBar'; // ← [2026-06-17] 상품 이름 검색
import { matchesQuery } from '@/utils/search';
import { ProductEditForm } from '@/components/admin/ProductEditForm';
import { CreateProductForm } from '@/components/admin/CreateProductForm';
import { WishlistUsersModal } from '@/components/admin/WishlistUsersModal'; // ← [2026-06-25] 찜한 사람 명단 모달
import { AdminFundingParticipants } from '@/components/admin/AdminFundingParticipants'; // ← [2026-07-08] 펀딩 참여자 관리(모달)
import type { EsgProductRow, EsgProductStatus } from '@/types/esg';

const STATUS_LABELS: Record<EsgProductStatus, string> = {
  on_sale: '판매 중',
  sold_out: '품절',
  hidden: '숨김',
};

const STATUS_COLORS: Record<EsgProductStatus, { bg: string; color: string }> = {
  on_sale: { bg: '#dcfce7', color: '#166534' },
  sold_out: { bg: '#fef3c7', color: '#92400e' },
  hidden: { bg: '#f0f0f0', color: '#666' },
};

// ← [2026-07-07] section prop 으로 바자회/굿즈 공용화. 미지정=바자회(기존과 100% 동일).
export function AdminProducts({ section = 'bazaar' }: { section?: import('@/types/esg').EsgProductSection } = {}) {
  const isGoods = section === 'goods';
  const sectionLabel = isGoods ? '굿즈' : '바자회'; // 헤더/버튼 문구용
  const [products, setProducts] = useState<EsgProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(''); // ← [2026-06-17] 상품 이름 검색어
  const [creating, setCreating] = useState(false);

  const [wishlistCounts, setWishlistCounts] = useState<Map<string, number>>(new Map()); // ← [2026-06-25] product_id→찜 수(전체 1회 집계)
  const [wishlistTarget, setWishlistTarget] = useState<EsgProductRow | null>(null);      // ← [2026-06-25] 찜 명단 모달 대상(null=닫힘)
  const [editTarget, setEditTarget] = useState<EsgProductRow | null>(null);              // ← [2026-07-01] 수정 모달 대상(null=닫힘). 그리드 전환으로 인라인 폼→모달.
  const [participantsTarget, setParticipantsTarget] = useState<EsgProductRow | null>(null); // ← [2026-07-08] 펀딩 참여자 모달 대상

  // ← [고정/정렬] 드래그 재정렬 상태
  const dragIndexRef = useRef<number | null>(null);          // 드래그 시작 인덱스 (리렌더 불필요 → ref)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null); // 드롭 위치 표시선
  const [reordering, setReordering] = useState(false);       // 재정렬 저장 중

  const pinnedCount = products.filter((p) => p.is_pinned).length; // ← [고정] N/8 표시용
  // ← [2026-06-17] 검색: 이름 매칭. 검색 중에는 드래그 정렬 비활성화(부분목록 인덱스 손상 방지)
  const searching = query.trim().length > 0;
  const visibleProducts = searching ? products.filter((p) => matchesQuery(query, p.name)) : products;

  const reload = async () => {
    try {
      setError(null);
      setProducts(await loadAllProducts(section)); // ← [2026-07-07] 섹션별 목록(굿즈/바자회 분리)
    } catch (e) {
      console.error('[AdminProducts]', e);
      setError(e instanceof Error ? e.message : '상품을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // ← [고정/정렬] 드롭 → 로컬 낙관적 재배열 후 sort_order 일괄 저장
  const handleDrop = async (targetIndex: number) => {
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    if (from === null || from === targetIndex) return;

    const next = [...products];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    setProducts(next);                                       // 낙관적 갱신 (깜빡임 방지)

    setReordering(true);
    try {
      await reorderProducts(next.map((p) => p.id), section);  // ← [2026-07-07] 섹션 격리 재정렬(굿즈↔바자회 무간섭)
    } catch (e) {
      alert(e instanceof Error ? e.message : '순서 저장 실패');
      void reload();                                         // 실패 시 서버 상태로 복구
    } finally {
      setReordering(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
  }, []);

  // ← [2026-06-25] 찜 수 1회 집계(어드민 RPC). 실패해도 배지만 미표시 → 페이지 동작엔 영향 없음.
  useEffect(() => {
    loadWishlistCounts()
      .then(setWishlistCounts)
      .catch((e) => console.error('[AdminProducts] wishlist counts:', e));
  }, []);

  useEffect(() => {
    const cleanup = subscribeProducts(() => {
      void reload();
    });
    return cleanup;
  }, []);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>;
  if (error) return <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>⚠️ {error}</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{isGoods ? '🎁' : '🛍'} {sectionLabel} 상품 관리</h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          style={{
            padding: '8px 14px',
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ➕ 새 상품 등록
        </button>
      </div>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        이미지, 가격, 재고를 관리할 수 있습니다. 카드 좌상단 <strong>⠿ 핸들을 드래그</strong>해 다른 카드 위에 놓으면
        순서(정렬 순서)가 저장됩니다. 고정(📌) 상품은 공개 페이지에서 맨 앞에 노출됩니다.
        {reordering && <span style={{ color: '#16a34a', marginLeft: 8 }}>· 순서 저장 중…</span>}
      </p>

      {creating && (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            border: '2px solid #111',
          }}
        >
          <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#111' }}>➕ 새 상품 등록</h3>
          <CreateProductForm
            section={section} // ← [2026-07-07] 신규 상품을 이 섹션(굿즈/바자회)으로 등록
            onCancel={() => setCreating(false)}
            onSuccess={() => {
              setCreating(false);
              void reload();
            }}
          />
        </div>
      )}

      {products.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <SearchBar value={query} onChange={setQuery} placeholder="상품 이름 검색" width={320} />
          {searching && (
            <span style={{ fontSize: 12, color: '#888' }}>
              {visibleProducts.length}건 · 검색 중에는 순서 변경이 비활성화됩니다
            </span>
          )}
        </div>
      )}

      {products.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🛍</div>
          <p style={{ margin: '0 0 8px', color: '#888' }}>등록된 상품이 없습니다.</p>
          <p style={{ margin: 0, fontSize: 12, color: '#bbb' }}>
            우측 상단 "➕ 새 상품 등록" 버튼으로 추가하세요.
          </p>
        </div>
      ) : visibleProducts.length === 0 ? (
        <div style={emptyStyle}>
          <p style={{ margin: 0, color: '#888' }}>검색 결과가 없습니다.</p>
        </div>
      ) : (
        // ← [2026-07-01] 4열 카드 그리드 (어드민 폭 ~1024 기준 4열, 좁아지면 자동 감소)
        //   드래그: 카드 좌상단 ⠿ 그립이 draggable(드래그 시작), 카드 전체가 드롭 타깃(2D 이동)
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
            gap: 12,
            alignItems: 'stretch',
          }}
        >
          {visibleProducts.map((p, i) => (
            <div
              key={p.id}
              onDragOver={(e) => {
                if (searching) return;
                e.preventDefault();
                if (dragOverIndex !== i) setDragOverIndex(i);
              }}
              onDrop={() => {
                if (!searching) handleDrop(i);
              }}
              style={{
                position: 'relative',
                borderRadius: 12,
                outline: dragOverIndex === i ? '2px solid #16a34a' : '2px solid transparent', // ← 드롭 위치 강조(그리드 링)
                outlineOffset: 2,
                transition: 'outline-color 0.1s',
              }}
            >
              {/* ⠿ 그립: 드래그 시작점(검색 중 비활성). 카드 위에 떠 있는 핸들 */}
              <div
                draggable={!searching}
                onDragStart={() => {
                  dragIndexRef.current = i;
                }}
                onDragEnd={() => {
                  dragIndexRef.current = null;
                  setDragOverIndex(null);
                }}
                title={searching ? '검색 중에는 순서를 변경할 수 없습니다' : '드래그하여 순서 변경'}
                style={{
                  position: 'absolute',
                  top: 6,
                  left: 6,
                  zIndex: 2,
                  width: 26,
                  height: 26,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255,255,255,0.92)',
                  border: '1px solid #e5e5e5',
                  borderRadius: 6,
                  color: '#9a9a9a',
                  fontSize: 16,
                  lineHeight: 1,
                  userSelect: 'none',
                  cursor: searching ? 'default' : 'grab',
                  opacity: searching ? 0.3 : 1,
                }}
              >
                ⠿
              </div>
              <ProductAdminCard
                product={p}
                onChange={reload}
                wishlistCount={wishlistCounts.get(p.id) ?? 0}   // ← [2026-06-25] 집계 Map에서 O(1) 조회
                onShowWishlist={() => setWishlistTarget(p)}      // ← [2026-06-25] 명단 모달 열기
                onEdit={() => setEditTarget(p)}                  // ← [2026-07-01] 수정 모달 열기
                onManageParticipants={() => setParticipantsTarget(p)} // ← [2026-07-08] 펀딩 참여자 모달
              />
            </div>
          ))}
        </div>
      )}

      {/* ← [2026-07-01] 상품 수정 모달 (페이지 단일 인스턴스 — 인라인 폼을 모달로 전환) */}
      {editTarget && (
        <ProductEditModal
          product={editTarget}
          pinnedCount={pinnedCount}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void reload();
          }}
          onDeleted={() => {
            setEditTarget(null);
            void reload();
          }}
        />
      )}

      {/* ← [2026-06-25] 찜한 사람 명단 모달 (페이지 단일 인스턴스 — 카드 N개와 무관) */}
      {wishlistTarget && (
        <WishlistUsersModal
          productId={wishlistTarget.id}
          productName={wishlistTarget.name}
          onClose={() => setWishlistTarget(null)}
        />
      )}

      {/* ← [2026-07-08] 펀딩 참여자 관리 모달 (페이지 단일 인스턴스) */}
      {participantsTarget && (
        <div
          role="dialog" aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setParticipantsTarget(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 760, maxHeight: '85vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>{participantsTarget.name}</h2>
              <button type="button" onClick={() => setParticipantsTarget(null)} style={{ border: 'none', background: '#f3f4f6', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <AdminFundingParticipants productId={participantsTarget.id} onChanged={reload} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 개별 상품 카드 (세로형, 그리드용). 수정은 페이지 단일 모달(ProductEditModal)로.
// ============================================================================

function ProductAdminCard({
  product,
  onChange,
  wishlistCount = 0,    // ← [2026-06-25] 이 상품 찜 수(배지 표시·0이면 회색)
  onShowWishlist,       // ← [2026-06-25] 명단 모달 열기 콜백
  onEdit,               // ← [2026-07-01] 수정 모달 열기 콜백
  onManageParticipants, // ← [2026-07-08] 펀딩 참여자 관리 모달 열기(펀딩 상품만)
}: {
  product: EsgProductRow;
  onChange: () => void;
  wishlistCount?: number; // ← [2026-06-25]
  onShowWishlist?: () => void; // ← [2026-06-25]
  onEdit?: () => void;    // ← [2026-07-01]
  onManageParticipants?: () => void; // ← [2026-07-08]
}) {
  const [busy, setBusy] = useState(false);                    // ← [정책㉠] 숨김/해제 처리 중 잠금
  const statusColor = STATUS_COLORS[product.status];
  const available = getAvailableStock(product);

  // ← [정책㉠] 숨김 처리 (소프트삭제) — 1-click
  const handleHide = async () => {
    if (!confirm(`"${product.name}"을(를) 숨김 처리할까요?\n사용자 화면에서 보이지 않지만 주문·Q&A 이력은 보존됩니다.`)) return;
    setBusy(true);
    try {
      await hideProduct(product.id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '숨김 처리 실패');
    } finally {
      setBusy(false);
    }
  };

  // ← [정책㉠] 숨김 해제 — 가용재고에 따라 on_sale/sold_out 복귀
  const handleUnhide = async () => {
    setBusy(true);
    try {
      await unhideProduct(product.id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '숨김 해제 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #eee',
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        overflow: 'hidden',
        opacity: product.status === 'hidden' ? 0.6 : 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 썸네일 (클릭=사용자 화면 새 탭). draggable=false: 그립 드래그와 충돌 방지 */}
      <Link
        to={`/bazaar/${product.id}`}
        target="_blank"
        rel="noopener noreferrer"
        draggable={false}
        aria-label="사용자 화면으로 보기"
        style={{
          position: 'relative',
          display: 'block',
          aspectRatio: '1 / 1',
          background: product.thumbnail_url ? `url(${product.thumbnail_url}) center / cover` : '#f5f5f5',
        }}
      >
        {/* 고정 배지 (썸네일 우상단) */}
        {product.is_pinned && (
          <span style={{ position: 'absolute', top: 6, right: 6, padding: '2px 8px', background: '#fef9c3', color: '#854d0e', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
            📌 고정
          </span>
        )}
      </Link>

      {/* 본문 */}
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        {/* 상태 + (새 상품) + 찜 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ padding: '2px 8px', background: statusColor.bg, color: statusColor.color, borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
            {STATUS_LABELS[product.status]}
          </span>
          {product.is_new && (
            <span style={{ padding: '2px 8px', background: '#e0f2fe', color: '#075985', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
              🆕 새 상품
            </span>
          )}
          {/* 찜 명단 열기 (0명도 클릭 가능) */}
          <button
            type="button"
            onClick={onShowWishlist}
            title="이 상품을 찜한 사람 보기"
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '2px 8px',
              background: wishlistCount > 0 ? '#fff1f2' : '#f5f5f5',
              border: `1px solid ${wishlistCount > 0 ? '#fecdd3' : '#e5e5e5'}`,
              color: wishlistCount > 0 ? '#e11d48' : '#999',
              borderRadius: 999,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {wishlistCount > 0 ? '❤️' : '🤍'} {wishlistCount}
          </button>
        </div>

        {/* 상품명 (2줄 클램프) */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.35,
            color: '#222',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: 36,
          }}
          title={product.name}
        >
          {product.name}
        </div>

        {/* 가격 / 재고 */}
        <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: '#111' }}>
          {product.price.toLocaleString()}원
        </div>
        <div style={{ marginTop: 2, fontSize: 11, color: '#888' }}>
          재고 <strong style={{ color: '#555' }}>{available}</strong>
          <span style={{ color: '#bbb' }}> / {product.stock} · 선점 {product.reserved_stock}</span>
        </div>

        {/* 액션 (수정 모달 / 숨김·숨김해제) */}
        <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 10 }}>
          <button
            type="button"
            onClick={onEdit}
            style={{
              flex: 1,
              padding: '6px 0',
              background: '#fff',
              border: '1px solid #111',
              color: '#111',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            ✏️ 수정
          </button>
          {product.status === 'hidden' ? (
            <button
              type="button"
              onClick={handleUnhide}
              disabled={busy}
              style={{
                flex: 1,
                padding: '6px 0',
                background: '#fff',
                border: '1px solid #16a34a',
                color: '#16a34a',
                borderRadius: 6,
                cursor: busy ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              ↩️ 숨김해제
            </button>
          ) : (
            <button
              type="button"
              onClick={handleHide}
              disabled={busy}
              style={{
                flex: 1,
                padding: '6px 0',
                background: '#fff',
                border: '1px solid #999',
                color: '#555',
                borderRadius: 6,
                cursor: busy ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              🙈 숨김
            </button>
          )}
        </div>
        {/* ← [2026-07-08] 펀딩 상품: 참여자 관리 버튼(모달) */}
        {product.purchase_type === 'funding' && onManageParticipants && (
          <button
            type="button"
            onClick={onManageParticipants}
            style={{
              marginTop: 6, width: '100%', padding: '6px 0', background: '#f5f3ff',
              border: '1px solid #ddd6fe', color: '#6d28d9', borderRadius: 6,
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            🎯 참여자 관리
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 상품 수정 모달 — 인라인 폼을 그리드 전환에 맞춰 모달로 (ProductEditForm 재사용)
// ============================================================================

function ProductEditModal({
  product,
  pinnedCount,
  onClose,
  onSaved,
  onDeleted,
}: {
  product: EsgProductRow;
  pinnedCount?: number;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          width: '100%',
          maxWidth: 720,
          margin: 'auto',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <h3 style={{ margin: 0, fontSize: 16, color: '#111' }}>✏️ 상품 수정</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, color: '#999', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 20 }}>
          <ProductEditForm
            product={product}
            pinnedCount={pinnedCount}
            onSuccess={onSaved}
            onCancel={onClose}
            onDeleted={onDeleted}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 공통 UI
// ============================================================================

const emptyStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 48,
  textAlign: 'center',
  border: '1px dashed #ddd',
};
