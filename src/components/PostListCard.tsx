// ============================================================================
// CHANGELOG
//   2026-06-11
//     - [기능추가] 커버 썸네일 크롭 기준점 적용. cover_image_url 이 object-fit:cover
//         중앙 고정이라 세로/가로 사진의 끝이 잘리던 문제 → 커버 이미지의 focus_x/focus_y
//         (esg_post_images, 작성/수정 시 지정)를 object-position 으로 반영.
//         커버 focus = images 중 cover_image_url 일치 항목(없으면 images[0], 그래도 없으면 50/50).
//   2026-06-09
//     - [근본수정] 제목 2줄/본문 2줄일 때 본문 잘림 해결(모바일 동일).
//         원인: .post-card 가 height 고정(380/300)이라 worst-case 필요높이(약 407/357)를
//             못 담고, 상단 flex영역의 overflow:hidden 이 본문 2번째 줄을 클립.
//         해결: (1) index.css .post-card height→min-height(360/410)로 전환(콘텐츠 넘치면 늘어남).
//             (2) 제목 h3 / 본문 p(이미지카드)에 minHeight '2.8em'(=2줄) 부여 → 1줄 제목도
//                 항상 2줄 자리 예약 → 모든 카드 높이 균일 + 본문 위치 정렬.
//             (3) 상단 래퍼의 overflow:hidden 제거(잘림 주범). 텍스트 절단은 각 요소의
//                 WebkitLineClamp 가 담당하므로 래퍼 클립 불필요.
//   2026-06-07 (2)
//     - 푸터 아이콘 교체(Figma 1200:81 + 업로드 SVG): 댓글 chat.svg 24px(카운트 #64748b),
//         하트 heart.svg 32px(카운트 #111, liked=빨강). 순서 댓글→하트, 그룹 gap16.
//   2026-06-07
//     - [근본수정] 카드 하단 잘림 해결. 원인: 이미지 aspect-ratio가 넓은 카드에서
//         세로로 커져 고정높이(380)를 잠식 → 본문/푸터가 overflow에 잘림.
//         해결: 이미지 고정높이(.post-card__img 130/180), 콘텐츠 영역 내에서
//         상단(배지/제목/본문)=flex:1+overflow:hidden(넘치면 여기서만 잘림),
//         푸터=flex-shrink:0(구분선 borderTop 포함, 절대 잘리지 않음).
//   2026-06-05
//     - [변경] 카드 높이 고정: 유동 minHeight(clamp) 제거 → .post-card 로
//         모바일 300 / 데스크탑 380 고정. height:100%도 제거. (높이 균일 정렬)
//         이미지는 aspect-ratio 유지(고정 높이 안에서 폭 비례), overflow:hidden 으로 클립.
//   2026-06-04 (d)
//     - [반응형] 고정 높이 → 유동화: 이미지 height:177px → aspect-ratio 16/9(폭 비례),
//         카드 minHeight 401/320(고정) → clamp(모바일↓~데스크탑 401/320).
//         모바일 2열에서 과도하게 길어지던 문제 해소(그리드는 .post-grid가 2열 유지).
//   2026-06-04 (b)
//     - [기능추가] 리스트에서 하트(좋아요) 토글 가능 — onToggleLike/liked/likeCount
//         제어형 props. 하트 버튼은 stopPropagation으로 카드 클릭(상세)과 분리.
//     - [변경] 루트 button → div(role=button) + .card-pressable(hover 확대 모션).
//         (button 안에 button 중첩 불가 문제 해소)
//   2026-06-04
//     - [수정] 카드 minHeight 추가(이미지 401 / 텍스트 320, Figma 기준).
//         반응형 그리드에서 같은 행에 키 큰 카드가 없을 때(단독 행 등) 카드
//         높이가 내용만큼 줄어들던 문제 해결.
// ============================================================================
// ============================================================================
// PostListCard — 게시판(어워드) 리스트 카드 (Figma 1106:298 / 1106:392 기준)
//
// 한 컴포넌트로 두 상태를 처리:
//   - 이미지 있음 (cover_image_url): 상단 이미지 헤더 + 하단 콘텐츠
//   - 이미지 없음 (텍스트만, wise_life): 이미지 없이 본문을 더 많이 노출
//
// 카테고리별 배지:
//   - zero_waste : bg #a9f751 / 검은 글씨 · "제로 웨이스트 어워드"
//   - wise_life  : bg #33a457 / 흰 글씨   · "슬기로운 사회생활"
//
// 작성자는 공통 <UserChip>(사진 아바타) 사용. 익명은 user_id=null → 마스크.
//
// ⚠️ 좋아요/댓글 아이콘은 임시 placeholder SVG.
//    Figma 공식 아이콘 SVG를 받으면 LikeIcon / CommentIcon 내부만 교체하면 됨.
// ============================================================================

