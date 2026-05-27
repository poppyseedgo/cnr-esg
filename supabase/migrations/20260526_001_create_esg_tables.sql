-- ============================================================================
-- C&R ESG Event (29주년 창립기념일) — Table DDL
-- Created: 2026-05-26
-- Instance: jjzcqpbwkkujttwxksvy (C&R Space와 공유)
-- Naming: snake_case strict, esg_ prefix
-- Notes:
--   - profiles 테이블은 C&R Space의 기존 테이블 공유
--   - profiles.id를 UPDATE하는 트리거(handle_sso_new_user) 존재 → FK에 ON UPDATE CASCADE 필수
--   - 테이블 생성 순서는 의존성 고려: posts → product → auction → orders → order_items
-- ============================================================================

-- ============================================================================
-- 1) esg_settings — 이벤트 페이즈/기간/모금액 등 전역 설정
-- ============================================================================
CREATE TABLE IF NOT EXISTS esg_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL
);

COMMENT ON TABLE esg_settings IS '이벤트 전역 설정 (페이즈, 기간, 모금액, 토글 등)';

-- ============================================================================
-- 2) esg_posts — 게시글 (ESG 아이디어 / 제로 웨이스트 / 슬기로운 사회 생활 통합)
-- ============================================================================
CREATE TABLE IF NOT EXISTS esg_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('esg_idea','zero_waste','wise_life')),

  -- 식별: UUID + email 이중 복원 패턴 (C&R Space 원칙 동일)
  user_id uuid REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  user_email text NOT NULL,
  user_name_snapshot text NOT NULL,
  user_dept_snapshot text,

  is_anonymous boolean NOT NULL DEFAULT false,
  title text NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 200),
  content text NOT NULL,
  cover_image_url text,

  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','deleted','hidden')),

  -- denormalized counters (트리거로 자동 갱신)
  like_count int NOT NULL DEFAULT 0,
  comment_count int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esg_posts_category_created
  ON esg_posts (category, created_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_esg_posts_user_created
  ON esg_posts (user_id, created_at DESC) WHERE status = 'published';

COMMENT ON COLUMN esg_posts.is_anonymous IS 'true면 일반 사용자에게 익명, 본인 마이페이지/관리자에게는 본명 노출';

-- ============================================================================
-- 3) esg_post_images — 게시글 이미지 (최대 3장)
-- ============================================================================
CREATE TABLE IF NOT EXISTS esg_post_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES esg_posts(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  sort_order int NOT NULL CHECK (sort_order >= 0 AND sort_order <= 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_esg_post_images_post
  ON esg_post_images (post_id, sort_order);

-- ============================================================================
-- 4) esg_post_likes — 좋아요 (UNIQUE로 중복 방지)
-- ============================================================================
CREATE TABLE IF NOT EXISTS esg_post_likes (
  post_id uuid NOT NULL REFERENCES esg_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_esg_post_likes_user
  ON esg_post_likes (user_id, created_at DESC);

COMMENT ON TABLE esg_post_likes IS '좋아요: 일반 사용자에게는 카운트만, 본인 마이페이지/관리자에게는 누가 눌렀는지 공개';

-- ============================================================================
-- 5) esg_comments — 댓글 (어드민 토글 가능, RLS에서 esg_settings.comments_enabled 참조)
-- ============================================================================
CREATE TABLE IF NOT EXISTS esg_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES esg_posts(id) ON DELETE CASCADE,

  user_id uuid REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  user_email text NOT NULL,
  user_name_snapshot text NOT NULL,
  user_dept_snapshot text,

  is_anonymous boolean NOT NULL DEFAULT false,
  content text NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 2000),

  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','deleted','hidden')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esg_comments_post_created
  ON esg_comments (post_id, created_at ASC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_esg_comments_user
  ON esg_comments (user_id, created_at DESC) WHERE status = 'published';

-- ============================================================================
-- 6) esg_products — 바자회 상품
-- ============================================================================
CREATE TABLE IF NOT EXISTS esg_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) > 0),
  description text,
  price int NOT NULL CHECK (price >= 0),  -- 원 단위
  stock int NOT NULL CHECK (stock >= 0),   -- 총 재고
  reserved_stock int NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),  -- pending 주문에 선점된 재고
  thumbnail_url text,
  detail_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'on_sale' CHECK (status IN ('on_sale','sold_out','hidden')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esg_products_status_sort
  ON esg_products (status, sort_order, created_at DESC);

COMMENT ON COLUMN esg_products.reserved_stock IS '주문 생성(pending) 시 선점된 수량. 실제 가용재고 = stock - reserved_stock';

-- ============================================================================
-- 7) esg_cart_items — 장바구니 (UNIQUE로 같은 상품 중복 방지)
-- ============================================================================
CREATE TABLE IF NOT EXISTS esg_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_email text NOT NULL,
  product_id uuid NOT NULL REFERENCES esg_products(id) ON DELETE CASCADE,
  quantity int NOT NULL CHECK (quantity > 0),
  added_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_esg_cart_items_user
  ON esg_cart_items (user_id, added_at DESC);

