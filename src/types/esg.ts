// ============================================================================
// C&R ESG Event - Database 타입 정의
//
// 원칙:
//   - DB 컬럼은 snake_case (예: user_id, created_at) — DB 스키마와 1:1 매칭
//   - 프론트엔드 도메인 타입은 별도 (도메인 모델 섹션 참조)
//   - 모든 RPC 함수의 입력/출력도 타입 정의
//   - DB enum 값은 union 타입으로 표현
//
// 변경 시 주의:
//   - DB 스키마 변경 시 이 파일도 동시 수정 (Single Source of Truth)
//   - 자동 생성 도구 사용 시: supabase gen types typescript --project-id jjzcqpbwkkujttwxksvy
// ============================================================================

// ============================================================================
// Enum 값들 (DB CHECK 제약과 일치)
// ============================================================================

export type EsgPostCategory = 'zero_waste' | 'wise_life';

export type EsgPostStatus = 'published' | 'deleted' | 'hidden';

export type EsgCommentStatus = 'published' | 'deleted' | 'hidden';

export type EsgProductStatus = 'on_sale' | 'sold_out' | 'hidden';

/** [2026-07-07] 상품/태그 섹션 구분자 — 바자회(기부물품) / 굿즈(상시 판매 굿즈).
 *  esg_products·esg_tags 공유, 커머스 테이블은 product_id로 section 무관 동작. */
export type EsgProductSection = 'bazaar' | 'goods';

/** [2026-07-07] 굿즈 결제 방식: 일반결제 | 펀딩(All-or-Nothing pre-order) */
export type EsgPurchaseType = 'normal' | 'funding';
/** 펀딩 목표 기준 */
export type EsgFundingGoalType = 'amount' | 'quantity';
/** 펀딩 진행 상태(마감 후 확정) */
export type EsgFundingStatus = 'live' | 'succeeded' | 'failed';

export type EsgOrderType = 'bazaar' | 'auction' | 'goods'; // ← [2026-07-07] 굿즈 주문 분리

export type EsgPaymentStatus =
  | 'pending'
  | 'paid'
  | 'cancelled'
  | 'refunded'
  | 'expired'
  | 'pledged'; // ← [2026-07-07] 펀딩 참여(예약, 결제 전). 마감 달성 시 pending 전환 / 미달 시 cancelled

export type EsgPaymentMethod = 'bank_transfer';

export type EsgAuctionStatus = 'scheduled' | 'active' | 'ended' | 'cancelled';

export type EsgWishlistTargetType = 'product' | 'auction';

export type EsgEventPhase =
  | 'prelude' // 시작 전 (게시판만 활성)
  | 'shop_open' // 진행 중 (모두 활성)
  | 'shop_closed' // 구매/경매 종료 (조회/결과만)
  | 'archived'; // 완전 종료 (읽기 전용)

// ============================================================================
// Activity (활동별 기간)
//
// 4개 활동이 각자 다른 기간:
//   - zero_waste:  6/8 ~ 6/30 (6/30 시상)
//   - wise_life:   6/8 ~ 6/30 (6/30 시상)
//   - bazaar:      6/30 ~ 7/10
//   - auction:     6/30 ~ 7/10
//
// esg_settings.activity_periods 단일 jsonb 키로 통합 관리.
// 어드민이 한 폼에서 모두 편집 가능 (Phase 5).
// ============================================================================

export type EsgActivityKey =
  | 'zero_waste'
  | 'wise_life'
  | 'bazaar'
  | 'auction';

export type EsgActivityStatus = 'before' | 'active' | 'closed';

export interface EsgActivityPeriod {
  label: string;
  starts_at_kst: string;
  ends_at_kst: string;
  starts_at_utc: string;
  ends_at_utc: string;
  /** 시상일 (zero_waste, wise_life 등 어워드성 활동) */
  awards_date_kst?: string;
  /** 운영자 메모 */
  note?: string;
}

export type EsgActivityPeriods = Partial<Record<EsgActivityKey, EsgActivityPeriod>>;

// ============================================================================
// Profiles (C&R Space와 공유, 외부 테이블)
// ============================================================================

export interface ProfileRow {
  id: string; // uuid
  email: string;
  name: string;
  dept: string | null;
  role: 'USER' | 'ADMIN'; // ← 대문자 (2026-05-26 실제 DB 확인)
  employee_id: string | null;
  azure_user_id: string | null;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
}

// ============================================================================
// esg_settings
// ============================================================================

export interface EsgSettingsRow {
  key: string;
  value: unknown; // jsonb - 각 key별 타입은 아래 EsgSettingsValueMap 참조
  updated_at: string;
  updated_by: string | null;
}

/**
 * esg_settings의 key별 value 타입 매핑.
 * 사용 예: getSetting<EsgSettingsValueMap['event_phase']>('event_phase')
 */
