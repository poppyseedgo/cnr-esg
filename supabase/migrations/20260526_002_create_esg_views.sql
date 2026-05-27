-- ============================================================================
-- C&R ESG Event — Public Views (익명 처리)
-- 원칙:
--   - 일반 사용자는 view만 SELECT (user_id/이름 마스킹 자동 적용)
--   - 본인 마이페이지 → raw 테이블 직접 (RLS의 user_id = auth.uid())
--   - 관리자 → raw 테이블 직접 (RLS의 is_admin())
-- ============================================================================

-- ============================================================================
-- esg_posts_public — 게시글 공개용 view
-- 익명 게시물일 때 user_id/email/name/dept 마스킹
-- ============================================================================
CREATE OR REPLACE VIEW esg_posts_public AS
SELECT
  p.id,
  p.category,
  CASE WHEN p.is_anonymous THEN NULL ELSE p.user_id END AS user_id,
  CASE WHEN p.is_anonymous THEN NULL ELSE p.user_email END AS user_email,
  CASE WHEN p.is_anonymous THEN '익명' ELSE p.user_name_snapshot END AS user_name,
  CASE WHEN p.is_anonymous THEN NULL ELSE p.user_dept_snapshot END AS user_dept,
  p.is_anonymous,
  p.title,
  p.content,
  p.cover_image_url,
  p.status,
  p.like_count,
  p.comment_count,
  p.created_at,
  p.updated_at
FROM esg_posts p
WHERE p.status = 'published';

COMMENT ON VIEW esg_posts_public IS '일반 사용자용 게시글 view. 익명일 때 user_id/email/이름/부서 NULL 처리.';

-- ============================================================================
-- esg_comments_public — 댓글 공개용 view (동일 정책)
-- ============================================================================
CREATE OR REPLACE VIEW esg_comments_public AS
SELECT
  c.id,
  c.post_id,
  CASE WHEN c.is_anonymous THEN NULL ELSE c.user_id END AS user_id,
  CASE WHEN c.is_anonymous THEN NULL ELSE c.user_email END AS user_email,
  CASE WHEN c.is_anonymous THEN '익명' ELSE c.user_name_snapshot END AS user_name,
  CASE WHEN c.is_anonymous THEN NULL ELSE c.user_dept_snapshot END AS user_dept,
  c.is_anonymous,
  c.content,
  c.status,
  c.created_at,
  c.updated_at
FROM esg_comments c
WHERE c.status = 'published';

COMMENT ON VIEW esg_comments_public IS '일반 사용자용 댓글 view. 익명일 때 user_id/email/이름/부서 NULL 처리.';

-- ============================================================================
-- esg_posts_with_images — 게시글 + 이미지 배열 JOIN view
-- 카드 리스트에서 1쿼리로 대표이미지+모든이미지 가져오기 위한 편의 view
-- ============================================================================
CREATE OR REPLACE VIEW esg_posts_with_images AS
SELECT
  p.*,
  COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object('id', i.id, 'url', i.image_url, 'sort_order', i.sort_order)
             ORDER BY i.sort_order)
      FROM esg_post_images i
      WHERE i.post_id = p.id
    ),
    '[]'::jsonb
  ) AS images
FROM esg_posts_public p;

COMMENT ON VIEW esg_posts_with_images IS 'esg_posts_public + 이미지 배열. 카드 리스트/상세 페이지 1쿼리 조회용.';

-- ============================================================================
-- esg_donation_stats — 실시간 모금 현황 (그래픽 위젯에서 구독)
-- ============================================================================
CREATE OR REPLACE VIEW esg_donation_stats AS
SELECT
  COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0) AS total_raised,
  COUNT(*) FILTER (WHERE payment_status = 'paid') AS total_paid_orders,
  COUNT(DISTINCT user_id) FILTER (WHERE payment_status = 'paid') AS total_participants,
  COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid' AND order_type = 'bazaar'), 0) AS bazaar_raised,
  COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid' AND order_type = 'auction'), 0) AS auction_raised
FROM esg_orders;

COMMENT ON VIEW esg_donation_stats IS '실시간 모금 현황 통계. 그래픽 위젯이 이 view를 구독해서 사용.';

-- ============================================================================
-- VIEW 권한 부여
-- ============================================================================
GRANT SELECT ON esg_posts_public TO anon, authenticated;
GRANT SELECT ON esg_comments_public TO anon, authenticated;
GRANT SELECT ON esg_posts_with_images TO anon, authenticated;
GRANT SELECT ON esg_donation_stats TO anon, authenticated;