-- ============================================================================
-- 8) esg_auctions — 경매 (esg_orders보다 먼저 생성, winner_order_id는 나중에 ALTER로 추가)
-- ============================================================================
CREATE TABLE IF NOT EXISTS esg_auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  description text,
  thumbnail_url text,
  detail_images jsonb NOT NULL DEFAULT '[]'::jsonb,

  start_price int NOT NULL CHECK (start_price >= 0),
  bid_unit int NOT NULL CHECK (bid_unit > 0) DEFAULT 1000,
  current_price int NOT NULL,  -- 시작 시 = start_price
  current_bidder_id uuid REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  current_bidder_email text,
  bid_count int NOT NULL DEFAULT 0,

  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','ended','cancelled')),

  winner_id uuid REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  winner_email text,
  winner_final_price int,
  -- winner_order_id는 esg_orders 생성 후 ALTER로 추가

  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_at > starts_at),
  CHECK (current_price >= start_price)
);

CREATE INDEX IF NOT EXISTS idx_esg_auctions_status_ends
  ON esg_auctions (status, ends_at);
CREATE INDEX IF NOT EXISTS idx_esg_auctions_status_sort
  ON esg_auctions (status, sort_order, starts_at);
-- 자동 종료 cron용 partial index
CREATE INDEX IF NOT EXISTS idx_esg_auctions_active_ends
  ON esg_auctions (ends_at) WHERE status = 'active';

COMMENT ON COLUMN esg_auctions.current_price IS '현재 최고 입찰가 (입찰 없으면 = start_price)';
COMMENT ON COLUMN esg_auctions.bid_unit IS '최소 입찰 증분. 신규 입찰액 >= current_price + bid_unit';

