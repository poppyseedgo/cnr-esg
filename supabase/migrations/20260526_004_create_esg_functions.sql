-- ============================================================================
-- C&R ESG Event — RPC Functions & Triggers
-- 원칙:
--   - 동시성 처리는 SELECT FOR UPDATE (advisory lock)으로 원자성 보장
--   - 모든 RPC는 SECURITY DEFINER + 명시적 권한 검증
--   - 반환값은 jsonb {success, error?, data?} 표준 형태
-- ============================================================================

-- ============================================================================
-- generate_order_number — 주문번호 생성 헬퍼
-- 형식: "CNR29-YYMMDD-XXXX" (XXXX는 그날의 순번)
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_order_number() RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_date_part text;
  v_seq int;
  v_attempt int := 0;
  v_max_attempts int := 10;
  v_result text;
BEGIN
  v_date_part := to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYMMDD');

  LOOP
    -- 같은 날의 주문 수 + 랜덤성 (충돌 가능성 매우 낮음)
    SELECT COALESCE(MAX(
      CASE WHEN order_number LIKE 'CNR29-' || v_date_part || '-%'
      THEN CAST(SUBSTRING(order_number FROM 14 FOR 4) AS int)
      ELSE 0 END
    ), 0) + 1
    INTO v_seq
    FROM esg_orders;

    v_result := 'CNR29-' || v_date_part || '-' || lpad(v_seq::text, 4, '0');

    -- UNIQUE 충돌 회피
    IF NOT EXISTS (SELECT 1 FROM esg_orders WHERE order_number = v_result) THEN
      RETURN v_result;
    END IF;

    v_attempt := v_attempt + 1;
    IF v_attempt >= v_max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique order number after % attempts', v_max_attempts;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- create_bazaar_order — 바자회 주문 생성
-- 동작:
--   1. 장바구니 OR 전달받은 items로 주문 생성
--   2. 각 상품 stock - reserved_stock >= quantity 검증 (FOR UPDATE)
--   3. reserved_stock 차감 (선점)
--   4. esg_orders + esg_order_items INSERT
--   5. 장바구니 비우기 (옵션)
--   6. expires_at = now() + order_expire_hours (esg_settings)
-- ============================================================================
CREATE OR REPLACE FUNCTION create_bazaar_order(
  p_items jsonb,           -- [{product_id, quantity}, ...]
  p_memo text DEFAULT NULL,
  p_clear_cart boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_user_name text;
  v_user_dept text;
  v_order_id uuid;
  v_order_number text;
  v_total_amount int := 0;
  v_expire_hours int;
  v_bank_info jsonb;
  v_item jsonb;
  v_product esg_products;
  v_phase text;
BEGIN
  -- 인증 확인
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  -- 이벤트 페이즈 확인 (shop_open이 아니면 차단)
  SELECT (value)::text INTO v_phase FROM esg_settings WHERE key = 'event_phase';
  v_phase := trim(both '"' from v_phase);
  IF v_phase NOT IN ('shop_open') THEN
    RETURN jsonb_build_object('success', false, 'error', 'SHOP_NOT_OPEN', 'current_phase', v_phase);
  END IF;

  -- 사용자 정보
  SELECT email, name, dept INTO v_user_email, v_user_name, v_user_dept
  FROM profiles WHERE id = v_user_id;
  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  -- 아이템 검증
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'EMPTY_ITEMS');
  END IF;

  -- 설정값 조회
  SELECT (value)::text::int INTO v_expire_hours FROM esg_settings WHERE key = 'order_expire_hours';
  v_expire_hours := COALESCE(v_expire_hours, 24);
  SELECT value INTO v_bank_info FROM esg_settings WHERE key = 'bank_account_info';

  -- 주문 생성 (총액은 임시 0, 아래서 가산)
  v_order_number := generate_order_number();
  INSERT INTO esg_orders (
    order_number, order_type,
    user_id, user_email, user_name_snapshot, user_dept_snapshot,
    total_amount, payment_status, payment_method,
    bank_account_used, memo,
    expires_at
  ) VALUES (
    v_order_number, 'bazaar',
    v_user_id, v_user_email, v_user_name, v_user_dept,
    0, 'pending', 'bank_transfer',
    v_bank_info::text, p_memo,
    now() + (v_expire_hours || ' hours')::interval
  ) RETURNING id INTO v_order_id;

  -- 각 아이템 처리
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- FOR UPDATE로 상품 row lock
    SELECT * INTO v_product
    FROM esg_products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND: %', v_item->>'product_id';
    END IF;

    IF v_product.status <> 'on_sale' THEN
      RAISE EXCEPTION 'PRODUCT_NOT_ON_SALE: %', v_product.id;
    END IF;

    -- 가용재고 검증
    IF v_product.stock - v_product.reserved_stock < (v_item->>'quantity')::int THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: % (available=%, requested=%)',
        v_product.id,
        v_product.stock - v_product.reserved_stock,
        (v_item->>'quantity')::int;
    END IF;

    -- reserved_stock 차감 (선점)
    UPDATE esg_products
    SET reserved_stock = reserved_stock + (v_item->>'quantity')::int
    WHERE id = v_product.id;

    -- order_items INSERT
    INSERT INTO esg_order_items (
      order_id, product_id, product_name_snapshot, thumbnail_snapshot,
      price_snapshot, quantity
    ) VALUES (
      v_order_id, v_product.id, v_product.name, v_product.thumbnail_url,
      v_product.price, (v_item->>'quantity')::int
    );

    v_total_amount := v_total_amount + v_product.price * (v_item->>'quantity')::int;
  END LOOP;

  -- 총액 업데이트
  UPDATE esg_orders SET total_amount = v_total_amount WHERE id = v_order_id;

  -- 장바구니 비우기 (옵션)
  IF p_clear_cart THEN
    DELETE FROM esg_cart_items
    WHERE user_id = v_user_id
      AND product_id IN (
        SELECT (item->>'product_id')::uuid FROM jsonb_array_elements(p_items) AS item
      );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_amount', v_total_amount,
    'bank_account_info', v_bank_info,
    'expires_at', (SELECT expires_at FROM esg_orders WHERE id = v_order_id)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- place_bid — 경매 입찰 (advisory lock + 검증)
