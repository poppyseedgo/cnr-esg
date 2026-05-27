-- ============================================================================
-- C&R ESG Event — Initial Seed Data
-- 이벤트 기간: KST 2026-06-30 09:00 ~ 2026-07-10 18:00
-- ============================================================================

-- KST 09:00 = UTC 00:00, KST 18:00 = UTC 09:00
-- 바자회/경매 시작: 2026-06-30T09:00 KST = 2026-06-30T00:00 UTC
-- 바자회/경매 종료: 2026-07-10T18:00 KST = 2026-07-10T09:00 UTC

INSERT INTO esg_settings (key, value) VALUES
  -- 이벤트 기간
  ('event_period', '{"starts_at_kst":"2026-06-30T09:00:00+09:00","ends_at_kst":"2026-07-10T18:00:00+09:00","starts_at_utc":"2026-06-30T00:00:00Z","ends_at_utc":"2026-07-10T09:00:00Z"}'::jsonb),
  ('shop_opens_at', '"2026-06-30T00:00:00Z"'::jsonb),
  ('shop_closes_at', '"2026-07-10T09:00:00Z"'::jsonb),

  -- 이벤트 페이즈: prelude → shop_open → shop_closed → archived
  -- prelude: 이벤트 시작 전 (게시판만 활성, 구매/경매 비활성)
  -- shop_open: 이벤트 진행 중 (모두 활성)
  -- shop_closed: 구매/경매 종료 후 (게시판/조회만 가능, 결과 페이지 부각)
  -- archived: 완전 종료 (읽기 전용)
  ('event_phase', '"prelude"'::jsonb),

  -- 기능 토글
  ('posts_enabled', 'true'::jsonb),
  ('comments_enabled', 'true'::jsonb),

  -- 모금 트래킹
  ('donation_total', '0'::jsonb),      -- 자동 계산 (트리거)
  ('donation_goal', '5000000'::jsonb), -- 목표 모금액 (수정 가능)

  -- 입금 안내 계좌 (실제 운영 전 반드시 변경)
  ('bank_account_info', '{"bank":"신한은행","account":"110-XXX-XXXXXX","holder":"씨엔알리서치(주)","memo":"입금자명에 주문번호 포함 부탁드립니다"}'::jsonb),

  -- 주문 만료 시간 (시간 단위)
  ('order_expire_hours', '24'::jsonb),

  -- 사이트 공지사항 (홈화면 상단 배너)
  ('homepage_notice', '{"title":"C&R 29주년 창립기념일 ESG 이벤트","subtitle":"2026.06.30 ~ 07.10","description":"굿즈 판매 수익금 전부 생명의 숲에 기부됩니다."}'::jsonb)
ON CONFLICT (key) DO NOTHING;