-- ============================================================================
-- 9) esg_orders — 주문 (바자회 + 경매 통합, order_type으로 구분)
-- ============================================================================
CREATE TABLE IF NOT EXISTS esg_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,  -- 형식: "CNR29-YYMMDD-XXXX" (RPC에서 생성)
  order_type text NOT NULL CHECK (order_type IN ('bazaar','auction')),

  user_id uuid REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  user_email text NOT NULL,
  user_name_snapshot text NOT NULL,
  user_dept_snapshot text,

  total_amount int NOT NULL CHECK (total_amount >= 0),

  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','cancelled','refunded','expired')),
  payment_method text NOT NULL DEFAULT 'bank_transfer',
  payer_name text,                -- 입금자명 (관리자가 매칭 시 사용)
  bank_account_used text,         -- 안내받은 계좌 스냅샷 (정책 변경 대비)

  memo text,                      -- 사용자 요청사항
  admin_memo text,                -- 관리자 내부 메모

  paid_at timestamptz,
  paid_by uuid REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancelled_reason text,
  cancelled_by uuid REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,

  -- pending → expired 자동 전환 시점 (주문 생성 + order_expire_hours)
  expires_at timestamptz NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esg_orders_user_created
  ON esg_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esg_orders_user_status
  ON esg_orders (user_id, payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esg_orders_status_expires
  ON esg_orders (expires_at) WHERE payment_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_esg_orders_paid_at
  ON esg_orders (paid_at DESC) WHERE payment_status = 'paid';

COMMENT ON COLUMN esg_orders.bank_account_used IS '주문 시점에 안내한 계좌정보 스냅샷 (관리자가 나중에 계좌 바꿔도 추적 가능)';

-- esg_auctions.winner_order_id FK 추가 (이제 esg_orders 존재함)
ALTER TABLE esg_auctions
  ADD COLUMN IF NOT EXISTS winner_order_id uuid
  REFERENCES esg_orders(id) ON DELETE SET NULL;

-- ============================================================================
-- 10) esg_order_items — 주문 상품 (바자회 상품 OR 경매 낙찰품)
-- ============================================================================
CREATE TABLE IF NOT EXISTS esg_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES esg_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES esg_products(id) ON DELETE SET NULL,
  auction_id uuid REFERENCES esg_auctions(id) ON DELETE SET NULL,

  -- 스냅샷 (상품 가격/이름이 나중에 바뀌어도 주문 시점 기준 유지)
  product_name_snapshot text NOT NULL,
  thumbnail_snapshot text,
  price_snapshot int NOT NULL CHECK (price_snapshot >= 0),
  quantity int NOT NULL CHECK (quantity > 0) DEFAULT 1,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- 바자회면 product_id, 경매면 auction_id 중 하나는 반드시
  CHECK (
    (product_id IS NOT NULL AND auction_id IS NULL)
    OR (product_id IS NULL AND auction_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_esg_order_items_order
  ON esg_order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_esg_order_items_product
  ON esg_order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_esg_order_items_auction
  ON esg_order_items (auction_id);

-- ============================================================================
-- 11) esg_auction_bids — 경매 입찰 이력
-- ============================================================================
CREATE TABLE IF NOT EXISTS esg_auction_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES esg_auctions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_email text NOT NULL,
  user_name_snapshot text NOT NULL,
  bid_amount int NOT NULL CHECK (bid_amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esg_auction_bids_auction_created
  ON esg_auction_bids (auction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esg_auction_bids_user
  ON esg_auction_bids (user_id, created_at DESC);

COMMENT ON TABLE esg_auction_bids IS '입찰 이력: INSERT는 place_bid RPC를 통해서만 (RLS로 직접 INSERT 차단)';

-- ============================================================================
-- 12) esg_wishlists — 찜
-- ============================================================================
CREATE TABLE IF NOT EXISTS esg_wishlists (
  user_id uuid NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_email text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('product','auction')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_esg_wishlists_user_created
  ON esg_wishlists (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esg_wishlists_target
  ON esg_wishlists (target_type, target_id);

-- ============================================================================
-- 공용 updated_at 자동 갱신 트리거 함수
-- ============================================================================
CREATE OR REPLACE FUNCTION esg_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_esg_posts_updated_at ON esg_posts;
CREATE TRIGGER trg_esg_posts_updated_at
  BEFORE UPDATE ON esg_posts FOR EACH ROW EXECUTE FUNCTION esg_set_updated_at();

DROP TRIGGER IF EXISTS trg_esg_comments_updated_at ON esg_comments;
CREATE TRIGGER trg_esg_comments_updated_at
  BEFORE UPDATE ON esg_comments FOR EACH ROW EXECUTE FUNCTION esg_set_updated_at();

DROP TRIGGER IF EXISTS trg_esg_products_updated_at ON esg_products;
CREATE TRIGGER trg_esg_products_updated_at
  BEFORE UPDATE ON esg_products FOR EACH ROW EXECUTE FUNCTION esg_set_updated_at();

DROP TRIGGER IF EXISTS trg_esg_cart_items_updated_at ON esg_cart_items;
CREATE TRIGGER trg_esg_cart_items_updated_at
  BEFORE UPDATE ON esg_cart_items FOR EACH ROW EXECUTE FUNCTION esg_set_updated_at();

DROP TRIGGER IF EXISTS trg_esg_orders_updated_at ON esg_orders;
CREATE TRIGGER trg_esg_orders_updated_at
  BEFORE UPDATE ON esg_orders FOR EACH ROW EXECUTE FUNCTION esg_set_updated_at();

DROP TRIGGER IF EXISTS trg_esg_auctions_updated_at ON esg_auctions;
CREATE TRIGGER trg_esg_auctions_updated_at
  BEFORE UPDATE ON esg_auctions FOR EACH ROW EXECUTE FUNCTION esg_set_updated_at();

DROP TRIGGER IF EXISTS trg_esg_settings_updated_at ON esg_settings;
CREATE TRIGGER trg_esg_settings_updated_at
  BEFORE UPDATE ON esg_settings FOR EACH ROW EXECUTE FUNCTION esg_set_updated_at();

-- ============================================================================
-- like_count denormalize 트리거
-- ============================================================================
CREATE OR REPLACE FUNCTION esg_post_likes_count_trigger() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE esg_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE esg_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_esg_post_likes_count ON esg_post_likes;
CREATE TRIGGER trg_esg_post_likes_count
  AFTER INSERT OR DELETE ON esg_post_likes
  FOR EACH ROW EXECUTE FUNCTION esg_post_likes_count_trigger();

-- ============================================================================
-- comment_count denormalize 트리거 (status 변경도 반영)
-- ============================================================================
CREATE OR REPLACE FUNCTION esg_comments_count_trigger() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'published') THEN
    UPDATE esg_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF (TG_OP = 'DELETE' AND OLD.status = 'published') THEN
    UPDATE esg_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.status = 'published' AND NEW.status <> 'published') THEN
      UPDATE esg_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.post_id;
    ELSIF (OLD.status <> 'published' AND NEW.status = 'published') THEN
      UPDATE esg_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_esg_comments_count ON esg_comments;
CREATE TRIGGER trg_esg_comments_count
  AFTER INSERT OR UPDATE OR DELETE ON esg_comments
  FOR EACH ROW EXECUTE FUNCTION esg_comments_count_trigger();
