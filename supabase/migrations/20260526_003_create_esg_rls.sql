-- ============================================================================
-- C&R ESG Event — Row Level Security (RLS) Policies
-- 원칙:
--   - 모든 INSERT/UPDATE/DELETE는 RLS로 강제 (프론트 신뢰 금지)
--   - 일반 사용자는 esg_*_public view로 접근, raw 테이블은 본인 OR 관리자만
--   - 입찰(esg_auction_bids INSERT)은 place_bid RPC 함수로만 가능
-- ============================================================================

-- ============================================================================
-- esg_is_admin() 헬퍼 함수
-- 변경 이력:
--   2026-05-26 v1: profiles.role='admin' AND is_active=true 기준으로 수정
--                  (이전: profiles.is_admin 컬럼 가정 → 실제 스키마에 없음)
--   2026-05-26 v2: role 값 대문자 'ADMIN' 확인 (실제 DB: USER 517명, ADMIN 8명)
-- 정책:
--   - role='ADMIN' 인 사용자만 관리자 권한 (대소문자 구분)
--   - is_active=false (퇴사자)는 admin 권한 박탈
--   - role 값이 'ADMIN' 외에 다른 게 있으면(예: super_admin) 이 함수만 수정
-- ============================================================================
CREATE OR REPLACE FUNCTION esg_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- ← profiles.role 컬럼 기반 + is_active 체크 (2026-05-26 정정)
  SELECT COALESCE(
    (SELECT role = 'ADMIN' AND is_active = true
     FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

COMMENT ON FUNCTION esg_is_admin() IS '관리자 판정: profiles.role=''ADMIN'' AND is_active=true. role 값 변경 시 이 함수만 수정.';

-- ============================================================================
-- RLS 활성화
-- ============================================================================
ALTER TABLE esg_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg_post_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg_auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg_auction_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg_wishlists ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 1) esg_settings
-- ============================================================================
DROP POLICY IF EXISTS "esg_settings_select_all" ON esg_settings;
CREATE POLICY "esg_settings_select_all" ON esg_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "esg_settings_modify_admin" ON esg_settings;
CREATE POLICY "esg_settings_modify_admin" ON esg_settings
  FOR ALL USING (esg_is_admin()) WITH CHECK (esg_is_admin());

-- ============================================================================
-- 2) esg_posts
--    SELECT: published면 누구나 OR 본인 OR 관리자
--    INSERT: 본인만 (posts_enabled 토글 확인)
--    UPDATE/DELETE: 본인 OR 관리자
-- ============================================================================
DROP POLICY IF EXISTS "esg_posts_select" ON esg_posts;
CREATE POLICY "esg_posts_select" ON esg_posts
  FOR SELECT USING (
    status = 'published'
    OR user_id = auth.uid()
    OR esg_is_admin()
  );

DROP POLICY IF EXISTS "esg_posts_insert" ON esg_posts;
CREATE POLICY "esg_posts_insert" ON esg_posts
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND COALESCE(
      (SELECT (value)::text::boolean FROM esg_settings WHERE key = 'posts_enabled'),
      true
    ) = true
  );

DROP POLICY IF EXISTS "esg_posts_update" ON esg_posts;
CREATE POLICY "esg_posts_update" ON esg_posts
  FOR UPDATE USING (user_id = auth.uid() OR esg_is_admin())
  WITH CHECK (user_id = auth.uid() OR esg_is_admin());

DROP POLICY IF EXISTS "esg_posts_delete" ON esg_posts;
CREATE POLICY "esg_posts_delete" ON esg_posts
  FOR DELETE USING (user_id = auth.uid() OR esg_is_admin());

-- ============================================================================
-- 3) esg_post_images
--    SELECT: 누구나, INSERT/DELETE는 게시글 소유자 OR 관리자
-- ============================================================================
DROP POLICY IF EXISTS "esg_post_images_select" ON esg_post_images;
CREATE POLICY "esg_post_images_select" ON esg_post_images
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "esg_post_images_insert" ON esg_post_images;
CREATE POLICY "esg_post_images_insert" ON esg_post_images
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM esg_posts WHERE id = post_id AND (user_id = auth.uid() OR esg_is_admin()))
  );

DROP POLICY IF EXISTS "esg_post_images_delete" ON esg_post_images;
CREATE POLICY "esg_post_images_delete" ON esg_post_images
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM esg_posts WHERE id = post_id AND (user_id = auth.uid() OR esg_is_admin()))
  );

-- ============================================================================
-- 4) esg_post_likes
--    SELECT: 본인 좋아요 내역 OR 관리자만 (일반 사용자에겐 카운트만 노출 — like_count denormalized)
--    INSERT/DELETE: 본인만
-- ============================================================================
DROP POLICY IF EXISTS "esg_post_likes_select" ON esg_post_likes;
CREATE POLICY "esg_post_likes_select" ON esg_post_likes
  FOR SELECT USING (user_id = auth.uid() OR esg_is_admin());

DROP POLICY IF EXISTS "esg_post_likes_insert" ON esg_post_likes;
CREATE POLICY "esg_post_likes_insert" ON esg_post_likes
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "esg_post_likes_delete" ON esg_post_likes;
CREATE POLICY "esg_post_likes_delete" ON esg_post_likes
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- 5) esg_comments
--    SELECT: published거나 본인/관리자
--    INSERT: 본인 AND comments_enabled=true
--    UPDATE/DELETE: 본인 OR 관리자
-- ============================================================================
DROP POLICY IF EXISTS "esg_comments_select" ON esg_comments;
CREATE POLICY "esg_comments_select" ON esg_comments
  FOR SELECT USING (
    status = 'published'
    OR user_id = auth.uid()
    OR esg_is_admin()
  );

