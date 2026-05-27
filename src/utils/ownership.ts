// ============================================================================
// 소유권 식별 헬퍼
//
// 절대 원칙 (C&R Space에서 검증된 패턴):
//   - 고유 식별은 언제나 UUID OR email 이중 복원
//   - 이름(name) 비교 절대 금지 — 이름 snapshot은 동기화 후 깨질 수 있음
//   - bookings.user_email 같은 컬럼은 NOT NULL (Azure AD 로그인 ID=email, 불변)
//
// 사용 예:
//   const myPosts = posts.filter(p => isMyPost(p, currentUser));
//   const canCancel = isMyOrder(order, currentUser) || currentUser.role === 'ADMIN';
// ============================================================================

import type {
  EsgPostRow,
  EsgPostPublicRow,
  EsgCommentRow,
  EsgOrderRow,
  EsgAuctionRow,
  EsgAuctionBidRow,
  CurrentUser,
} from '@/types/esg';

// ============================================================================
// 기본 비교 헬퍼 (private)
// ============================================================================

/**
 * 두 사용자가 동일인인지. UUID 우선, 없으면 email로 fallback.
 * 둘 다 null이면 false.
 */
function isSameUser(
  a: { user_id?: string | null; user_email?: string | null } | null | undefined,
  b: { id?: string | null; email?: string | null } | null | undefined
): boolean {
  if (!a || !b) return false;
  if (a.user_id && b.id && a.user_id === b.id) return true;
  if (a.user_email && b.email && a.user_email === b.email) return true;
  return false;
}

// ============================================================================
// 게시글 / 댓글
// ============================================================================

/** 게시글이 본인 것인지 (raw 테이블 기준 — 익명이어도 user_id 있음) */
export function isMyPost(
  post: Pick<EsgPostRow, 'user_id' | 'user_email'> | null | undefined,
  user: CurrentUser | null | undefined
): boolean {
  return isSameUser(post, user ?? null);
}

/**
 * Public view 기준으로 본인 게시글 식별 (익명이면 user_id/email NULL이라 식별 불가)
 * → 익명 게시글은 본인 글이라도 마이페이지에서 식별 못함을 의미.
 * → 마이페이지는 RLS로 raw 테이블 접근하여 isMyPost() 사용 권장.
 */
export function isMyPostPublic(
  post: Pick<EsgPostPublicRow, 'user_id' | 'user_email' | 'is_anonymous'> | null | undefined,
  user: CurrentUser | null | undefined
): boolean {
  if (!post || !user) return false;
  if (post.is_anonymous) return false; // public view에서는 user_id/email이 NULL
  return isSameUser(post, user);
}

/** 댓글이 본인 것인지 */
export function isMyComment(
  comment: Pick<EsgCommentRow, 'user_id' | 'user_email'> | null | undefined,
  user: CurrentUser | null | undefined
): boolean {
  return isSameUser(comment, user ?? null);
}

// ============================================================================
// 주문 / 결제
// ============================================================================

/** 주문이 본인 것인지 */
export function isMyOrder(
  order: Pick<EsgOrderRow, 'user_id' | 'user_email'> | null | undefined,
  user: CurrentUser | null | undefined
): boolean {
  return isSameUser(order, user ?? null);
}

// ============================================================================
// 경매
// ============================================================================

/** 경매의 현재 최고 입찰자가 본인인지 */
export function isMyHighestBid(
  auction: Pick<EsgAuctionRow, 'current_bidder_id' | 'current_bidder_email'> | null | undefined,
  user: CurrentUser | null | undefined
): boolean {
  if (!auction || !user) return false;
  if (auction.current_bidder_id && auction.current_bidder_id === user.id) return true;
  if (auction.current_bidder_email && auction.current_bidder_email === user.email) return true;
  return false;
}

/** 경매 낙찰자가 본인인지 */
export function isAuctionWinner(
  auction: Pick<EsgAuctionRow, 'winner_id' | 'winner_email' | 'status'> | null | undefined,
  user: CurrentUser | null | undefined
): boolean {
  if (!auction || !user) return false;
  if (auction.status !== 'ended') return false;
  if (auction.winner_id && auction.winner_id === user.id) return true;
  if (auction.winner_email && auction.winner_email === user.email) return true;
  return false;
}

/** 입찰 이력이 본인 것인지 */
export function isMyBid(
  bid: Pick<EsgAuctionBidRow, 'user_id' | 'user_email'> | null | undefined,
  user: CurrentUser | null | undefined
): boolean {
  return isSameUser(bid, user ?? null);
}

// ============================================================================
// 권한 판정 (소유 + 역할 통합)
// ============================================================================

/** 게시글 편집/삭제 권한 (본인 또는 관리자) */
export function canEditPost(
  post: Pick<EsgPostRow, 'user_id' | 'user_email'> | null | undefined,
  user: CurrentUser | null | undefined
): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return isMyPost(post, user);
}

/** 댓글 편집/삭제 권한 */
export function canEditComment(
  comment: Pick<EsgCommentRow, 'user_id' | 'user_email'> | null | undefined,
  user: CurrentUser | null | undefined
): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return isMyComment(comment, user);
}

/** 주문 취소 권한 (본인 또는 관리자, pending 상태일 때만) */
export function canCancelOrder(
  order: Pick<EsgOrderRow, 'user_id' | 'user_email' | 'payment_status' | 'order_type'> | null | undefined,
  user: CurrentUser | null | undefined
): boolean {
  if (!order || !user) return false;
  if (order.payment_status !== 'pending') return false;

  // 경매 낙찰 주문은 관리자만 취소 가능 (재경매 정책 필요)
  if (order.order_type === 'auction' && user.role !== 'ADMIN') return false;

  if (user.role === 'ADMIN') return true;
  return isMyOrder(order, user);
}

/** 관리자 권한 단순 체크 */
export function isAdmin(user: CurrentUser | null | undefined): boolean {
  return user?.role === 'ADMIN' && user?.is_active === true;
}
