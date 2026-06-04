// ============================================================================
// UserChip — 글쓴이(작성자) 표시 공통 컴포넌트
//
// "아바타 + 이름(+부서)" 조합은 게시글/댓글/상품Q&A/마이페이지/경매 등 곳곳에서
// 반복된다. 이 패턴을 한 컴포넌트로 통일해 SSOT로 관리한다.
//   - 아바타는 공통 <Avatar>를 사용 (이미지→이니셜→익명 마스크 fallback 내장)
//   - 이름/부서 스타일은 props로 조정 (화면별 크기 차이 흡수)
//   - 익명 마스킹된 이름은 호출부에서 이미 '익명' 등으로 넘겨주고, anonymous는
//     아바타 마스크 표시에만 쓴다 (마스킹 로직 중복 구현하지 않음)
//
// 사용 예:
//   <UserChip name={authorName} dept={authorDept} avatarUrl={avatarUrl} />
//   <UserChip name="홍길동" avatarUrl={url} size={20} nameSize={12} />
// ============================================================================

import type { CSSProperties, ReactNode } from 'react';
import { Avatar } from './Avatar';

interface UserChipProps {
  name: string | null | undefined;
  dept?: string | null;
  avatarUrl?: string | null;
  /** 아바타 지름(px). 기본 28 */
  size?: number;
  /** 본인 강조 테두리 */
  isMe?: boolean;
  /** 익명 — 아바타를 마스크로 표시 */
  anonymous?: boolean;
  /** 아바타-텍스트 간격(px). 기본 8 */
  gap?: number;
  nameSize?: number;
  nameWeight?: number;
  nameColor?: string;
  deptColor?: string;
  /** 이름 뒤에 붙는 부가 요소(날짜·뱃지 등). 선택 */
  trailing?: ReactNode;
  style?: CSSProperties;
}

export function UserChip({
  name,
  dept,
  avatarUrl,
  size = 28,
  isMe = false,
  anonymous = false,
  gap = 8,
  nameSize = 13,
  nameWeight = 600,
  nameColor = '#222',
  deptColor = '#888',
  trailing,
  style,
}: UserChipProps) {
  const displayName = name?.trim() || '익명';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap,
        minWidth: 0, // 이름 ellipsis가 동작하도록
        ...style,
      }}
    >
      <Avatar
        name={displayName}
        avatarUrl={avatarUrl}
        size={size}
        isMe={isMe}
        anonymous={anonymous}
      />
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
        <span
          style={{
            fontSize: nameSize,
            fontWeight: nameWeight,
            color: nameColor,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {displayName}
        </span>
        {dept && (
          <span
            style={{
              fontSize: Math.max(11, nameSize - 2),
              color: deptColor,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            · {dept}
          </span>
        )}
        {trailing}
      </span>
    </span>
  );
}