import { UserChip } from './UserChip';
import { BlurImage } from './BlurImage'; // ← [2026-06-18] LQIP 블러업 커버
import type { EsgPostCategory, EsgPostCardRow } from '@/types/esg';

// ── Figma 스펙 토큰 ─────────────────────────────────────────────────────────
const CARD_SHADOW = '12px 12px 12px rgba(0,0,0,0.04)';
const BORDER_DIVIDER = '#f2f2f2';
const TITLE_COLOR = '#111';
const BODY_COLOR = '#343a3f';

interface BadgeSpec {
  label: string;
  bg: string;
  color: string;
}
const BADGE: Record<EsgPostCategory, BadgeSpec> = {
  zero_waste: { label: '제로 웨이스트 어워드', bg: '#a9f751', color: '#000' },
  wise_life: { label: '슬기로운 사회생활', bg: '#33a457', color: '#fff' },
};

// ── 아이콘 (업로드된 공식 SVG: heart.svg 32 / chat.svg 24) ──────────────────
// 하트: outline(미좋아요 stroke #111) / 좋아요 시 빨강(#ff4d4f) 채움. viewBox 32.
function LikeIcon({ size = 32, filled = false }: { size?: number; filled?: boolean }) {
  // 좋아요 시: heart_filled.svg (#FF2E2E 채움 + 흰 하이라이트 원) ← [2026-06-09] FF2E65 → FF2E2E
  if (filled) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M29 11.5192C29 19.6681 16.0022 27 16.0022 27C16.0022 27 3 19.6681 3 11.5192C3 8.13259 5.5185 5 9.29192 5C12.7778 5 16.0022 7.32828 16.0022 10.7021C16.0022 7.31558 19.2353 5 22.7124 5C26.4859 5 29 8.14528 29 11.5192Z"
          fill="#FF2E2E"
          stroke="#FF2E2E"
          strokeWidth="2"
          strokeMiterlimit="10"
        />
        <circle cx="22.5" cy="11.5" r="2.5" fill="white" />
      </svg>
    );
  }
  // 미좋아요: heart.svg (outline, stroke #111)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M29 11.5192C29 19.6681 16.0022 27 16.0022 27C16.0022 27 3 19.6681 3 11.5192C3 8.13259 5.5185 5 9.29192 5C12.7778 5 16.0022 7.32828 16.0022 10.7021C16.0022 7.31558 19.2353 5 22.7124 5C26.4859 5 29 8.14528 29 11.5192Z"
        stroke="#111"
        strokeWidth="2"
        strokeMiterlimit="10"
      />
    </svg>
  );
}
// 댓글: chat.svg (filled #DFE5F1). viewBox 24.
function CommentIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M11.998 2C6.47527 2.00023 1.99805 6.47717 1.99805 12C1.99828 17.5226 6.47541 21.9998 11.998 22C12.2523 22 12.5044 21.9864 12.7539 21.9678C12.8327 21.9877 12.915 22 13 22H21C21.5523 22 22 21.5523 22 21V13C22 12.9133 21.9885 12.8292 21.9678 12.749C21.9861 12.5017 21.998 12.252 21.998 12C21.998 6.47703 17.521 2 11.998 2Z"
        fill="#DFE5F1"
      />
    </svg>
  );
}

interface PostListCardProps {
  post: EsgPostCardRow;
  avatarUrl: string | null;
  isMine: boolean;
  isAdmin: boolean;
  onClick: () => void;
  /** 내가 좋아요 눌렀는지(제어형) */
  liked?: boolean;
  /** 좋아요 수(제어형 — 미지정 시 post.like_count) */
  likeCount?: number;
  /** 하트 토글 (미지정 시 하트 비활성) */
  onToggleLike?: (postId: string) => void;
}

