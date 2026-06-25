// ============================================================================
// WishlistUsersModal.tsx — 특정 상품을 "찜한 사람" 명단 모달 (어드민 전용)
//
// [변경 이력]
//   2026-06-25  최초 작성. AdminProducts 카드의 "❤️ 찜 N" 클릭 시 표시.
//
// [설계]
//   - 열릴 때 esg_product_wishlist_users(productId) RPC 1회 호출(어드민 가드는 서버).
//   - 공통 ModalShell(size=medium) + 공통 Avatar 재사용으로 디자인/동작 일관.
//   - 로딩/에러/빈 상태를 명시적으로 분기(오류 없는 조회 UX).
//   - 명단은 최신 찜 순(서버 ORDER BY created_at DESC). 시각은 formatKSTFull 로 KST 표기.
// ============================================================================

import { useEffect, useState } from 'react';
import { ModalShell } from '@/components/modal/ModalShell';
import { Avatar } from '@/components/Avatar';
import { loadProductWishlistUsers } from '@/lib/adminWishlist';
import { formatKSTFull } from '@/utils/time';
import type { EsgWishlistUser } from '@/types/esg';

interface Props {
  productId: string;     // 대상 상품 id
  productName: string;   // 헤더 표기용 상품명
  onClose: () => void;   // 모달 닫기
}

export function WishlistUsersModal({ productId, productName, onClose }: Props) {
  const [users, setUsers] = useState<EsgWishlistUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 열릴 때(상품 변경 시) 명단 1회 로드
  useEffect(() => {
    let alive = true; // 언마운트/상품 변경 후 setState 방지
    setLoading(true);
    setError(null);
    loadProductWishlistUsers(productId)
      .then((rows) => {
        if (alive) setUsers(rows);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : '찜 명단을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [productId]);

  return (
    <ModalShell
      size="medium"
      ariaLabel="찜한 사람 명단"
      onClose={onClose}
      closeOnBackdrop // 단순 조회 모달 → 배경 클릭으로 닫기 허용
      header={
        <div className="esg-modal__title-group">
          <h2 className="esg-modal__title">❤️ 찜한 사람</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>{productName}</p>
        </div>
      }
      footer={[{ label: '닫기', variant: 'close', onClick: onClose }]}
    >
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#999' }}>불러오는 중…</div>
      ) : error ? (
        <div
          style={{
            padding: 16,
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          ⚠️ {error}
        </div>
      ) : users.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#999' }}>
          <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.4 }}>🤍</div>
          아직 이 상품을 찜한 사람이 없습니다.
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>
            총 <strong style={{ color: '#111' }}>{users.length}</strong>명이 찜했습니다.
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map((u) => (
              <li
                key={u.user_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  background: '#fafafa',
                  borderRadius: 8,
                  border: '1px solid #eee',
                }}
              >
                <Avatar name={u.name ?? '이름없음'} avatarUrl={u.avatar_url} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>
                    {u.name ?? '이름없음'}
                    {u.dept && (
                      <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: '#888' }}>
                        {u.dept}
                      </span>
                    )}
                  </div>
                  {u.email && (
                    <div
                      style={{
                        fontSize: 12,
                        color: '#aaa',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {u.email}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#bbb', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {formatKSTFull(u.created_at)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ModalShell>
  );
}
