// ============================================================================
// CHANGELOG
//   2026-06-04 (b)
//     - [기능추가] updatePost(): 이미지 편집 지원 (기존 Phase 2-C 보류 해제)
//         · 3번째 인자 imagesOp 전달 시: 유지할 기존 이미지 + 새 파일 재구성
//         · esg_post_images delete-all + insert-all (sort_order CHECK 0..2 /
//           UNIQUE(post_id,sort_order) 충돌 방지), cover_image_url 동기화
//         · 카테고리 사진 필수 정책(zero_waste) 편집에서도 강제
//         · imagesOp 없으면 기존처럼 본문 patch만 (하위 호환)
//   2026-06-04
//     - [추가] POST_IMAGE_POLICY: 카테고리별 사진 필수 여부 SSOT 정의
//         · zero_waste(제로 웨이스트) → 사진 필수
//         · wise_life(슬기로운 사회생활) → 사진 선택(글만 작성 가능)
//     - [추가] createPost(): 모든 작성 경로 공통 진입점에서 정책 강제
//         (UI 우회/직접 호출까지 방어하는 근본 가드)
// ============================================================================

// ============================================================================
// posts.ts — 게시글 관련 API
//
// 함수:
//   - loadPosts(category?, opts?)       : 목록 조회 (esg_posts_with_images view)
//   - loadPost(id)                       : 단일 게시글 + 이미지
//   - createPost(user, input, files)     : 게시글 + 이미지 동시 생성 (rollback 처리)
//   - updatePost(id, patch)              : 본문 수정
//   - deletePost(id)                     : Soft delete (status='deleted')
//   - uploadPostImage(file, userId)      : Storage 업로드, public URL 반환
//   - subscribePostsChanges(callback)    : Realtime 구독 (cleanup 함수 반환)
//
// 설계 원칙:
//   - 게시글+이미지는 트랜잭션이 아닌 순차 처리 (Supabase JS는 트랜잭션 미지원)
//     → 이미지 업로드 후 DB INSERT 실패 시 Storage 파일 cleanup
//     → DB INSERT 후 이미지 행 INSERT 실패 시 post + 이미지 모두 cleanup
//   - cover_image_url은 첫 번째 이미지 자동 (썸네일 용도)
//   - 익명 처리는 DB view에서 자동 마스킹 (프론트는 신경 안 써도 됨)
// ============================================================================

import { supabase as _supabase } from './supabase';
import { loadPublicProfiles } from './profiles'; // ← [좋아요 누른 사람 조회] 이름/부서/아바타
import type {
  EsgPostCategory,
  EsgPostInsert,
  EsgPostUpdate,
  EsgPostWithImagesRow,
} from '@/types/esg';

// ============================================================================
// TYPE-CASTING NOTE
//
// supabase-js 2.49는 단일 객체 .insert() 시 Database['public']['Tables'][T]['Insert']을
// never[]로 잘못 추론하는 알려진 한계가 있음.
// 정확한 GenericTable 구조(Relationships, internal 필드)를 수동으로 맞추기 어려움.
//
// 근본 해결: `npx supabase gen types typescript --project-id ... > src/types/supabase.ts`
// 자동 생성된 타입을 import하면 캐스팅 없이도 모든 추론이 통과됨.
// → Phase 0 완료 후 일정 잡고 도입 예정 (TODO #1).
//
// 임시 우회: 로컬에서 supabase를 untyped로 캐스팅. 런타임 동작은 동일.
// .insert/.update/.delete 호출만 영향, .select는 supabase-js 2.49도 잘 추론함.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ============================================================================
// 카테고리별 이미지 정책 (SSOT)
//
// 게시판 작성 규칙의 단일 출처. 폼 UI(PostFormModal)와 API 가드(createPost)가
// 모두 이 상수를 참조한다. 새 카테고리 추가 시 여기만 수정하면 됨.
//   - imageRequired=true  → 사진 1장 이상 없으면 작성 불가
//   - imageRequired=false → 사진 없이 글만 작성 가능
// ============================================================================

