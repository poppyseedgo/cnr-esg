// ============================================================================
// CHANGELOG
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
import type { EsgPostCategory, EsgPostWithImagesRow } from '@/types/esg';

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

// ── 아이콘 (임시 placeholder — 공식 SVG로 교체 예정) ────────────────────────
function LikeIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20.5l-1.45-1.32C5.4 14.36 2 11.28 2 7.5 2 5.42 3.42 4 5.5 4c1.74 0 3.41 1.01 4.13 2.44h0.74C11.09 5.01 12.76 4 14.5 4 16.58 4 18 5.42 18 7.5c0 3.78-3.4 6.86-8.55 11.68L12 20.5z"
        stroke="#111"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function CommentIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5h16a1.5 1.5 0 011.5 1.5v8a1.5 1.5 0 01-1.5 1.5H9l-4 3.5V16.5H4A1.5 1.5 0 012.5 15V7A1.5 1.5 0 014 5.5z"
        stroke="#111"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface PostListCardProps {
  post: EsgPostWithImagesRow;
  avatarUrl: string | null;
  isMine: boolean;
  isAdmin: boolean;
  onClick: () => void;
}

export function PostListCard({ post, avatarUrl, isMine, isAdmin, onClick }: PostListCardProps) {
  const hasImage = !!post.cover_image_url;
  const badge = BADGE[post.category];

  // 작성자 표시 (익명 마스킹은 view에서 처리됨 — user_id null이면 아바타도 없음)
  const maskAuthor = post.is_anonymous && !isMine && !isAdmin;
  const authorName = maskAuthor ? '익명' : post.user_name;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: hasImage ? 401 : 320, // ← [추가] Figma 카드 높이(이미지 401/텍스트 320) 바닥값 — 단독 행 붕괴 방지
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
      {/* 이미지 헤더 (이미지 있을 때만) */}
      {hasImage && (
        <div
          style={{
            height: 177,
            width: '100%',
            background: '#00422b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <img
            src={post.cover_image_url ?? undefined}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}

      {/* 콘텐츠 영역 */}
      <div
        style={{
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          flex: 1,
          minWidth: 0,
          justifyContent: 'space-between', // 텍스트 카드에서 푸터를 하단으로
        }}
      >
        {/* 상단: 배지 + 제목 + 본문 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
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
            }}
          >
            {badge.label}
          </span>

          {/* 제목 + 본문 (하단 구분선) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              borderBottom: `1px solid ${BORDER_DIVIDER}`,
              paddingBottom: 24,
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
              }}
            >
              {post.title}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: 12,
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
              }}
            >
              {post.content}
            </p>
          </div>
        </div>

        {/* 푸터: 작성자 / 좋아요·댓글 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 12,
            gap: 8,
            minWidth: 0,
          }}
        >
          <UserChip
            name={authorName}
            avatarUrl={avatarUrl}
            size={24}
            isMe={isMine}
            anonymous={maskAuthor}
            gap={6}
            nameSize={14}
            nameWeight={400}
            nameColor={TITLE_COLOR}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <LikeIcon size={24} />
              <span style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.3, color: TITLE_COLOR }}>
                {post.like_count}
              </span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <CommentIcon size={24} />
              <span style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.3, color: TITLE_COLOR }}>
                {post.comment_count}
              </span>
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