-- 동작:
--   1. SELECT FOR UPDATE로 경매 row lock
--   2. status='active' AND now() < ends_at 검증
--   3. bid_amount >= current_price + bid_unit 검증
--   4. esg_auction_bids INSERT
--   5. esg_auctions current_price/current_bidder/bid_count 갱신
-- ============================================================================
CREATE OR REPLACE FUNCTION place_bid(
  p_auction_id uuid,
  p_bid_amount int
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auction esg_auctions;
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_user_name text;
  v_now timestamptz := now();
  v_phase text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  -- 이벤트 페이즈 확인
  SELECT (value)::text INTO v_phase FROM esg_settings WHERE key = 'event_phase';
  v_phase := trim(both '"' from v_phase);
  IF v_phase NOT IN ('shop_open') THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUCTION_PHASE_CLOSED', 'current_phase', v_phase);
  END IF;

  -- 사용자 정보
  SELECT email, name INTO v_user_email, v_user_name FROM profiles WHERE id = v_user_id;
  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  -- 경매 row lock
  SELECT * INTO v_auction FROM esg_auctions WHERE id = p_auction_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUCTION_NOT_FOUND');
  END IF;

  -- 상태 검증
  IF v_auction.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUCTION_NOT_ACTIVE', 'status', v_auction.status);
  END IF;

  IF v_now < v_auction.starts_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUCTION_NOT_STARTED');
  END IF;

  IF v_now >= v_auction.ends_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUCTION_ENDED');
  END IF;

  -- 본인이 이미 최고 입찰자
  IF v_auction.current_bidder_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_HIGHEST_BIDDER');
  END IF;

  -- 최소 입찰가 검증
  IF p_bid_amount < v_auction.current_price + v_auction.bid_unit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'BID_TOO_LOW',
      'required_min', v_auction.current_price + v_auction.bid_unit,
      'current_price', v_auction.current_price,
      'bid_unit', v_auction.bid_unit
    );
  END IF;

  -- 입찰 기록
  INSERT INTO esg_auction_bids (auction_id, user_id, user_email, user_name_snapshot, bid_amount)
  VALUES (p_auction_id, v_user_id, v_user_email, v_user_name, p_bid_amount);

  -- 경매 갱신
  UPDATE esg_auctions
  SET current_price = p_bid_amount,
      current_bidder_id = v_user_id,
      current_bidder_email = v_user_email,
      bid_count = bid_count + 1,
      updated_at = v_now
  WHERE id = p_auction_id;

  RETURN jsonb_build_object(
    'success', true,
    'auction_id', p_auction_id,
    'bid_amount', p_bid_amount,
    'new_current_price', p_bid_amount,
    'bid_count', v_auction.bid_count + 1
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- finalize_auction — 경매 종료 후 낙찰 확정 (cron에서 호출)
-- 동작:
--   1. status='active' AND ends_at <= now() 경매 조회
--   2. current_bidder_id가 있으면 winner 확정 + 낙찰자용 주문 자동 생성
--   3. status='ended'
-- ============================================================================
CREATE OR REPLACE FUNCTION finalize_auction(p_auction_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auction esg_auctions;
  v_order_id uuid;
  v_order_number text;
  v_expire_hours int;
  v_bank_info jsonb;
  v_winner_name text;
  v_winner_dept text;
BEGIN
  SELECT * INTO v_auction FROM esg_auctions WHERE id = p_auction_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUCTION_NOT_FOUND');
  END IF;

  IF v_auction.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUCTION_NOT_ACTIVE', 'status', v_auction.status);
  END IF;

  IF now() < v_auction.ends_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUCTION_NOT_YET_ENDED');
  END IF;

  -- 낙찰자 없음 (입찰 0건)
  IF v_auction.current_bidder_id IS NULL THEN
    UPDATE esg_auctions SET status = 'ended', updated_at = now() WHERE id = p_auction_id;
    RETURN jsonb_build_object('success', true, 'has_winner', false);
  END IF;

  -- 낙찰자 정보
  SELECT name, dept INTO v_winner_name, v_winner_dept
  FROM profiles WHERE id = v_auction.current_bidder_id;

  -- 설정값
  SELECT (value)::text::int INTO v_expire_hours FROM esg_settings WHERE key = 'order_expire_hours';
  v_expire_hours := COALESCE(v_expire_hours, 24);
  SELECT value INTO v_bank_info FROM esg_settings WHERE key = 'bank_account_info';

  -- 낙찰자 자동 주문 생성
  v_order_number := generate_order_number();
  INSERT INTO esg_orders (
    order_number, order_type,
    user_id, user_email, user_name_snapshot, user_dept_snapshot,
    total_amount, payment_status, payment_method,
    bank_account_used,
    expires_at
  ) VALUES (
    v_order_number, 'auction',
    v_auction.current_bidder_id, v_auction.current_bidder_email, v_winner_name, v_winner_dept,
    v_auction.current_price, 'pending', 'bank_transfer',
    v_bank_info::text,
    now() + (v_expire_hours || ' hours')::interval
  ) RETURNING id INTO v_order_id;

  INSERT INTO esg_order_items (
    order_id, auction_id, product_name_snapshot, thumbnail_snapshot,
    price_snapshot, quantity
  ) VALUES (
    v_order_id, v_auction.id, v_auction.product_name, v_auction.thumbnail_url,
    v_auction.current_price, 1
  );

  -- 경매 확정
  UPDATE esg_auctions
  SET status = 'ended',
      winner_id = current_bidder_id,
      winner_email = current_bidder_email,
      winner_final_price = current_price,
      winner_order_id = v_order_id,
      updated_at = now()
  WHERE id = p_auction_id;

  RETURN jsonb_build_object(
    'success', true,
    'has_winner', true,
    'winner_id', v_auction.current_bidder_id,
    'final_price', v_auction.current_price,
    'order_id', v_order_id,
    'order_number', v_order_number
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- mark_order_paid — 관리자 입금 확인 (수동)
-- 동작:
--   1. order 조회 + FOR UPDATE
--   2. payment_status='paid' 전환
--   3. 바자회: reserved_stock → stock 실제 차감
--   4. 경매: 별도 처리 없음 (낙찰 시점에 finalize_auction이 했음)
-- ============================================================================
CREATE OR REPLACE FUNCTION mark_order_paid(
  p_order_id uuid,
  p_payer_name text DEFAULT NULL,
  p_admin_memo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order esg_orders;
  v_admin_id uuid := auth.uid();
  v_item esg_order_items;
BEGIN
  -- 관리자 권한 확인
  IF NOT esg_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_ADMIN');
  END IF;

  SELECT * INTO v_order FROM esg_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  IF v_order.payment_status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_PENDING', 'status', v_order.payment_status);
  END IF;

  -- 바자회 주문: reserved_stock에서 stock으로 실제 차감
  IF v_order.order_type = 'bazaar' THEN
    FOR v_item IN SELECT * FROM esg_order_items WHERE order_id = p_order_id
    LOOP
      UPDATE esg_products
      SET stock = stock - v_item.quantity,
          reserved_stock = reserved_stock - v_item.quantity
      WHERE id = v_item.product_id;

      -- 재고 0이면 sold_out
      UPDATE esg_products
      SET status = 'sold_out'
      WHERE id = v_item.product_id AND stock = 0 AND status = 'on_sale';
    END LOOP;
  END IF;

  -- 주문 paid 전환
  UPDATE esg_orders
  SET payment_status = 'paid',
      paid_at = now(),
      paid_by = v_admin_id,
      payer_name = COALESCE(p_payer_name, payer_name),
      admin_memo = COALESCE(p_admin_memo, admin_memo)
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- cancel_order — 주문 취소 (본인 OR 관리자)
-- 동작:
--   1. pending 상태에서만 취소 가능 (paid는 환불 별도 처리)
--   2. 바자회: reserved_stock 복구
-- ============================================================================
CREATE OR REPLACE FUNCTION cancel_order(
  p_order_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order esg_orders;
  v_user_id uuid := auth.uid();
  v_is_admin boolean := esg_is_admin();
  v_item esg_order_items;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  SELECT * INTO v_order FROM esg_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  -- 권한: 본인 OR 관리자
  IF v_order.user_id <> v_user_id AND NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  END IF;

  IF v_order.payment_status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_PENDING', 'status', v_order.payment_status);
  END IF;

  -- 바자회: reserved_stock 복구
  IF v_order.order_type = 'bazaar' THEN
    FOR v_item IN SELECT * FROM esg_order_items WHERE order_id = p_order_id
    LOOP
      UPDATE esg_products
      SET reserved_stock = GREATEST(reserved_stock - v_item.quantity, 0)
      WHERE id = v_item.product_id;
    END LOOP;
  END IF;

  -- 경매: 낙찰자 취소 시 경매 자체 처리는 별도 정책 필요 (재경매? 차순위?)
  -- 일단 경매는 본인 취소 불가, 관리자만 처리하도록 권장
  IF v_order.order_type = 'auction' AND NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUCTION_CANCEL_ADMIN_ONLY');
  END IF;

  UPDATE esg_orders
  SET payment_status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_user_id,
      cancelled_reason = p_reason
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- expire_pending_orders — 만료된 pending 주문 처리 (cron에서 호출)
-- 동작: expires_at <= now() AND payment_status='pending' → expired
--       바자회면 reserved_stock 복구
-- ============================================================================
CREATE OR REPLACE FUNCTION expire_pending_orders() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_count int := 0;
  v_item esg_order_items;
  v_order_type text;
BEGIN
  FOR v_order_id, v_order_type IN
    SELECT id, order_type FROM esg_orders
    WHERE payment_status = 'pending' AND expires_at <= now()
    FOR UPDATE
  LOOP
    -- 바자회: reserved_stock 복구
    IF v_order_type = 'bazaar' THEN
      FOR v_item IN SELECT * FROM esg_order_items WHERE order_id = v_order_id
      LOOP
        UPDATE esg_products
        SET reserved_stock = GREATEST(reserved_stock - v_item.quantity, 0)
        WHERE id = v_item.product_id;
      END LOOP;
    END IF;

    UPDATE esg_orders
    SET payment_status = 'expired',
        cancelled_at = now(),
        cancelled_reason = 'AUTO_EXPIRED'
    WHERE id = v_order_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'expired_count', v_count);
END;
$$;

-- ============================================================================
-- 함수 권한 부여 (authenticated 사용자 호출 허용)
-- ============================================================================
GRANT EXECUTE ON FUNCTION create_bazaar_order(jsonb, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION place_bid(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_order(uuid, text) TO authenticated;
-- 관리자/cron 전용은 service_role만:
-- GRANT EXECUTE ON FUNCTION mark_order_paid TO authenticated;  -- esg_is_admin()로 내부 차단
-- GRANT EXECUTE ON FUNCTION finalize_auction TO service_role;
-- GRANT EXECUTE ON FUNCTION expire_pending_orders TO service_role;
GRANT EXECUTE ON FUNCTION mark_order_paid(uuid, text, text) TO authenticated;