export const POST_IMAGE_POLICY: Record<EsgPostCategory, { imageRequired: boolean }> = {
  zero_waste: { imageRequired: true },  // ← [추가] 제로 웨이스트: 사진 필수
  wise_life: { imageRequired: false },  // ← [추가] 슬기로운 사회생활: 사진 선택(글만 가능)
};

// ============================================================================
// 조회
// ============================================================================

export interface LoadPostsOptions {
  limit?: number;
  offset?: number;
}

/** 게시글 목록 (esg_posts_with_images view, 익명 마스킹 + 이미지 배열 JOIN됨) */
export async function loadPosts(
  category?: EsgPostCategory,
  opts: LoadPostsOptions = {}
): Promise<EsgPostWithImagesRow[]> {
  const { limit = 50, offset = 0 } = opts;
  let query = supabase
    .from('esg_posts_with_images')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as EsgPostWithImagesRow[];
}

/** 단일 게시글 조회 */
export async function loadPost(id: string): Promise<EsgPostWithImagesRow | null> {
  const { data, error } = await supabase
    .from('esg_posts_with_images')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as EsgPostWithImagesRow | null;
}

// ============================================================================
// 생성 / 수정 / 삭제
// ============================================================================

export interface CreatePostInput {
  category: EsgPostCategory;
  title: string;
  content: string;
  is_anonymous: boolean;
}

export interface PostAuthor {
  id: string;
  email: string;
  name: string;
  dept: string | null;
}

/** 업로드할 새 이미지 1장 + 썸네일 크롭 기준점(0~100). ← [2026-06-11] */
export interface PostImageDraft {
  file: File;
  focusX: number; // 0~100 (%)
  focusY: number; // 0~100 (%)
}

/**
 * 게시글 + 이미지(0~3장) 한 번에 생성.
 * - 이미지 업로드 후 esg_posts INSERT
 * - INSERT 실패 시 업로드된 이미지 cleanup
 * - 이미지 행 INSERT 실패 시 post + 이미지 모두 cleanup
 * - cover_image_url = 첫 번째 이미지
 */
export async function createPost(
  user: PostAuthor,
  input: CreatePostInput,
  images: PostImageDraft[] = [] // ← [2026-06-11] File[] → PostImageDraft[] (focus 포함)
): Promise<EsgPostWithImagesRow> {
  if (images.length > 3) {
    throw new Error('이미지는 최대 3장까지 업로드 가능합니다.');
  }

  // 카테고리별 사진 필수 정책 강제 (SSOT 기반) — UI 우회/직접 호출까지 방어
  if (POST_IMAGE_POLICY[input.category].imageRequired && images.length === 0) {  // ← [수정] images 기준
    throw new Error('이 게시판은 사진을 최소 1장 이상 등록해야 합니다.');
  }

  // 1) 이미지 업로드 (sort_order 0부터, focus 동반)
  const uploaded: Array<{ url: string; sort_order: number; focusX: number; focusY: number }> = []; // ← [수정] focus 포함
  try {
    for (let i = 0; i < images.length; i++) {
      const url = await uploadPostImage(images[i].file, user.id);
      uploaded.push({ url, sort_order: i, focusX: images[i].focusX, focusY: images[i].focusY }); // ← [수정]
    }
  } catch (uploadErr) {
    // 일부 업로드 후 실패 시, 성공한 것 cleanup
    await cleanupImages(uploaded.map((u) => u.url));
    throw uploadErr;
  }

  // 2) esg_posts INSERT
  const insertRow: EsgPostInsert = {
    category: input.category,
    user_id: user.id,
    user_email: user.email,
    user_name_snapshot: user.name,
    user_dept_snapshot: user.dept,
    is_anonymous: input.is_anonymous,
    title: input.title,
    content: input.content,
    cover_image_url: uploaded[0]?.url ?? null,
    status: 'published',
  };

  const { data: post, error: insertError } = await supabase
    .from('esg_posts')
    .insert(insertRow)
    .select('id')
    .single();

  if (insertError || !post) {
    await cleanupImages(uploaded.map((u) => u.url));
    throw insertError ?? new Error('게시글 생성 실패');
  }

  // 3) esg_post_images INSERT
  if (uploaded.length > 0) {
    const imageRows = uploaded.map((u) => ({
      post_id: post.id,
      image_url: u.url,
      sort_order: u.sort_order,
      focus_x: u.focusX, // ← [2026-06-11] 썸네일 기준점 X
      focus_y: u.focusY, // ← [2026-06-11] 썸네일 기준점 Y
    }));
    const { error: imgError } = await supabase.from('esg_post_images').insert(imageRows);

    if (imgError) {
      // Rollback: post 삭제 + 이미지 파일 삭제
      await supabase.from('esg_posts').delete().eq('id', post.id);
      await cleanupImages(uploaded.map((u) => u.url));
      throw imgError;
    }
  }

  // 4) view에서 다시 조회 (익명 마스킹 + 이미지 JOIN된 형태)
  const final = await loadPost(post.id);
  if (!final) throw new Error('생성 후 조회 실패');
  return final;
}

