// ============================================================================
// productImages.ts — 상품 이미지 업로드/삭제 헬퍼
//
// 함수:
//   - uploadProductImage(file, opts)   : 이미지 1장 업로드 → public URL 반환
//   - deleteProductImage(url)          : URL 기반 삭제 (Storage path 역추출)
//
// 폴더 구조:
//   esg-products/{kind}/{owner_id}/{timestamp}-{random}.{ext}
//   kind: 'bazaar' | 'auction'
//   owner_id: product_id (바자회) 또는 auction_id (경매)
//     ※ 새 등록 시점에는 아직 id 없으므로 'new-{nanoid}' 임시 폴더 사용 후 등록 후 이동(또는 그대로 유지)
//
// 보안:
//   - 어드민만 업로드 가능 (RLS)
//   - 클라이언트는 어드민 권한 있어야 호출 가능 (실패 시 친절한 에러)
// ============================================================================

import { supabase as _supabase } from './supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

const BUCKET = 'esg-products';

export type ProductKind = 'bazaar' | 'auction';

export interface UploadProductImageOptions {
  kind: ProductKind;
  /** 상품/경매 ID. 새 등록 시점에는 임시 ID 사용 (예: `new-${Date.now()}`) */
  ownerId: string;
}

/**
 * 이미지 업로드 → public URL 반환.
 * 실패 시 에러 throw (한국어 메시지).
 */
export async function uploadProductImage(
  file: File,
  opts: UploadProductImageOptions
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있습니다.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('파일 크기는 10MB 이하여야 합니다.');
  }

  // 파일명 생성: timestamp-random.ext
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${opts.kind}/${opts.ownerId}/${filename}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });
  if (upErr) {
    // 어드민 권한 없으면 RLS 차단
    if (upErr.message?.includes('row-level security') || upErr.message?.includes('Unauthorized')) {
      throw new Error('이미지 업로드 권한이 없습니다. 관리자만 가능합니다.');
    }
    throw new Error(upErr.message ?? '업로드 실패');
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return urlData.publicUrl;
}

/**
 * 이미지 URL에서 Storage path 추출 후 삭제.
 * URL이 다른 도메인이면 무시 (외부 URL일 수도).
 */
export async function deleteProductImage(url: string): Promise<void> {
  if (!url) return;

  // public URL 형식: https://<project>.supabase.co/storage/v1/object/public/esg-products/{kind}/{owner_id}/{filename}
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) {
    // 외부 URL이거나 placeholder. 삭제 안 함.
    return;
  }
  const path = url.slice(idx + marker.length);
  if (!path) return;

  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    // 이미 삭제됐거나 권한 없으면 콘솔만
    console.warn('[deleteProductImage] failed:', error.message);
  }
}

/** URL이 esg-products 버킷의 것인지 (외부 URL이면 false) */
export function isProductImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes(`/storage/v1/object/public/${BUCKET}/`);
}