DROP POLICY IF EXISTS "esg_comments_insert" ON esg_comments;
CREATE POLICY "esg_comments_insert" ON esg_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND COALESCE(
      (SELECT (value)::text::boolean FROM esg_settings WHERE key = 'comments_enabled'),
      true
    ) = true
  );

DROP POLICY IF EXISTS "esg_comments_update" ON esg_comments;
CREATE POLICY "esg_comments_update" ON esg_comments
  FOR UPDATE USING (user_id = auth.uid() OR esg_is_admin())
  WITH CHECK (user_id = auth.uid() OR esg_is_admin());

DROP POLICY IF EXISTS "esg_comments_delete" ON esg_comments;
CREATE POLICY "esg_comments_delete" ON esg_comments
  FOR DELETE USING (user_id = auth.uid() OR esg_is_admin());

-- ============================================================================
-- 6) esg_products
--    SELECT: 누구나, 변경은 관리자만
-- ============================================================================
DROP POLICY IF EXISTS "esg_products_select" ON esg_products;
CREATE POLICY "esg_products_select" ON esg_products
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "esg_products_modify" ON esg_products;
CREATE POLICY "esg_products_modify" ON esg_products
  FOR ALL USING (esg_is_admin()) WITH CHECK (esg_is_admin());

-- ============================================================================
-- 7) esg_cart_items — 본인만 전체
-- ============================================================================
DROP POLICY IF EXISTS "esg_cart_items_select" ON esg_cart_items;
CREATE POLICY "esg_cart_items_select" ON esg_cart_items
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "esg_cart_items_insert" ON esg_cart_items;
CREATE POLICY "esg_cart_items_insert" ON esg_cart_items
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "esg_cart_items_update" ON esg_cart_items;
CREATE POLICY "esg_cart_items_update" ON esg_cart_items
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "esg_cart_items_delete" ON esg_cart_items;
CREATE POLICY "esg_cart_items_delete" ON esg_cart_items
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- 8) esg_orders
--    SELECT: 본인 OR 관리자
--    INSERT: create_order RPC만 (직접 INSERT 차단, RPC 내부에서 재고 검증)
--    UPDATE: 관리자만 (입금 확인, 취소 등은 별도 RPC로 검증)
-- ============================================================================
DROP POLICY IF EXISTS "esg_orders_select" ON esg_orders;
CREATE POLICY "esg_orders_select" ON esg_orders
  FOR SELECT USING (user_id = auth.uid() OR esg_is_admin());

DROP POLICY IF EXISTS "esg_orders_insert" ON esg_orders;
CREATE POLICY "esg_orders_insert" ON esg_orders
  FOR INSERT WITH CHECK (false);  -- RPC만 허용 (create_order, place_bid 등)

DROP POLICY IF EXISTS "esg_orders_update" ON esg_orders;
CREATE POLICY "esg_orders_update" ON esg_orders
  FOR UPDATE USING (esg_is_admin())
  WITH CHECK (esg_is_admin());

-- ============================================================================
-- 9) esg_order_items
--    SELECT: 주문 소유자 OR 관리자
--    INSERT: false (RPC만)
-- ============================================================================
DROP POLICY IF EXISTS "esg_order_items_select" ON esg_order_items;
CREATE POLICY "esg_order_items_select" ON esg_order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM esg_orders
      WHERE id = order_id AND (user_id = auth.uid() OR esg_is_admin())
    )
  );

DROP POLICY IF EXISTS "esg_order_items_insert" ON esg_order_items;
CREATE POLICY "esg_order_items_insert" ON esg_order_items
  FOR INSERT WITH CHECK (false);

-- ============================================================================
-- 10) esg_auctions
--    SELECT: 누구나
--    INSERT/DELETE: 관리자만
--    UPDATE: 관리자만 (입찰로 인한 current_price 갱신은 place_bid RPC가 SECURITY DEFINER로 우회)
-- ============================================================================
DROP POLICY IF EXISTS "esg_auctions_select" ON esg_auctions;
CREATE POLICY "esg_auctions_select" ON esg_auctions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "esg_auctions_modify" ON esg_auctions;
CREATE POLICY "esg_auctions_modify" ON esg_auctions
  FOR ALL USING (esg_is_admin()) WITH CHECK (esg_is_admin());

-- ============================================================================
-- 11) esg_auction_bids
--    SELECT: 누구나 (입찰 이력은 공개 — 단, 사용자명은 view에서 처리 권장)
--    INSERT: false (place_bid RPC만)
-- ============================================================================
DROP POLICY IF EXISTS "esg_auction_bids_select" ON esg_auction_bids;
CREATE POLICY "esg_auction_bids_select" ON esg_auction_bids
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "esg_auction_bids_insert" ON esg_auction_bids;
CREATE POLICY "esg_auction_bids_insert" ON esg_auction_bids
  FOR INSERT WITH CHECK (false);

-- ============================================================================
-- 12) esg_wishlists — 본인만 전체
-- ============================================================================
DROP POLICY IF EXISTS "esg_wishlists_select" ON esg_wishlists;
CREATE POLICY "esg_wishlists_select" ON esg_wishlists
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "esg_wishlists_modify" ON esg_wishlists;
CREATE POLICY "esg_wishlists_modify" ON esg_wishlists
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