/**
 * 게시글 수정.
 * - imagesOp 미전달: 본문 patch만 (하위 호환)
 * - imagesOp 전달: 이미지까지 재구성 (유지할 기존 + 새 파일)
 */
export interface UpdatePostImagesOp {
  /** 유지할 기존 이미지 (원하는 순서대로) — url + 썸네일 기준점 */
  keep: Array<{ url: string; focusX: number; focusY: number }>; // ← [2026-06-11] keepUrls → keep(+focus)
  /** 새로 추가할 이미지 (keep 뒤에 append) — file + 기준점 */
  newImages: PostImageDraft[]; // ← [2026-06-11] newFiles → newImages(+focus)
  /** 새 파일 업로드 경로용 사용자 id */
  uploaderId: string;
}

export async function updatePost(
  id: string,
  patch: EsgPostUpdate,
  imagesOp?: UpdatePostImagesOp
): Promise<EsgPostWithImagesRow> {
  // 이미지 변경 없음 → 기존처럼 본문 patch만
  if (!imagesOp) {
    const { error } = await supabase.from('esg_posts').update(patch).eq('id', id);
    if (error) throw error;
    const full = await loadPost(id);
    if (!full) throw new Error('수정 후 조회 실패');
    return full;
  }

  const { keep, newImages, uploaderId } = imagesOp;                      // ← [수정] keep/newImages
  if (keep.length + newImages.length > 3) {                             // ← [수정] 최대 3장
    throw new Error('이미지는 최대 3장까지 업로드 가능합니다.');
  }

  // 카테고리 사진 필수 정책 강제 (zero_waste 등) — 최종 0장 차단
  const { data: postRow, error: catErr } = await supabase
    .from('esg_posts').select('category').eq('id', id).single();
  if (catErr || !postRow) throw catErr ?? new Error('게시글 조회 실패');
  const totalAfter = keep.length + newImages.length;                    // ← [수정]
  if (POST_IMAGE_POLICY[(postRow as { category: EsgPostCategory }).category].imageRequired && totalAfter === 0) {
    throw new Error('이 게시판은 사진을 최소 1장 이상 유지해야 합니다.');
  }

  // 1) 새 파일 업로드 (실패 시 업로드분 cleanup) — focus 동반
  const uploaded: Array<{ url: string; focusX: number; focusY: number }> = []; // ← [수정] focus 포함
  try {
    for (const im of newImages) {                                        // ← [수정]
      const url = await uploadPostImage(im.file, uploaderId);            // ← [수정]
      uploaded.push({ url, focusX: im.focusX, focusY: im.focusY });      // ← [수정]
    }
  } catch (e) {
    await cleanupImages(uploaded.map((u) => u.url));                     // ← [수정]
    throw e;
  }

  // 2) 현재 이미지 행 조회 → 제거 대상 파악
  const { data: curRows, error: curErr } = await supabase
    .from('esg_post_images').select('image_url').eq('post_id', id);
  if (curErr) { await cleanupImages(uploaded.map((u) => u.url)); throw curErr; } // ← [수정]
  const currentUrls = ((curRows ?? []) as Array<{ image_url: string }>).map((r) => r.image_url);
  const keepUrls = keep.map((k) => k.url);                              // ← [추가] 유지 URL 목록
  const removedUrls = currentUrls.filter((u) => !keepUrls.includes(u)); // 더 이상 안 쓰는 파일

  // 3) 최종 이미지 = 유지(순서, focus 유지) + 새 업로드(focus)
  const finalImages = [                                                 // ← [수정] url+focus 단위
    ...keep.map((k) => ({ url: k.url, focusX: k.focusX, focusY: k.focusY })),
    ...uploaded,
  ];

  // 4) 이미지 행 재구성: delete-all + insert-all
  //    (sort_order CHECK 0..2 / UNIQUE(post_id,sort_order)라 임시값 불가 → 전체 교체가 안전)
  const { error: delErr } = await supabase.from('esg_post_images').delete().eq('post_id', id);
  if (delErr) { await cleanupImages(uploaded.map((u) => u.url)); throw delErr; } // ← [수정]
  if (finalImages.length > 0) {
    const rows = finalImages.map((im, i) => ({                          // ← [수정] focus 포함
      post_id: id,
      image_url: im.url,
      sort_order: i,
      focus_x: im.focusX,
      focus_y: im.focusY,
    }));
    const { error: insErr } = await supabase.from('esg_post_images').insert(rows);
    if (insErr) { await cleanupImages(uploaded.map((u) => u.url)); throw insErr; } // ← [수정]
  }

  // 5) esg_posts patch + cover_image_url 동기화(첫 이미지)
  const { error: upErr } = await supabase
    .from('esg_posts').update({ ...patch, cover_image_url: finalImages[0]?.url ?? null }).eq('id', id); // ← [수정]
  if (upErr) throw upErr;

  // 6) DB 반영 성공 후, 제거된 파일 Storage 삭제 (마지막에)
  if (removedUrls.length > 0) await cleanupImages(removedUrls);

  const full = await loadPost(id);
  if (!full) throw new Error('수정 후 조회 실패');
  return full;
}

