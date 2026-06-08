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
  /** [2026-06-08 추가] 업로드 전 클라이언트 측 리사이즈/압축 여부. 기본 false(기존 동작 동일).
   *   모바일에서 폰 사진(3~8MB)을 바로 올릴 때 업로드 지연을 줄이기 위함. */
  compress?: boolean;
  /** 압축 시 최대 변(px). 기본 1600 */
  maxDimension?: number;
  /** 압축 시 JPEG 품질(0~1). 기본 0.82 */
  quality?: number;
}

/**
 * [2026-06-08 추가] 캔버스 기반 이미지 리사이즈/압축.
 * 안전 장치:
 *   - 이미지가 아니거나 GIF(애니)면 원본 유지
 *   - 600KB 미만이면 원본 유지(이미 가벼움)
 *   - 디코딩/인코딩 실패하거나 결과가 더 크면 원본 유지
 *   → 어떤 경우에도 "원본 업로드"로 안전하게 폴백.
 */
async function compressImage(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file;       // 애니메이션 보존
  if (file.size < 600 * 1024) return file;          // 이미 가벼움

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;                                    // 디코딩 실패 → 원본
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  );
  if (!blob || blob.size >= file.size) return file; // 효과 없으면 원본

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
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

  // [2026-06-08 추가] 옵션 시 업로드 전 압축(실패 시 원본). 10MB 검증은 압축 후에 수행
  // → 모바일 폰 사진(>10MB)도 압축으로 통과 가능.
  let outFile = file;
  if (opts.compress) {
    outFile = await compressImage(file, opts.maxDimension, opts.quality);
  }

  if (outFile.size > 10 * 1024 * 1024) {
    throw new Error('파일 크기는 10MB 이하여야 합니다.');
  }

  // 파일명 생성: timestamp-random.ext
  const ext = (outFile.name.split('.').pop() || 'jpg').toLowerCase();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${opts.kind}/${opts.ownerId}/${filename}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, outFile, {
    cacheControl: '3600',
    upsert: false,
    contentType: outFile.type,
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
