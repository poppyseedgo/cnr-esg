# C&R ESG Event — DB 마이그레이션 가이드

## 📋 적용 순서 (반드시 순서대로)

```
20260526_001_create_esg_tables.sql      # 12개 테이블 + 인덱스 + 트리거
20260526_002_create_esg_views.sql       # 익명 처리 view 4개
20260526_003_create_esg_rls.sql         # RLS 정책 + esg_is_admin() 함수
20260526_004_create_esg_functions.sql   # 5개 RPC 함수
20260526_005_seed_esg_settings.sql      # 초기 설정값 10개
```

## ⚠️ 적용 전 확인사항

### 1. 의존 객체 존재 여부
다음이 **C&R Space에 이미 존재**한다고 가정함:
- `profiles` 테이블 (id, email, name, dept, is_admin 컬럼)
- `auth.uid()` (Supabase 기본 제공)

만약 `profiles.is_admin` 컬럼명이 다르면 `003_create_esg_rls.sql`의 `esg_is_admin()` 함수 수정 필요.

### 2. 충돌 가능성
- 모든 테이블에 `esg_` prefix 사용 → C&R Space 테이블과 충돌 없음
- `esg_is_admin()`는 prefix 붙임 → 기존 `is_admin()` 함수와 별개

### 3. 백업
적용 전 Supabase 대시보드에서 DB 스냅샷 생성 권장. 문제 시 즉시 롤백 가능.

## 🚀 적용 방법

### 방법 1: Supabase CLI (권장)
```bash
cd /path/to/cnr-esg
supabase link --project-ref jjzcqpbwkkujttwxksvy
supabase db push
```

### 방법 2: SQL Editor 수동 적용
Supabase 대시보드 → SQL Editor → 파일 5개를 **순서대로** 복사 붙여넣기 실행.

## ✅ 적용 후 검증

```sql
-- 1. 테이블 12개 생성 확인
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'esg_%'
ORDER BY table_name;
-- 예상 결과: esg_auctions, esg_auction_bids, esg_cart_items, esg_comments,
--           esg_order_items, esg_orders, esg_post_images, esg_post_likes,
--           esg_posts, esg_products, esg_settings, esg_wishlists

-- 2. view 4개 확인
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public' AND table_name LIKE 'esg_%'
ORDER BY table_name;
-- 예상: esg_comments_public, esg_donation_stats, esg_posts_public, esg_posts_with_images

-- 3. RPC 함수 확인
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name IN (
  'create_bazaar_order','place_bid','finalize_auction',
  'mark_order_paid','cancel_order','expire_pending_orders',
  'generate_order_number','esg_is_admin'
)
ORDER BY routine_name;

-- 4. 초기 설정값 확인
SELECT key, value FROM esg_settings ORDER BY key;
-- 예상: 10개 row (event_period, event_phase, shop_opens_at, ...)

-- 5. RLS 활성화 확인
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'esg_%';
-- 모두 rowsecurity = true 여야 함
```

## 🔄 롤백 절차

