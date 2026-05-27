-- ============================================================================
-- HOTFIX: activity_periods 설정 추가 (활동별 기간 분리)
--
-- 배경:
--   기존 event_phase(prelude/shop_open/shop_closed/archived) 단일 페이즈로는
--   5개 활동(ESG 아이디어, 제로 웨이스트, 슬기로운 사회 생활, 바자회, 경매)이
--   각각 다른 기간을 갖는 요구사항을 표현할 수 없음.
--
-- 해결:
--   esg_settings에 'activity_periods' 단일 jsonb 키 추가.
--   5개 활동의 시작/종료 시각 + 시상일을 모두 한 곳에서 관리 (SSOT).
--
-- 기본값 (사용자 명시 기간 + KST 09:00 시작 / 18:00 종료 가정):
--   ESG 아이디어:           6/8 09:00 ~ 7/10 18:00
--   제로 웨이스트 어워드:    6/8 09:00 ~ 6/30 18:00 (6/30 시상)
--   슬기로운 사회 생활 어워드: 6/8 09:00 ~ 6/30 18:00 (6/30 시상)
--   바자회:                 6/30 09:00 ~ 7/10 18:00 (시간 미정, 기본값)
--   경매:                   6/30 09:00 ~ 7/10 18:00 (시간 미정, 기본값)
--
-- UTC 변환: KST = UTC + 9h
--   KST 09:00 → UTC 00:00 (같은 날)
--   KST 18:00 → UTC 09:00 (같은 날)
--
-- 어드민이 esg_settings UPDATE로 변경 가능.
-- ============================================================================

INSERT INTO esg_settings (key, value) VALUES
  ('activity_periods', '{
    "esg_idea": {
      "label": "ESG 아이디어",
      "starts_at_kst": "2026-06-08T09:00:00+09:00",
      "ends_at_kst": "2026-07-10T18:00:00+09:00",
      "starts_at_utc": "2026-06-08T00:00:00Z",
      "ends_at_utc": "2026-07-10T09:00:00Z"
    },
    "zero_waste": {
      "label": "제로 웨이스트 어워드",
      "starts_at_kst": "2026-06-08T09:00:00+09:00",
      "ends_at_kst": "2026-06-30T18:00:00+09:00",
      "starts_at_utc": "2026-06-08T00:00:00Z",
      "ends_at_utc": "2026-06-30T09:00:00Z",
      "awards_date_kst": "2026-06-30",
      "note": "종료기간 변동 가능, 6월 30일 행사에서 시상"
    },
    "wise_life": {
      "label": "슬기로운 사회 생활 어워드",
      "starts_at_kst": "2026-06-08T09:00:00+09:00",
      "ends_at_kst": "2026-06-30T18:00:00+09:00",
      "starts_at_utc": "2026-06-08T00:00:00Z",
      "ends_at_utc": "2026-06-30T09:00:00Z",
      "awards_date_kst": "2026-06-30",
      "note": "종료기간 변동 가능, 6월 30일 행사에서 시상"
    },
    "bazaar": {
      "label": "ESG 온라인 바자회",
      "starts_at_kst": "2026-06-30T09:00:00+09:00",
      "ends_at_kst": "2026-07-10T18:00:00+09:00",
      "starts_at_utc": "2026-06-30T00:00:00Z",
      "ends_at_utc": "2026-07-10T09:00:00Z",
      "note": "시간 미정 — 어드민에서 정확한 시각 설정 필요"
    },
    "auction": {
      "label": "ESG 온라인 경매",
      "starts_at_kst": "2026-06-30T09:00:00+09:00",
      "ends_at_kst": "2026-07-10T18:00:00+09:00",
      "starts_at_utc": "2026-06-30T00:00:00Z",
      "ends_at_utc": "2026-07-10T09:00:00Z",
      "note": "시간 미정 — 어드민에서 정확한 시각 설정 필요"
    }
  }'::jsonb)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

-- ============================================================================
-- 검증
-- ============================================================================
-- 적용 후 확인:
--   SELECT value FROM esg_settings WHERE key = 'activity_periods';
--
-- 각 활동의 KST 종료일 한눈에 보기:
--   SELECT
--     key as activity,
--     value->>'label' as label,
--     value->>'starts_at_kst' as starts,
--     value->>'ends_at_kst' as ends
--   FROM esg_settings, jsonb_each(value) AS t(key, value)
--   WHERE esg_settings.key = 'activity_periods';