/**
 * Soft delete (status='deleted').
 * - 게시글이 사라진 것처럼 보이지만 DB row는 남음
 * - 통계 / 어드민 / 좋아요 카운트 history 보존 위해
 * - Storage 파일은 일단 유지 (배치 cleanup은 별도 운영 작업)
 */
export async function deletePost(id: string): Promise<void> {
  const { error } = await supabase
    .from('esg_posts')
    .update({ status: 'deleted' })
    .eq('id', id);
  if (error) throw error;
}

// ============================================================================
// Storage (이미지 업로드)
// ============================================================================

/** 이미지 1장 업로드. public URL 반환. 경로: {userId}/{timestamp}_{random}.{ext} */
export async function uploadPostImage(file: File, userId: string): Promise<string> {
  // 파일 검증
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있습니다.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('이미지 크기는 10MB 이하여야 합니다.');
  }

  // 안전한 파일명 생성
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const path = `${userId}/${safeName}`;

  const { error } = await supabase.storage.from('esg-posts').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from('esg-posts').getPublicUrl(path);
  return data.publicUrl;
}

/** 여러 이미지 cleanup (rollback용) */
async function cleanupImages(urls: string[]): Promise<void> {
  for (const url of urls) {
    await deleteStorageFileByUrl(url).catch((e) =>
      console.error('[cleanupImages] failed:', e)
    );
  }
}

/** public URL에서 storage path 추출 후 삭제 */
async function deleteStorageFileByUrl(publicUrl: string): Promise<void> {
  try {
    const u = new URL(publicUrl);
    const match = u.pathname.match(/\/storage\/v1\/object\/public\/esg-posts\/(.+)$/);
    if (!match) return;
    const path = decodeURIComponent(match[1]);
    const { error } = await supabase.storage.from('esg-posts').remove([path]);
    if (error) throw error;
  } catch (e) {
    console.error('[deleteStorageFileByUrl]', publicUrl, e);
  }
}

// ============================================================================
// 좋아요 (esg_post_likes)
// ============================================================================

