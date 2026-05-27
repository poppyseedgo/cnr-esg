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

export type EsgOrderType = 'bazaar' | 'auction';

export type EsgPaymentStatus =
  | 'pending'
  | 'paid'
  | 'cancelled'
  | 'refunded'
  | 'expired';

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
  created_at: string;
}

export interface EsgPostImageInsert {
  post_id: string;
  image_url: string;
  sort_order: number;
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

export interface EsgProductRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  reserved_stock: number;
  thumbnail_url: string | null;
  detail_images: string[]; // jsonb array
  status: EsgProductStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

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
  created_at: string;
  updated_at: string;
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
  images: Array<{ id: string; url: string; sort_order: number }>;
}

/** esg_donation_stats — 실시간 모금 현황 */
export interface EsgDonationStatsRow {
  total_raised: number;
  total_paid_orders: number;
  total_participants: number;
  bazaar_raised: number;
  auction_raised: number;
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
  | 'donation_paid';

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
        Insert: Omit<EsgProductRow, 'id' | 'created_at' | 'updated_at' | 'reserved_stock'> & {
          id?: string;
          reserved_stock?: number;
        };
        Update: Partial<EsgProductRow>;
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
        Insert: Omit<EsgAuctionRow, 'id' | 'created_at' | 'updated_at' | 'current_price' | 'current_bidder_id' | 'current_bidder_email' | 'bid_count'> & {
          id?: string;
          current_price?: number;
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
      expire_pending_donations: {
        Args: Record<string, never>;
        Returns: number;
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
  | 'post_new_comment';

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