```sql
-- 전체 esg_ 객체 제거 (주의: 모든 데이터 삭제)
DROP VIEW IF EXISTS esg_donation_stats CASCADE;
DROP VIEW IF EXISTS esg_posts_with_images CASCADE;
DROP VIEW IF EXISTS esg_comments_public CASCADE;
DROP VIEW IF EXISTS esg_posts_public CASCADE;

DROP FUNCTION IF EXISTS expire_pending_orders() CASCADE;
DROP FUNCTION IF EXISTS cancel_order(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS mark_order_paid(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS finalize_auction(uuid) CASCADE;
DROP FUNCTION IF EXISTS place_bid(uuid, int) CASCADE;
DROP FUNCTION IF EXISTS create_bazaar_order(jsonb, text, boolean) CASCADE;
DROP FUNCTION IF EXISTS generate_order_number() CASCADE;
DROP FUNCTION IF EXISTS esg_is_admin() CASCADE;
DROP FUNCTION IF EXISTS esg_set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS esg_post_likes_count_trigger() CASCADE;
DROP FUNCTION IF EXISTS esg_comments_count_trigger() CASCADE;

DROP TABLE IF EXISTS esg_wishlists CASCADE;
DROP TABLE IF EXISTS esg_auction_bids CASCADE;
DROP TABLE IF EXISTS esg_order_items CASCADE;
DROP TABLE IF EXISTS esg_orders CASCADE;
DROP TABLE IF EXISTS esg_auctions CASCADE;
DROP TABLE IF EXISTS esg_cart_items CASCADE;
DROP TABLE IF EXISTS esg_products CASCADE;
DROP TABLE IF EXISTS esg_comments CASCADE;
DROP TABLE IF EXISTS esg_post_likes CASCADE;
DROP TABLE IF EXISTS esg_post_images CASCADE;
DROP TABLE IF EXISTS esg_posts CASCADE;
DROP TABLE IF EXISTS esg_settings CASCADE;
```

## 📊 데이터 흐름 요약

### 게시글 흐름
```
사용자 INSERT → esg_posts (raw, RLS로 본인만)
              → esg_post_images
            ↓
일반 사용자 SELECT → esg_posts_public (익명 마스킹 view)
                  → esg_posts_with_images (이미지 JOIN)
            ↓
좋아요 INSERT → esg_post_likes
              → 트리거가 esg_posts.like_count 증가
```

### 바자회 주문 흐름
```
장바구니 추가 → esg_cart_items INSERT
            ↓
결제 페이지 → create_bazaar_order RPC 호출
            ↓
RPC 내부 (원자성):
  1. FOR UPDATE로 상품 row lock
  2. 가용재고 = stock - reserved_stock 검증
  3. reserved_stock 차감 (선점)
  4. esg_orders + esg_order_items INSERT
  5. 장바구니 비우기
  6. expires_at = now() + 24h
            ↓
사용자에게 입금 안내 (계좌 + 주문번호)
            ↓
관리자 입금 확인 → mark_order_paid RPC
                ↓
                payment_status='paid'
                stock 실제 차감, reserved_stock 복구
                트리거가 donation_total 자동 갱신
            ↓
24h 무입금 → cron이 expire_pending_orders 호출
            ↓
            payment_status='expired', reserved_stock 복구
```

### 경매 흐름
```
관리자 경매 등록 → esg_auctions (status='scheduled')
                ↓
시작 시각 도달 → cron이 status='active'로 전환 (별도 cron 또는 trigger)
              ↓
사용자 입찰 → place_bid RPC 호출
            ↓
            RPC 내부 (advisory lock):
              1. FOR UPDATE로 경매 row lock
              2. 시간/상태/금액 검증
              3. esg_auction_bids INSERT
              4. 경매 current_price/bidder 갱신
            ↓
            클라이언트 Realtime 구독으로 실시간 갱신
            ↓
종료 시각 도달 → cron이 finalize_auction 호출
              ↓
              winner 확정 + 낙찰자용 esg_orders 자동 생성
              ↓
              이후는 바자회와 동일 (입금 안내 → mark_order_paid)
```

## 🛠 다음 단계 (Phase 0-2 이후)

이 마이그레이션 적용 후:
1. **Phase 0-2**: 프로젝트 초기 셋업 (Vite + TS + MSAL + Supabase client)
2. **Phase 0-3**: 인증 + 라우팅 + AuthGate
3. **Phase 1**: 홈화면 + 페이즈별 분기
4. **Phase 2**: Posting (게시글 CRUD + 좋아요 + 댓글)
5. **Phase 3**: 바자회 + 결제
6. **Phase 4**: 경매 (가장 어려움)
7. **Phase 5**: 마이페이지 + 어드민
8. **Phase 6**: 디자인 적용 (피그마)
9. **Phase 7**: QA + 런칭