/**
 * 좋아요 토글.
 * - 이미 있으면 DELETE → unlike
 * - 없으면 INSERT → like
 * - like_count는 DB 트리거로 자동 동기화 (esg_post_likes_count_trigger)
 *
 * 반환: 최종 상태
 */
export async function toggleLike(
  postId: string,
  user: { id: string; email: string }
): Promise<'liked' | 'unliked'> {
  // 1) 현재 좋아요 상태 확인
  const { data: existing, error: checkErr } = await supabase
    .from('esg_post_likes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (checkErr) throw checkErr;

  if (existing) {
    const { error } = await supabase
      .from('esg_post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id);
    if (error) throw error;
    return 'unliked';
  } else {
    const { error } = await supabase.from('esg_post_likes').insert([
      {
        post_id: postId,
        user_id: user.id,
        user_email: user.email,
      },
    ]);
    if (error) throw error;
    return 'liked';
  }
}

/**
 * 여러 게시글에 대해 "내가 좋아요 눌렀는지" 한 번에 조회.
 * RLS: esg_post_likes_select는 본인 또는 관리자만 SELECT 가능 →
 *   user_id=auth.uid()로 본인 row만 조회됨 (자동 제한).
 *
 * 반환: 좋아요 눌렀던 post_id Set
 */
export async function loadMyLikes(
  postIds: string[],
  userId: string
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('esg_post_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds);
  if (error) throw error;
  return new Set(((data ?? []) as Array<{ post_id: string }>).map((r) => r.post_id));
}

/** 단일 게시글 좋아요 여부 */
export async function isLikedByMe(postId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('esg_post_likes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** 게시글에 좋아요 누른 사람 (이름/부서/아바타). */
export interface PostLiker {
  user_id: string;
  name: string;
  dept: string | null;
  avatar_url: string | null;
  user_email: string;
  created_at: string;
}

/**
 * 게시글에 좋아요를 누른 사람 목록 조회.
 *
 * ⚠️ 어드민 전용: RLS `esg_post_likes_select USING (user_id = auth.uid() OR esg_is_admin())`가
 *   강제하므로, 일반 사용자가 호출하면 (본인 row 외) 빈 결과가 반환된다.
 *   즉 "타인이 누른 좋아요"는 DB 레벨에서 어드민에게만 보인다(프론트 신뢰 불필요).
 *
 * 익명 게시글이라도 "좋아요를 누른 사람"은 익명 대상이 아니므로 실명 표기.
 */
export async function loadPostLikers(postId: string): Promise<PostLiker[]> {
  const { data, error } = await supabase
    .from('esg_post_likes')
    .select('user_id, user_email, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Array<{ user_id: string; user_email: string; created_at: string }>;
  if (rows.length === 0) return [];

  // 이름/부서/아바타는 profiles에서 (탈퇴/외부 사용자는 이메일 fallback)
  const pmap = await loadPublicProfiles(rows.map((r) => r.user_id));

  return rows.map((r) => {
    const p = pmap.get(r.user_id);
    return {
      user_id: r.user_id,
      name: p?.name ?? r.user_email,
      dept: p?.dept ?? null,
      avatar_url: p?.avatar_url ?? null,
      user_email: r.user_email,
      created_at: r.created_at,
    };
  });
}

// ============================================================================
// Realtime 구독
// ============================================================================

/**
 * 게시글 변경 실시간 구독.
 * 채널 이름 unique (StrictMode 이중 마운트 대응).
 * cleanup 함수 반환.
 */
export function subscribePostsChanges(
  callback: () => void,
  opts: { postId?: string } = {} // ← [2026-06-05] 단일 글만 구독(상세 모달용)
): () => void {
  const channelName = `esg-posts-${Math.random().toString(36).slice(2, 11)}`;
  const filterCfg: Record<string, string> = {
    event: '*',
    schema: 'public',
    table: 'esg_posts',
  };
  if (opts.postId) filterCfg.filter = `id=eq.${opts.postId}`; // ← [2026-06-05] 해당 글 변경만

  const channel = supabase
    .channel(channelName)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .on('postgres_changes' as never, filterCfg as never, () => callback())
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