export interface EsgSettingsValueMap {
  event_period: {
    starts_at_kst: string;
    ends_at_kst: string;
    starts_at_utc: string;
    ends_at_utc: string;
  };
  shop_opens_at: string;
  shop_closes_at: string;
  event_phase: EsgEventPhase;
  posts_enabled: boolean;
  comments_enabled: boolean;
  /** 바자회 구매 차단 토글 (어드민 비상 차단용, 기본 true) */
  purchase_enabled: boolean;
  /** 경매 입찰 차단 토글 (어드민 비상 차단용, 기본 true) */
  bids_enabled: boolean;
  donation_total: number;
  donation_goal: number;
  bank_account_info: {
    bank: string;
    account: string;
    holder: string;
    memo?: string;
  };
  order_expire_hours: number;
  order_expire_minutes: number; // ← [2026-06-25] 바자회 주문 입금 만료(분). 15분 정책.
  homepage_notice: {
    title: string;
    subtitle: string;
    description: string;
  };
  /**
   * 4개 활동(제로 웨이스트 / 슬기로운 사회 생활 / 바자회 / 경매)의
   * 시작·종료 시각을 한 곳에서 관리. SSOT. 어드민이 변경 가능.
   */
  activity_periods: EsgActivityPeriods;
  /**
   * 바자회 전 직원 공개 판매 시작 시각 (UTC ISO). // ← [2026-06-25] 물품 기부자 선판매 정책
   * 선판매 시작(=activity_periods.bazaar.starts_at_utc) ~ 이 시각 사이엔 물품 기부자만 구매 가능,
   * 이 시각부터 전 직원 구매 가능. 미설정 시 선판매 정책 비활성(기존 동작 폴백).
   */
  bazaar_public_sale_starts_at: string;
  /**
   * 바자회 일일 구매 운영 시작 시각(KST, 0~23). 기본 7(=07:00).
   * 이 시각부터 구매 가능. resolveDailyHours/서버 트리거가 동일 값 사용. // ← [2026-06-29]
   */
  bazaar_daily_open_hour: number;
  /**
   * 바자회 일일 구매 운영 종료 시각(KST, 1~24, exclusive). 기본 21(=21:00).
   * 이 시각부터 구매 불가(예: 21이면 20:59:59까지 가능). // ← [2026-06-29]
   */
  bazaar_daily_close_hour: number;
  /** 바자회 상단 운영시간 공지바 표시 여부. 기본 true. // ← [2026-06-29] */
  bazaar_notice_bar_enabled: boolean;
  /**
   * 공지바 표시 조건. 'always'=운영 중/외 항상, 'closed_only'=운영시간 외에만. 기본 'always'.
   * // ← [2026-06-29]
   */
  bazaar_notice_bar_show_when: 'always' | 'closed_only';
  /**
   * 공지바 안내 문구. {open}/{close} 토큰이 운영 시작/종료 시각(예: "오전 7시")으로 치환됨.
   * 빈 값이면 기본 문구 사용. 카운트다운은 자동으로 뒤에 붙음. // ← [2026-06-29]
   */
  bazaar_notice_bar_message: string;
  /** 바자회/경매 상품 상세 페이지의 "상품 수령" 탭에 표시되는 공통 안내 (markdown) */
  delivery_info: string;
  /**
   * 바자회 참여 물품 가이드 (홈 포스터 모달 본문).
   * 구조는 고정, 텍스트만 어드민에서 편집 가능.
   * 데이터 없으면 BazaarGuide 컴포넌트의 기본값 폴백.
   */
  bazaar_guide: EsgBazaarGuide;
}

/** 바자회 가이드 — 텍스트 편집 가능한 필드 모음 */
export interface EsgBazaarGuide {
  /** 기본 원칙 강조 박스 (highlight = 굵게 강조 부분, subtitle = 둘째 줄) */
  principle: {
    highlight: string;
    subtitle: string;
  };
  /** 물품별 기부 기준 카드 10종 — 순서 고정 */
  categories: Array<{
    /** 카테고리 식별자 (고정, 변경 금지) */
    id: string;
    /** 표시 이름 (편집 가능) */
    name: string;
    /** 신규 배지 표시 여부 (편집 가능) */
    isNew: boolean;
    /** 가능 기준 텍스트 (편집 가능) */
    allowed: string;
    /** 불가 기준 텍스트 (편집 가능) */
    disallowed: string;
  }>;
  /** 공통 불가 기준 5개 항목 (텍스트만 편집) */
  commonDisallowed: string[];
  /** 기부 접수 절차 3단계 */
  steps: Array<{
    title: string;
    /** 부가 설명 (없으면 빈 문자열) */
    desc: string;
  }>;
  /** 하단 자원순환 ESG 메시지 (highlight = 굵게 강조 부분) */
  footerMessage: {
    text: string;
    highlight: string;
  };
}

export type EsgSettingsKey = keyof EsgSettingsValueMap;

// ============================================================================
// esg_posts
// ============================================================================

