-- ============================================================================
-- HOTFIX: esg_is_admin() 함수 정정 (profiles 스키마 확인 후)
--
-- 적용 대상:
--   003_create_esg_rls.sql 을 이미 적용한 경우, 함수만 교체.
--   아직 003을 적용하지 않았으면 이 파일 불필요 (003에 이미 반영됨).
--
-- 변경 이력:
--   v1: is_admin 컬럼 → role 컬럼 + is_active 체크
--   v2: role 값 'admin' → 'ADMIN' 대문자 확정
--       (2026-05-26 실제 DB 확인: USER 517명, ADMIN 8명)
-- ============================================================================

CREATE OR REPLACE FUNCTION esg_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- ← profiles.role='ADMIN' AND is_active=true (2026-05-26 정정)
  SELECT COALESCE(
    (SELECT role = 'ADMIN' AND is_active = true
     FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

COMMENT ON FUNCTION esg_is_admin() IS '관리자 판정: profiles.role=''ADMIN'' AND is_active=true';

-- ============================================================================
-- 검증: 본인이 admin으로 인식되는지 확인
-- ============================================================================
-- 적용 후 본인 계정으로 실행:
--   SELECT esg_is_admin();
-- 결과가 true면 정상.