export function PostListCard({
  post,
  avatarUrl,
  isMine,
  isAdmin,
  onClick,
  liked = false,
  likeCount,
  onToggleLike,
}: PostListCardProps) {
  const hasImage = !!post.cover_image_url;
  const badge = BADGE[post.category];

  // 커버 썸네일 크롭 기준점 — 커버 이미지(=cover_image_url)의 focus. ← [2026-06-11]
  //   일치 항목 없으면 images[0](sort_order 0), 그래도 없으면 중앙(50/50).
  const coverImg =
    post.images?.find((im) => im.url === post.cover_image_url) ?? post.images?.[0];
  const coverFocusX = coverImg?.focus_x ?? 50;
  const coverFocusY = coverImg?.focus_y ?? 50;

  // 작성자 표시 (익명 마스킹은 view에서 처리됨 — user_id null이면 아바타도 없음)
  const maskAuthor = post.is_anonymous && !isMine && !isAdmin;
  const authorName = maskAuthor ? '익명' : post.user_name;

  return (
    <div
      className={`card-pressable post-card${hasImage ? ' post-card--has-image' : ''}`} // ← [2026-06-11] 이미지 카드 모디파이어(모바일 본문 숨김/높이 축소)
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        // 높이는 .post-card 에서 고정(모바일 300 / 데스크탑 380) — 카드 균일 정렬
        padding: 0,
        border: 'none',
        background: '#fff',
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: CARD_SHADOW,
        borderRadius: hasImage ? '20px 20px 24px 24px' : 24, // 이미지: 상20/하24, 텍스트: 전체24
        overflow: 'hidden',
      }}
    >
      {/* 이미지 헤더 (이미지 있을 때만) — 고정 높이(.post-card__img)로 콘텐츠 영역 확정 */}
      {hasImage && (
        <div
          className="post-card__img"
          style={{
            width: '100%',
            background: '#00422b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <BlurImage
            url={post.cover_image_url}
            width={640}
            objectPosition={`${coverFocusX}% ${coverFocusY}%`} // ← [2026-06-11] 커버 크롭 기준점
          />
        </div>
      )}

      {/* 콘텐츠 영역 — 상단(배지/제목/본문)은 넘치면 잘림, 푸터는 항상 보존 */}
      <div
        style={{
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minWidth: 0,
          minHeight: 0, // flex 자식 overflow 동작에 필수
        }}
      >
        {/* 상단: 배지 + 제목 + 본문
            ← [2026-06-09] overflow:hidden 제거(잘림 주범). 카드가 min-height로 늘어나
              항상 들어가고, 텍스트 절단은 제목/본문 각자의 WebkitLineClamp 가 처리. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minWidth: 0,
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* 카테고리 배지 */}
          <span
            style={{
              alignSelf: 'flex-start',
              padding: '4px 8px',
              borderRadius: 999,
              background: badge.bg,
              color: badge.color,
              fontSize: 12,
              fontWeight: 400,
              lineHeight: 1.3,
              letterSpacing: '-0.12px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {badge.label}
          </span>

          {/* 제목 + 본문 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minWidth: 0,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                lineHeight: 1.4,
                letterSpacing: '-0.18px',
                color: TITLE_COLOR,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                wordBreak: 'break-word',
                minHeight: '2.8em', // ← [2026-06-09] 2줄(1.4em×2) 자리 예약. 1줄 제목도 2줄 높이 확보
              }}
            >
              {post.title}
            </h3>
            <p
              className="post-card__body" // ← [2026-06-11] 모바일에서 이미지 카드 본문 숨김 타겟
              style={{
                margin: 0,
                fontSize: 14, // ← [2026-06-08] 12 → 14
                fontWeight: 400,
                lineHeight: 1.4,
                letterSpacing: '-0.12px',
                color: BODY_COLOR,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                display: '-webkit-box',
                WebkitLineClamp: hasImage ? 2 : 6, // 텍스트 카드는 본문 더 노출
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                // ← [2026-06-09] 이미지 카드는 본문 2줄(1.4em×2) 자리 예약 → 1줄 본문도 2줄 높이 확보(카드 균일).
                //   텍스트전용 카드(이미지 없음, 최대 6줄)는 예약 없이 내용대로.
                minHeight: hasImage ? '2.8em' : undefined,
              }}
            >
              {post.excerpt}
            </p>
          </div>
        </div>

        {/* 푸터: 작성자 / 좋아요·댓글 — 항상 보존(flexShrink:0) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${BORDER_DIVIDER}`,
            gap: 8,
            minWidth: 0,
          }}
        >
          <UserChip
            name={authorName}
            avatarUrl={avatarUrl}
            size={24}
            isMe={isMine}
            anonymous={post.is_anonymous}
            colorSeed={post.is_anonymous ? post.id : undefined}
            gap={6}
            nameSize={14}
            nameWeight={400}
            nameColor={TITLE_COLOR}
          />

          {/* Figma 1200:95 — 댓글(좌, 24px) → 하트(우, 32px), 그룹 gap 16 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            {/* 댓글 (gap 4, 카운트 #64748b) */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <CommentIcon size={24} />
              <span style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.3, color: '#64748b' }}>
                {post.comment_count}
              </span>
            </span>
            {/* 좋아요 (gap 2, 카운트 #111) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation(); // 카드 클릭(상세 열기)과 분리
                onToggleLike?.(post.id);
              }}
              disabled={!onToggleLike}
              aria-label={liked ? '좋아요 취소' : '좋아요'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: onToggleLike ? 'pointer' : 'default',
              }}
            >
              <LikeIcon size={32} filled={liked} />
              <span style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.3, color: TITLE_COLOR }}>
                {likeCount ?? post.like_count}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