export interface EsgPostRow {
  id: string;
  category: EsgPostCategory;
  user_id: string | null;
  user_email: string;
  user_name_snapshot: string;
  user_dept_snapshot: string | null;
  is_anonymous: boolean;
  title: string;
  content: string;
  cover_image_url: string | null;
  status: EsgPostStatus;
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

export interface EsgPostInsert {
  id?: string;
  category: EsgPostCategory;
  user_id?: string | null;
  user_email: string;
  user_name_snapshot: string;
  user_dept_snapshot?: string | null;
  is_anonymous?: boolean;
  title: string;
  content: string;
  cover_image_url?: string | null;
  status?: EsgPostStatus;
}

export interface EsgPostUpdate {
  category?: EsgPostCategory;
  is_anonymous?: boolean;
  title?: string;
  content?: string;
  cover_image_url?: string | null;
  status?: EsgPostStatus;
}

// ============================================================================
// esg_post_images
// ============================================================================

export interface EsgPostImageRow {
  id: string;
  post_id: string;
  image_url: string;
  sort_order: number; // 0~2
  focus_x: number; // ← [2026-06-11] 썸네일 크롭 기준점 X(0~100%)
  focus_y: number; // ← [2026-06-11] 썸네일 크롭 기준점 Y(0~100%)
  created_at: string;
}

export interface EsgPostImageInsert {
  post_id: string;
  image_url: string;
  sort_order: number;
  focus_x?: number; // ← [2026-06-11] 미지정 시 DB default 50(중앙)
  focus_y?: number; // ← [2026-06-11] 미지정 시 DB default 50(중앙)
}

// ============================================================================
// esg_post_likes
// ============================================================================

export interface EsgPostLikeRow {
  post_id: string;
  user_id: string;
  user_email: string;
  created_at: string;
}

// ============================================================================
// esg_comments
// ============================================================================

export interface EsgCommentRow {
  id: string;
  post_id: string;
  user_id: string | null;
  user_email: string;
  user_name_snapshot: string;
  user_dept_snapshot: string | null;
  is_anonymous: boolean;
  content: string;
  status: EsgCommentStatus;
  created_at: string;
  updated_at: string;
}

export interface EsgCommentInsert {
  post_id: string;
  user_id?: string | null;
  user_email: string;
  user_name_snapshot: string;
  user_dept_snapshot?: string | null;
  is_anonymous?: boolean;
  content: string;
}

// ============================================================================
// esg_products
// ============================================================================

/** 커스텀 라벨 1개(텍스트+색). label_text/bg/color=라벨1, extra_labels[]=라벨2·3(굿즈). */ // ← [2026-07-09]
export interface EsgProductLabel {
  text: string;
  bg: string;    // #rrggbb (빈 문자열이면 기본색)
  color: string; // #rrggbb
}

export interface EsgProductRow {
  id: string;
  name: string;
  description: string | null;
  short_description: string | null; // ← [2026-07-08] 상세 상단 '간단 설명'(마크다운 아님, 1~2줄)
  price: number;
  stock: number;
  reserved_stock: number;
  thumbnail_url: string | null;
  detail_images: string[]; // jsonb array
  status: EsgProductStatus;
  sort_order: number;
  is_pinned: boolean;         // ← [2026-06-17] 상품 고정(리스트 맨 앞). 최대 8개.
  is_new: boolean;            // ← [2026-06-09] "새 상품" 라벨(수동)
  sale_price: number | null;  // ← [2026-06-09] 세일가(수동). NULL=세일 아님. 앱에서 sale_price<price 일 때만 세일
  label_text: string | null;  // ← [2026-07-06] 커스텀 라벨 문구(NULL/공백=미표시) = 라벨1(전 섹션 공용)
  label_bg: string | null;    // ← [2026-07-06] 커스텀 라벨 배경색 HEX
  label_color: string | null; // ← [2026-07-06] 커스텀 라벨 폰트색 HEX
  extra_labels: EsgProductLabel[]; // ← [2026-07-09] 굿즈 추가 라벨(라벨2·3). 최대 2개. 바자회/경매 미사용([])
  section: EsgProductSection; // ← [2026-07-07] 'bazaar'(기본) | 'goods' — 목록/어드민 분리
  // ── [2026-07-07] 굿즈 Funding(All-or-Nothing pre-order) ──
  purchase_type: EsgPurchaseType;                 // 'normal'(기본) | 'funding'
  funding_goal_type: EsgFundingGoalType | null;   // 'amount' | 'quantity' (funding 일 때)
  funding_goal_amount: number | null;             // 목표 금액
  funding_goal_quantity: number | null;           // 목표 수량
  funding_deadline: string | null;                // 마감일 ISO
  funding_status: EsgFundingStatus | null;         // 'live'|'succeeded'|'failed' (마감 후 확정)
  payment_deadline: string | null;                // ← [2026-07-08] 결제(입금) 기한(절대 일시). 자동취소 없음
  created_at: string;
  updated_at: string;
  /** 클라이언트 보강(서버 컬럼 아님) — 리스트/상세에서 태그 표시용. // ← [2026-06-23] */
  tags?: EsgTagRow[];
}

// ============================================================================
// esg_tags / esg_product_tags — 상품 태그(워드프레스식 taxonomy)   // ← [추가 2026-06-22]
// ============================================================================

/** 태그 종류 — 카테고리(#유아용품) vs 브랜드(#나이키) // ← [2026-06-23] */
export type TagKind = 'category' | 'brand';

/** 태그 마스터 */   // ← [추가 2026-06-22]
export interface EsgTagRow {
  id: string;
  name: string;       // 표시 이름(한글 OK)
  slug: string;       // URL/필터 키 (UNIQUE)
  kind: TagKind;      // ← [2026-06-23] 카테고리/브랜드 구분
  section: EsgProductSection; // ← [2026-07-07] 'bazaar'(기본) | 'goods' — 섹션별 필터 칩 스코프
  sort_order: number; // 메뉴 정렬
  created_at: string;
}

/** 상품 ↔ 태그 매핑(다대다) */   // ← [추가 2026-06-22]
export interface EsgProductTagRow {
  product_id: string;
  tag_id: string;
  created_at: string;
}

/** esg_list_tags_with_count() 반환행 — 사용자 태그 메뉴용(공개 상품 카운트 포함) */   // ← [추가 2026-06-22]
export interface EsgTagWithCount {
  id: string;
  name: string;
  slug: string;
  kind: TagKind;        // ← [2026-06-23] 카테고리/브랜드 구분(클라이언트 병합)
  sort_order: number;
  product_count: number;
}

// ============================================================================
// esg_bazaar_intake — 바자회 물품 접수대장 (관리자 전용)   // ← [추가 2026-06-08]
// ============================================================================

/** 바자회 품목 카테고리 코드 (모달 '품목별 기준' 10종) */   // ← [추가]
export type BazaarCategory =
  | 'clothing'
  | 'electronics'
  | 'fashion'
  | 'household'
  | 'book'
  | 'baby'
  | 'sports'
  | 'stationery'
  | 'plant'
  | 'kitchen';

/** 접수 물품 게시 행선지 (바자회 상품 / 경매 물품) */   // ← [추가 2026-06-22] 경매행/바자회행 구분
export type EsgIntakeDestination = 'bazaar' | 'auction';

/** 접수 게시 상태 */   // ← [추가]
export type EsgBazaarIntakePublishStatus =
  | 'pending'      // 검수 대기
  | 'passed'       // 검수 완료(통과, 게시 전) // ← [추가 2026-06-08]
  | 'rejected'     // 검수 탈락               // ← [추가 2026-06-08]
  | 'published'    // 게시 중
  | 'unpublished'; // 게시 중단

export interface EsgBazaarIntakeRow {   // ← [추가]
  id: string;
  name: string;
  category: BazaarCategory;
  donor_id: string | null;            // 임직원 profiles.id (외부면 null)
  donor_name_snapshot: string;        // 검색 시점 이름 스냅샷
  donor_dept_snapshot: string | null;
  original_price: number | null;      // 원래 가격(선택)
  listed_price: number;               // 책정 가격
  quantity: number;                   // 수량
  intake_photos: string[];            // 물건 사진(접수/검수 기록) — 최대 5장 // ← [수정 2026-06-08] 단일→배열
  publish_photo_url: string | null;   // 게시할 물건 사진(상품 썸네일)
  publish_status: EsgBazaarIntakePublishStatus;
  destination: EsgIntakeDestination;  // ← [추가 2026-06-22] 게시 행선지(bazaar=상품, auction=경매)
  product_id: string | null;          // 게시 시 연결되는 esg_products.id (바자회행)
  auction_id: string | null;          // ← [추가 2026-06-22] 게시 시 연결되는 esg_auctions.id (경매행)
  note: string | null;
  is_new: boolean;                    // ← [2026-06-17] 완전 새 상품(게시 시 상품 is_new로 전달)
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EsgBazaarIntakeInsert {   // ← [추가]
  name: string;
  category: BazaarCategory;
  donor_id: string | null;
  donor_name_snapshot: string;
  donor_dept_snapshot: string | null;
  original_price: number | null;
  listed_price: number;
  quantity: number;
  intake_photos: string[];            // ← [수정 2026-06-08] 단일→배열
  publish_photo_url: string | null;
  note: string | null;
  created_by: string | null;
  is_new?: boolean;                               // ← [2026-06-17] 기본 false
  destination?: EsgIntakeDestination;             // ← [추가 2026-06-22] 기본 'bazaar'
  publish_status?: EsgBazaarIntakePublishStatus;  // 기본 'pending'
}

export type EsgBazaarIntakeUpdate = Partial<   // ← [추가]
  Pick<
    EsgBazaarIntakeRow,
    | 'name'
    | 'category'
    | 'donor_id'
    | 'donor_name_snapshot'
    | 'donor_dept_snapshot'
    | 'original_price'
    | 'listed_price'
    | 'quantity'
    | 'intake_photos'
    | 'publish_photo_url'
    | 'note'
    | 'publish_status'
    | 'destination'   // ← [추가 2026-06-22] 행선지 수정 허용
    | 'product_id'
    | 'auction_id'    // ← [추가 2026-06-22] 경매 연결 수정 허용
  >
>;

// ============================================================================
// esg_cart_items
// ============================================================================

export interface EsgCartItemRow {
  id: string;
  user_id: string;
  user_email: string;
  product_id: string;
  quantity: number;
  added_at: string;
  updated_at: string;
}

export interface EsgCartItemInsert {
  user_id: string;
  user_email: string;
  product_id: string;
  quantity: number;
}

// ============================================================================
// esg_orders
// ============================================================================

export interface EsgOrderRow {
  id: string;
  order_number: string;
  order_type: EsgOrderType;
  user_id: string | null;
  user_email: string;
  user_name_snapshot: string;
  user_dept_snapshot: string | null;
  total_amount: number;
  payment_status: EsgPaymentStatus;
  payment_method: EsgPaymentMethod;
  payer_name: string | null;
  bank_account_used: string | null;
  memo: string | null;
  admin_memo: string | null;
  paid_at: string | null;
  paid_by: string | null;
  received_at: string | null; // ← [2026-07-10] 물품 수령완료 시각(관리자 토글). NULL=미수령
  cancelled_at: string | null;
  cancelled_reason: string | null;
  cancelled_by: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// esg_order_items
// ============================================================================

export interface EsgOrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  auction_id: string | null;
  product_name_snapshot: string;
  thumbnail_snapshot: string | null;
  price_snapshot: number;
  quantity: number;
  created_at: string;
}

// ============================================================================
// esg_auctions
// ============================================================================

export interface EsgAuctionRow {
  id: string;
  product_name: string;
  description: string | null;
  thumbnail_url: string | null;
  detail_images: string[];
  start_price: number;
  bid_unit: number;
  current_price: number;
  current_bidder_id: string | null;
  current_bidder_email: string | null;
  current_bidder_anonymous: boolean;
  bid_count: number;
  starts_at: string;
  ends_at: string;
  status: EsgAuctionStatus;
  winner_id: string | null;
  winner_email: string | null;
  winner_final_price: number | null;
  winner_order_id: string | null;
  sort_order: number;
  is_new: boolean;            // ← [2026-06-09] "새 상품" 라벨(수동)
  donor_id: string | null;            // ← [2026-07-06] 경매 물품 기부자(임직원 profiles.id, 외부/미지정 null)
  donor_name_snapshot: string | null; // ← [2026-07-06] 기부자 이름 스냅샷(표시 SSOT, null=미지정)
  donor_dept_snapshot: string | null; // ← [2026-07-06] 기부자 부서 스냅샷
  label_text: string | null;  // ← [2026-07-06] 커스텀 라벨 문구(NULL/공백=미표시)
  label_bg: string | null;    // ← [2026-07-06] 커스텀 라벨 배경색 HEX
  label_color: string | null; // ← [2026-07-06] 커스텀 라벨 폰트색 HEX
  created_at: string;
  updated_at: string;
  /** 클라이언트 보강(서버 컬럼 아님) — esg_auctions 기부자 컬럼 + esg_profile_public 아바타로 주입.
   *  물품 기부자 표시용(이름+아바타). 외부/미지정은 null. // ← [2026-07-06 뷰 의존 제거] */
  donor?: { name: string; avatar_url: string | null } | null;
}

// ============================================================================
// esg_auction_bids
// ============================================================================

export interface EsgAuctionBidRow {
  id: string;
  auction_id: string;
  user_id: string;
  user_email: string;
  user_name_snapshot: string;
  bid_amount: number;
  is_anonymous: boolean;
  created_at: string;
}

// ============================================================================
// esg_auction_bids_public — 익명 마스킹된 입찰 이력 view
// ============================================================================

export interface EsgAuctionBidPublicRow {
  id: string;
  auction_id: string;
  bid_amount: number;
  created_at: string;
  is_anonymous: boolean;
  /** 본인이 한 입찰인가 */
  is_self: boolean;
  /** 익명 + 타인이면 null, 본인이거나 익명 아니면 user_id */
  user_id: string | null;
  /** 익명 + 타인이면 null */
  user_email: string | null;
  /** 익명 + 타인이면 null. UI에서 anonymous_handle로 "익명 #N" 표시 */
  user_name_snapshot: string | null;
  /** 익명 + 타인일 때만 채워짐. 같은 user_id+auction_id에 대해 동일 hash (구분용) */
  anonymous_handle: string | null;
}

// ============================================================================
// esg_wishlists
// ============================================================================

export interface EsgWishlistRow {
  user_id: string;
  user_email: string;
  target_type: EsgWishlistTargetType;
  target_id: string;
  created_at: string;
}

// ← [2026-06-25] 상품별 "찜한 사람" 어드민 조회 결과 행.
//   esg_product_wishlist_users(p_product_id) RPC 가 profiles 조인 후 반환.
//   (RPC 가 SECURITY DEFINER + esg_is_admin() 가드로 RLS 우회 — adminWishlist.ts 참조)
export interface EsgWishlistUser {
  user_id: string;
  name: string | null;
  dept: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string; // 찜한 시각(UTC ISO)
}

// ← [추가 2026-06-26] 선구매 자격자 명단 한 행 (esg_list_presale_eligible RPC 반환).
//   자격 = 물품 기부자(esg_bazaar_intake.donor_id) OR 입금확인 기부자(esg_donations.payment_status='paid').
//   외부 기부자(donor_id IS NULL)는 로그인 불가 → 명단 제외(선구매 무의미).
//   (RPC 가 SECURITY DEFINER + esg_is_admin() 가드로 RLS 우회 — adminPresale.ts 참조)
export interface EsgPresaleEligibleRow {
  user_id: string;
  name: string | null;
  dept: string | null;
  email: string | null;
  is_active: boolean;
  is_item_donor: boolean;        // 물품 기부자 여부
  is_paid_donor: boolean;        // 입금확인(paid) 기부금 납부자 여부
  item_donation_count: number;   // 게시된 기부 물품 수
  paid_donation_count: number;   // 입금확인된 기부 건수
  paid_donation_total: number;   // 입금확인된 기부 합계(원)
  first_qualified_at: string | null; // 최초 자격 충족 시각(UTC ISO)
}

// ============================================================================
// Views
// ============================================================================

/** esg_posts_public — 익명 마스킹 적용된 게시글 view */
export interface EsgPostPublicRow {
  id: string;
  category: EsgPostCategory;
  user_id: string | null; // 익명이면 null
  user_email: string | null;
  user_name: string; // 익명이면 '익명'
  user_dept: string | null;
  is_anonymous: boolean;
  title: string;
  content: string;
  cover_image_url: string | null;
  status: EsgPostStatus;
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

/** esg_comments_public — 익명 마스킹 적용된 댓글 view */
export interface EsgCommentPublicRow {
  id: string;
  post_id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string;
  user_dept: string | null;
  is_anonymous: boolean;
  content: string;
  status: EsgCommentStatus;
  created_at: string;
  updated_at: string;
}

/** esg_posts_with_images — 게시글 + 이미지 배열 JOIN view */
export interface EsgPostWithImagesRow extends EsgPostPublicRow {
  images: Array<{ id: string; url: string; sort_order: number; focus_x: number; focus_y: number }>; // ← [2026-06-11] focus 추가
  excerpt: string; // ← [2026-06-18] 카드 미리보기용 발췌(앞 300자). 상세에선 content 사용.
}

/**
 * 목록(카드) 전용 행 — content를 제외해 페이로드 감소. 미리보기는 excerpt 사용.
 * loadPosts()가 반환. 상세는 EsgPostWithImagesRow(content 포함)를 사용.
 */
export type EsgPostCardRow = Omit<EsgPostWithImagesRow, 'content'>;

/** esg_donation_stats — 실시간 모금 현황 */
export interface EsgDonationStatsRow {
  total_raised: number;
  total_paid_orders: number;
  total_participants: number;
  bazaar_raised: number;
  auction_raised: number;
  donation_raised: number; // ← [2026-06-16 버그#3] 자발적 기부(paid) 합산
  donation_count: number;  // ← [2026-06-16 버그#3] 기부 완료 건수
}

// ============================================================================
// esg_email_outbox — 이메일 발송 outbox (어드민 감사용)
// ============================================================================

export type EsgEmailStatus = 'pending' | 'sent' | 'failed' | 'dead' | 'skipped';

export type EsgEmailTemplateKey =
  | 'bazaar_order_created'
  | 'bazaar_order_paid'
  | 'bazaar_payment_reminder'
  | 'bazaar_order_expired'
  | 'bazaar_order_cancelled'
  | 'auction_won'
  | 'auction_cancelled'
  | 'post_hidden'
  | 'donation_created'
  | 'donation_paid'
  | 'donation_certificate_resend'; // ← [2026-06-16] 인증서 재발송

export interface EsgEmailOutboxRow {
  id: string;
  idempotency_key: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  template_key: EsgEmailTemplateKey;
  template_data: Record<string, unknown>;
  status: EsgEmailStatus;
  retry_count: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  next_retry_at: string;
  related_order_id: string | null;
  related_auction_id: string | null;
  related_post_id: string | null;
}

// ============================================================================
// esg_profile_public — 인증 사용자가 다른 사용자의 공개 정보 조회용 view
// (RLS 우회 — profiles 테이블 직접 접근 대신 이 view 사용)
// ============================================================================

export interface EsgProfilePublicRow {
  id: string;
  name: string;
  dept: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

// ============================================================================
// RPC 함수 입출력 타입
// ============================================================================

export interface RpcResult<T = unknown> {
  success: boolean;
  error?: string;
  [key: string]: unknown;
  data?: T;
}

/** create_bazaar_order 입력 */
export interface CreateBazaarOrderInput {
  p_items: Array<{ product_id: string; quantity: number }>;
  p_memo?: string;
  p_clear_cart?: boolean;
}

/** create_bazaar_order 출력 */
export interface CreateBazaarOrderResult extends RpcResult {
  order_id?: string;
  order_number?: string;
  total_amount?: number;
  bank_account_info?: EsgSettingsValueMap['bank_account_info'];
  expires_at?: string;
}

/** place_bid 입력 */
export interface PlaceBidInput {
  p_auction_id: string;
  p_bid_amount: number;
  p_is_anonymous?: boolean;
}

/** place_bid 출력 */
export interface PlaceBidResult extends RpcResult {
  auction_id?: string;
  bid_amount?: number;
  new_current_price?: number;
  bid_count?: number;
  is_anonymous?: boolean;
  required_min?: number;
  current_price?: number;
  bid_unit?: number;
}

/** mark_order_paid 입력 */
export interface MarkOrderPaidInput {
  p_order_id: string;
  p_payer_name?: string;
  p_admin_memo?: string;
}

/** cancel_order 입력 */
export interface CancelOrderInput {
  p_order_id: string;
  p_reason?: string;
}

// ============================================================================
// Supabase Database 인터페이스 (createClient<Database> 용)
// ============================================================================

export interface Database {
  public: {
    Tables: {
      esg_settings: {
        Row: EsgSettingsRow;
        Insert: Omit<EsgSettingsRow, 'updated_at'> & { updated_at?: string };
        Update: Partial<Omit<EsgSettingsRow, 'key'>>;
        Relationships: [];
      };
      esg_posts: {
        Row: EsgPostRow;
        Insert: EsgPostInsert;
        Update: EsgPostUpdate;
        Relationships: [];
      };
      esg_post_images: {
        Row: EsgPostImageRow;
        Insert: EsgPostImageInsert;
        Update: Partial<EsgPostImageInsert>;
        Relationships: [];
      };
      esg_post_likes: {
        Row: EsgPostLikeRow;
        Insert: Omit<EsgPostLikeRow, 'created_at'>;
        Update: never;
        Relationships: [];
      };
      esg_comments: {
        Row: EsgCommentRow;
        Insert: EsgCommentInsert;
        Update: Partial<Pick<EsgCommentRow, 'content' | 'status' | 'is_anonymous'>>;
        Relationships: [];
      };
      esg_products: {
        Row: EsgProductRow;
        Insert: Omit<EsgProductRow, 'id' | 'created_at' | 'updated_at' | 'reserved_stock' | 'is_new' | 'sale_price' | 'extra_labels'> & { // ← [2026-07-09] extra_labels 제외(DB default [])
          id?: string;
          reserved_stock?: number;
          is_new?: boolean;            // ← [2026-06-09] 기본 false
          sale_price?: number | null;  // ← [2026-06-09] 기본 NULL
          extra_labels?: EsgProductLabel[]; // ← [2026-07-09] 기본 [] (DB default)
        };
        Update: Partial<EsgProductRow>;
        Relationships: [];
      };
      esg_bazaar_intake: {                                   // ← [추가 2026-06-08]
        Row: EsgBazaarIntakeRow;
        Insert: EsgBazaarIntakeInsert;
        Update: EsgBazaarIntakeUpdate;
        Relationships: [];
      };
      esg_tags: {                                            // ← [추가 2026-06-22] 태그 마스터
        Row: EsgTagRow;
        Insert: Omit<EsgTagRow, 'id' | 'created_at'> & { id?: string; sort_order?: number };
        Update: Partial<Pick<EsgTagRow, 'name' | 'slug' | 'sort_order'>>;
        Relationships: [];
      };
      esg_product_tags: {                                    // ← [추가 2026-06-22] 상품-태그 매핑
        Row: EsgProductTagRow;
        Insert: Omit<EsgProductTagRow, 'created_at'> & { created_at?: string };
        Update: never;  // 매핑은 RPC(esg_set_product_tags)로만 교체
        Relationships: [];
      };
      esg_cart_items: {
        Row: EsgCartItemRow;
        Insert: EsgCartItemInsert;
        Update: Partial<Pick<EsgCartItemRow, 'quantity'>>;
        Relationships: [];
      };
      esg_orders: {
        Row: EsgOrderRow;
        Insert: never; // RPC만 허용
        Update: Partial<EsgOrderRow>; // admin만 RLS 통과
        Relationships: [];
      };
      esg_order_items: {
        Row: EsgOrderItemRow;
        Insert: never; // RPC만 허용
        Update: never;
        Relationships: [];
      };
      esg_auctions: {
        Row: EsgAuctionRow;
        Insert: Omit<EsgAuctionRow, 'id' | 'created_at' | 'updated_at' | 'current_price' | 'current_bidder_id' | 'current_bidder_email' | 'bid_count' | 'is_new'> & {
          id?: string;
          current_price?: number;
          is_new?: boolean;  // ← [2026-06-09] 기본 false
        };
        Update: Partial<EsgAuctionRow>;
        Relationships: [];
      };
      esg_auction_bids: {
        Row: EsgAuctionBidRow;
        Insert: never; // place_bid RPC만 허용
        Update: never;
        Relationships: [];
      };
      esg_wishlists: {
        Row: EsgWishlistRow;
        Insert: Omit<EsgWishlistRow, 'created_at'>;
        Update: never;
        Relationships: [];
      };
      esg_email_outbox: {
        Row: EsgEmailOutboxRow;
        Insert: never; // 트리거 + cron만 INSERT (RLS도 차단)
        Update: never; // Edge Function (service key)만 UPDATE
        Relationships: [];
      };
    };
    Views: {
      esg_posts_public: { Row: EsgPostPublicRow; Relationships: [] };
      esg_comments_public: { Row: EsgCommentPublicRow; Relationships: [] };
      esg_posts_with_images: { Row: EsgPostWithImagesRow; Relationships: [] };
      esg_donation_stats: { Row: EsgDonationStatsRow; Relationships: [] };
      esg_profile_public: { Row: EsgProfilePublicRow; Relationships: [] };
      esg_auction_bids_public: { Row: EsgAuctionBidPublicRow; Relationships: [] };
    };
    Functions: {
      esg_is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      // ← [2026-06-25] 현재 로그인 사용자가 물품 기부자인지 판정 (선판매 정책). SECURITY DEFINER
      // ← [하위호환 2026-06-26] 선구매 자격 확장 후 esg_am_i_presale_eligible 로 대체됨. 기존 호출 안전망으로 유지.
      esg_am_i_item_donor: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      // ← [추가 2026-06-26] 현재 로그인 사용자가 선구매 자격자인지 판정 (물품 기부자 OR 입금확인 기부자). SECURITY DEFINER
      esg_am_i_presale_eligible: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      // ← [추가 2026-06-26] 어드민 전용 — 선구매 자격자 명단(사유/근거 수치 포함). esg_is_admin() 가드
      esg_list_presale_eligible: {
        Args: Record<string, never>;
        Returns: EsgPresaleEligibleRow[];
      };
      // ← [2026-06-19] 게시글 이미지 원자적 재구성 RPC (delete+insert+esg_posts 갱신 단일 트랜잭션)
      esg_update_post_with_images: {
        Args: {
          p_post_id: string;
          p_patch: Partial<{
            title: string;
            content: string;
            category: EsgPostCategory;
            is_anonymous: boolean;
            status: EsgPostStatus;
          }>;
          p_images: Array<{ url: string; sort_order: number; focus_x: number; focus_y: number }>;
        };
        Returns: { ok: boolean; removed_urls: string[]; cover_image_url: string | null };
      };
      create_bazaar_order: {
        Args: CreateBazaarOrderInput;
        Returns: CreateBazaarOrderResult;
      };
      place_bid: {
        Args: PlaceBidInput;
        Returns: PlaceBidResult;
      };
      mark_order_paid: {
        Args: MarkOrderPaidInput;
        Returns: RpcResult;
      };
      cancel_order: {
        Args: CancelOrderInput;
        Returns: RpcResult;
      };
      // [2026-06-23] 잘못된 입금확인 복구 — paid 주문 전용 (매출 원복)
      admin_revert_order_payment: {
        Args: { p_order_id: string; p_reason?: string };
        Returns: RpcResult & { new_status?: string };
      };
      admin_cancel_paid_order: {
        Args: { p_order_id: string; p_reason: string };
        Returns: RpcResult & { new_status?: string };
      };
      finalize_auction: {
        Args: { p_auction_id: string };
        Returns: RpcResult;
      };
      expire_pending_orders: {
        Args: Record<string, never>;
        Returns: RpcResult & { expired_count: number };
      };
      generate_order_number: {
        Args: Record<string, never>;
        Returns: string;
      };
      create_donation: {
        Args: {
          p_amount: number;
          p_payer_name: string | null;
          p_message: string | null;
          p_is_anonymous: boolean;
        };
        Returns: CreateDonationResult;
      };
      mark_donation_paid: {
        Args: {
          p_donation_id: string;
          p_payer_name: string | null;
          p_admin_memo: string | null;
        };
        Returns: MarkDonationPaidResult;
      };
      cancel_donation: {
        Args: { p_donation_id: string; p_reason: string | null };
        Returns: RpcResult;
      };
      delete_donation: {                                      // ← [2026-06-16 버그#2] 기부 영구 삭제(관리자)
        Args: { p_donation_id: string };
        Returns: RpcResult & { donation_id?: string; donation_number?: string };
      };
      resend_donation_certificate: {                          // ← [2026-06-16] 인증서 메일 재발송(관리자)
        Args: { p_donation_id: string };
        Returns: RpcResult & { idempotency_key?: string; to_email?: string };
      };
      set_donor_main_visibility: {                            // ← [2026-06-16 메인노출] override 설정
        Args: { p_subject_type: string; p_subject_key: string; p_show: boolean };
        Returns: RpcResult;
      };
      clear_donor_main_visibility: {                          // ← [2026-06-16 메인노출] override 해제(기본값)
        Args: { p_subject_type: string; p_subject_key: string };
        Returns: RpcResult;
      };
      set_donor_force_anonymous: {                            // ← [2026-06-17] 명단 익명 강제(money)
        Args: { p_subject_type: string; p_subject_key: string; p_anonymous: boolean };
        Returns: RpcResult;
      };
      get_main_item_donors: {                                 // ← [2026-06-16 메인노출] 공개 물품기부자 명단
        Args: Record<string, never>;
        Returns: { donor_name: string; donor_dept: string | null; avatar_url: string | null; is_anonymous: boolean; seed: string }[];
      };
      get_main_money_donors: {                                // ← [2026-06-16 메인노출] 공개 금액기부자 명단(익명 마스킹 포함)
        Args: Record<string, never>;
        Returns: { donor_name: string; donor_dept: string | null; avatar_url: string | null; is_anonymous: boolean; seed: string }[];
      };
      expire_pending_donations: {
        Args: Record<string, never>;
        Returns: number;
      };
      esg_publish_intake: {                                  // ← [추가 2026-06-08]
        Args: { p_intake_id: string };
        Returns: { success: boolean; product_id?: string; error?: string; reserved_stock?: number };
      };
      esg_unpublish_intake: {                                // ← [추가 2026-06-08]
        Args: { p_intake_id: string };
        Returns: { success: boolean; error?: string };
      };
      esg_publish_intake_auction: {                          // ← [추가 2026-06-22] 경매행 게시(경매 생성/재반영)
        Args: {
          p_intake_id: string;
          p_start_price: number;
          p_bid_unit: number;
          p_starts_at: string;
          p_ends_at: string;
        };
        Returns: { success: boolean; auction_id?: string; error?: string };
      };
      esg_upsert_tag: {                                      // ← [추가 2026-06-22] 태그 즉시 등록(있으면 반환)
        Args: { p_name: string };
        Returns: EsgTagRow;
      };
      esg_set_product_tags: {                                // ← [추가 2026-06-22] 상품 태그 일괄 교체
        Args: { p_product_id: string; p_tag_ids: string[] };
        Returns: undefined;
      };
      esg_list_tags_with_count: {                            // ← [추가 2026-06-22] 사용자 태그 메뉴용
        Args: Record<string, never>;
        Returns: EsgTagWithCount[];
      };
      esg_participant_names: {                               // ← [2026-07-14] 참여자 명단(이름/부서/유형만)
        Args: Record<string, never>;
        Returns: EsgParticipantNameRow[];
      };
      esg_track_page_view: {                                 // ← [2026-07-14] 자체 방문 로그 기록(공개)
        Args: { p_session_id: string; p_path: string; p_referrer?: string | null };
        Returns: undefined;
      };
      esg_visit_stats: {                                     // ← [2026-07-14] 기간별 방문 집계(어드민)
        Args: { p_from: string; p_to: string };
        Returns: Record<string, unknown>;
      };
      esg_event_stats: {                                     // ← [2026-07-14] 기간별 이벤트 집계(어드민)
        Args: { p_from: string; p_to: string };
        Returns: Record<string, unknown>;
      };
      esg_participant_roster: {                              // ← [2026-07-14] 참여자 역할별 명단(어드민)
        Args: Record<string, never>;
        Returns: Record<string, unknown>[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

/** esg_participant_names() 반환행 — 참여자 명단(금액·이메일 비노출) */ // ← [2026-07-14]
export interface EsgParticipantNameRow {
  person_key: string;
  display_name: string;
  dept: string | null;
  is_anonymous: boolean;
  kinds: ('purchase' | 'donation' | 'item')[] | null;
  first_at: string;
}

// ============================================================================
// 프론트엔드 도메인 모델 (Row + 파생 필드)
// ============================================================================

/** 게시글 + 작성자 정보 + 본인 좋아요 여부 (UI에서 사용) */
export interface EsgPost extends EsgPostWithImagesRow {
  /** 현재 사용자가 좋아요 눌렀는지 */
  liked_by_me?: boolean;
  /** 본인 게시글인지 (마이페이지 등에서 본명 표시 결정) */
  is_mine?: boolean;
}

/** 카운트다운 결과 */
export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isEnded: boolean;
}

/** 현재 인증된 사용자 (Supabase session + profiles JOIN) */
export interface CurrentUser {
  id: string; // profiles.id = auth.uid()
  email: string;
  name: string;
  dept: string | null;
  role: 'USER' | 'ADMIN';
  is_active: boolean;
  avatar_url: string | null;
}

// ============================================================================
// 기부 (Donation)
// ============================================================================

export type EsgDonationStatus = 'pending' | 'paid' | 'expired' | 'cancelled';

export interface EsgDonationRow {
  id: string;
  donation_number: string;
  user_id: string | null;
  user_email: string;
  user_name_snapshot: string;
  user_dept_snapshot: string | null;
  is_anonymous: boolean;
  amount: number;
  payer_name: string | null;
  message: string | null;
  payment_status: EsgDonationStatus;
  expires_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  admin_memo: string | null;
  created_at: string;
  updated_at: string;
}

/** esg_donations_public view (익명 마스킹) */
export interface EsgDonationPublicRow {
  id: string;
  donation_number: string;
  user_id: string | null;
  user_name: string;
  user_dept: string | null;
  is_anonymous: boolean;
  amount: number;
  message: string | null;
  payment_status: 'paid';
  paid_at: string;
  created_at: string;
}

export interface EsgDonationCertificateRow {
  id: string;
  donation_id: string;
  certificate_number: string;
  donor_name: string;
  donor_dept: string | null;
  amount: number;
  message: string | null;
  paid_at: string;
  issued_at: string;
}

/** create_donation 응답 */
export interface CreateDonationResult {
  success: boolean;
  error?: string;
  min?: number;
  max?: number;
  donation_id?: string;
  donation_number?: string;
  amount?: number;
  expires_at?: string;
  bank_info?: {
    bank: string;
    account: string;
    holder: string;
    memo?: string;
  };
}

/** mark_donation_paid 응답 */
export interface MarkDonationPaidResult {
  success: boolean;
  error?: string;
  donation_id?: string;
  certificate_number?: string;
  current_status?: string;
}

// ============================================================================
// 인앱 알림 (Phase 2)
// ============================================================================

export type EsgNotificationType =
  | 'bazaar_order_created'
  | 'bazaar_order_paid'
  | 'bazaar_payment_reminder'
  | 'bazaar_order_expired'
  | 'bazaar_order_cancelled'
  | 'auction_bid_placed'
  | 'auction_outbid'
  | 'auction_won'
  | 'auction_cancelled'
  | 'auction_ending_soon'
  | 'donation_created'
  | 'donation_paid'
  | 'wishlist_back_in_stock'
  | 'post_hidden'
  | 'post_new_comment'
  | 'product_qa_new'
  | 'product_qa_answered';

export interface EsgNotificationRow {
  id: string;
  user_id: string;
  user_email: string;

  type: EsgNotificationType;
  title: string;
  body: string | null;
  icon: string | null;
  link: string | null;

  related_order_id: string | null;
  related_auction_id: string | null;
  related_product_id: string | null;
  related_donation_id: string | null;
  related_post_id: string | null;

  is_read: boolean;
  read_at: string | null;

  created_at: string;
}

// ============================================================================
// 상품 Q&A (Phase 2 후속)
// ============================================================================

export interface EsgProductQuestionRow {
  id: string;
  product_type: 'bazaar' | 'auction';
  product_id: string;
  user_id: string;
  user_email: string;
  user_name_snapshot: string;
  body: string;
  status: 'open' | 'answered' | 'hidden';
  is_private: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface EsgProductQuestionAnswerRow {
  id: string;
  question_id: string;
  admin_id: string;
  admin_email: string;
  admin_name_snapshot: string;
  body: string;
  created_at: string;
  updated_at: string | null;
}

// ============================================================================
// FAQ + Q&A (행사 운영) — 상품 Q&A(esg_product_questions)와 별개 시스템
// 2026-06-01 신규
// ============================================================================

/** Q&A 카테고리 (5종, 문의하기 모달 라디오 선택지) */
export type EsgQnaCategory =
  | 'general'      // 일반
  | 'zero_waste'   // 제로 웨이스트 어워드
  | 'wise_life'    // 슬기로운 사회생활 어워드
  | 'bazaar'       // C&R 바자회
  | 'auction';     // C&R 경매

/** Q&A 카테고리 라벨 (Figma 풀네임) */
export const ESG_QNA_CATEGORY_LABELS: Record<EsgQnaCategory, string> = {
  general: '일반',
  zero_waste: '제로 웨이스트 어워드',
  wise_life: '슬기로운 사회생활 어워드',
  bazaar: 'C&R 바자회',
  auction: 'C&R 경매',
};

/** Q&A 카테고리 — 칩(목록 표시용) 약어 (Figma: 슬사생 어워드 등) */
export const ESG_QNA_CATEGORY_CHIP_LABELS: Record<EsgQnaCategory, string> = {
  general: '일반',
  zero_waste: '제로 웨이스트 어워드',
  wise_life: '슬사생 어워드',
  bazaar: 'C&R 바자회',
  auction: 'C&R 경매',
};

/** Q&A 질문 상태 */
export type EsgQnaQuestionStatus = 'pending' | 'answered' | 'hidden';

/** esg_faq row */
export interface EsgFaqRow {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/** esg_qna_questions row */
export interface EsgQnaQuestionRow {
  id: string;
  category: EsgQnaCategory;
  content: string;
  author_id: string;
  status: EsgQnaQuestionStatus;
  created_at: string;
}

/** esg_qna_answers row */
export interface EsgQnaAnswerRow {
  id: string;
  question_id: string;
  content: string;
  admin_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * 질문 + 답변 결합 (UI에서 자주 함께 쓰는 형태).
 * Q&A 목록 조회 API가 question + answer(optional)를 묶어 반환.
 */
export interface EsgQnaQuestionWithAnswer extends EsgQnaQuestionRow {
  answer: EsgQnaAnswerRow | null;
}

/**
 * 어드민 화면용 질문 상세 (작성자 프로필 포함).
 * 일반 사용자에게는 익명 노출이라 별도 타입.
 */
export interface EsgQnaQuestionWithAuthor extends EsgQnaQuestionRow {
  author: { id: string; name: string; dept: string | null; email: string } | null;
  answer: EsgQnaAnswerRow | null;
}
