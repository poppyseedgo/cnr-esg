// ============================================================================
// ImageUploader — 상품 이미지 업로드 공통 컴포넌트
//
// 두 가지 모드:
//   1. 썸네일 (단일): value=string, onChange=(url|null)=>void
//   2. 상세 이미지 (다중): values=string[], onChange=(urls[])=>void
//
// 사용 예 (썸네일):
//   <ThumbnailUploader
//     kind="bazaar"
//     ownerId={product.id}
//     value={form.thumbnail_url}
//     onChange={(url) => setForm({...form, thumbnail_url: url})}
//   />
//
// 사용 예 (상세 이미지):
//   <DetailImagesUploader
//     kind="auction"
//     ownerId={auction.id}
//     values={form.detail_images}
//     onChange={(urls) => setForm({...form, detail_images: urls})}
//     maxCount={5}
//   />
//
// 변경 이력:
//   2026-06-22  이미지 타일 클릭 시 라이트박스 확대(검수 사진 등) — 삭제 버튼은 분리
// ============================================================================

import { useRef, useState } from 'react';
import { uploadProductImage, deleteProductImage, type ProductKind } from '@/lib/productImages';
import { Lightbox } from '@/components/Lightbox'; // ← [2026-06-22] 클릭 확대

// ============================================================================
// 썸네일 (단일)
// ============================================================================

interface ThumbnailUploaderProps {
  kind: ProductKind;
  ownerId: string;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  /** [2026-06-08 추가] 업로드 전 압축(모바일 폰 사진 대비). 기본 false. */
  compress?: boolean;
  /** [2026-07-09] 허용 최대 용량(MB). 미지정=10, 굿즈=20. */
  maxSizeMB?: number;
}

export function ThumbnailUploader({
  kind,
  ownerId,
  value,
  onChange,
  disabled,
  compress,
  maxSizeMB, // ← [2026-07-09] 용량 상한 전달
}: ThumbnailUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false); // ← [2026-06-22] 클릭 확대

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // 기존 이미지가 있으면 먼저 삭제 시도 (Storage 청소)
      if (value) {
        await deleteProductImage(value).catch(() => {});
      }
      const url = await uploadProductImage(file, { kind, ownerId, compress, maxSizeMB }); // ← [2026-07-09] 용량 상한
      onChange(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
      // input 초기화 (같은 파일 재선택 가능)
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!value) return;
    if (!confirm('썸네일을 삭제하시겠습니까?')) return;
    await deleteProductImage(value).catch(() => {});
    onChange(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleSelect}
        disabled={disabled || uploading}
        style={{ display: 'none' }}
      />
      {value ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div
            onClick={() => setLightboxOpen(true)}  // ← [2026-06-22] 클릭 확대
            title="클릭하면 크게 보기"
            style={{
              width: 96,
              height: 96,
              borderRadius: 8,
              background: `url(${value}) center / cover`,
              border: '1px solid #ddd',
              flexShrink: 0,
              cursor: 'zoom-in',  // ← [2026-06-22]
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || uploading}
              style={miniButtonStyle('primary')}
            >
              {uploading ? '업로드 중…' : '🔄 교체'}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled || uploading}
              style={miniButtonStyle('danger')}
            >
              🗑 삭제
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          style={{
            width: 96,
            height: 96,
            border: '2px dashed #ddd',
            borderRadius: 8,
            background: '#fafafa',
            cursor: disabled || uploading ? 'not-allowed' : 'pointer',
            color: '#888',
            fontSize: 11,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          {uploading ? (
            <>업로드 중…</>
          ) : (
            <>
              <span style={{ fontSize: 22 }}>+</span>
              <span>썸네일</span>
            </>
          )}
        </button>
      )}

      {/* ← [2026-06-22] 썸네일 클릭 확대 */}
      {lightboxOpen && value && (
        <Lightbox images={[value]} index={0} onClose={() => setLightboxOpen(false)} />
      )}
    </div>
  );
}

// ============================================================================
// 상세 이미지 (다중)
// ============================================================================

interface DetailImagesUploaderProps {
  kind: ProductKind;
  ownerId: string;
  values: string[];
  onChange: (urls: string[]) => void;
  maxCount?: number;
  disabled?: boolean;
  /** [2026-06-08 추가] 업로드 전 압축(모바일 폰 사진 대비). 기본 false. */
  compress?: boolean;
  /** [2026-06-08 추가] 압축 강도 조절(미지정 시 uploadProductImage 기본값 1600/0.82). */
  compressMaxDimension?: number;
  compressQuality?: number;
  /** [2026-07-09] 허용 최대 용량(MB). 미지정=10, 굿즈=20. */
  maxSizeMB?: number;
}

export function DetailImagesUploader({
  kind,
  ownerId,
  values,
  onChange,
  maxCount = 5,
  disabled,
  compress,
  compressMaxDimension,
  compressQuality,
  maxSizeMB, // ← [2026-07-09] 용량 상한 전달
}: DetailImagesUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null); // ← [2026-06-22] 클릭 확대

  const remaining = maxCount - values.length;

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (files.length > remaining) {
      alert(`최대 ${maxCount}장까지 업로드 가능. 남은 슬롯: ${remaining}장`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const url = await uploadProductImage(file, {
          kind,
          ownerId,
          compress,
          maxDimension: compressMaxDimension,
          quality: compressQuality,
          maxSizeMB, // ← [2026-07-09] 용량 상한
        });
        uploaded.push(url);
      }
      onChange([...values, ...uploaded]);
    } catch (err) {
      alert(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async (url: string) => {
    if (!confirm('이 이미지를 삭제하시겠습니까?')) return;
    await deleteProductImage(url).catch(() => {});
    onChange(values.filter((v) => v !== url));
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleSelect}
        disabled={disabled || uploading || remaining <= 0}
        style={{ display: 'none' }}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
          gap: 8,
        }}
      >
        {values.map((url, i) => (
          <div
            key={url}
            onClick={() => setLightboxIdx(i)}  // ← [2026-06-22] 타일 클릭 확대
            title="클릭하면 크게 보기"
            style={{
              position: 'relative',
              aspectRatio: '1 / 1',
              borderRadius: 8,
              background: `url(${url}) center / cover`,
              border: '1px solid #ddd',
              cursor: 'zoom-in',  // ← [2026-06-22]
            }}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRemove(url); }}  // ← [2026-06-22] 삭제는 확대와 분리
              disabled={disabled}
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: 12,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="삭제"
            >
              ✕
            </button>
          </div>
        ))}
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            style={{
              aspectRatio: '1 / 1',
              border: '2px dashed #ddd',
              borderRadius: 8,
              background: '#fafafa',
              cursor: disabled || uploading ? 'not-allowed' : 'pointer',
              color: '#888',
              fontSize: 11,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            {uploading ? (
              <>업로드 중</>
            ) : (
              <>
                <span style={{ fontSize: 20 }}>+</span>
                <span>{values.length}/{maxCount}</span>
              </>
            )}
          </button>
        )}
      </div>
      <p style={{ marginTop: 6, fontSize: 11, color: '#888' }}>
        최대 {maxCount}장, 각 {maxSizeMB ?? 10}MB 이하 · jpg/png/webp {/* ← [2026-07-09] 용량 동적 표기 */}
      </p>

      {/* ← [2026-06-22] 타일 클릭 확대(여러 장 좌우 네비) */}
      {lightboxIdx !== null && (
        <Lightbox images={values} index={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      )}
    </div>
  );
}

const miniButtonStyle = (variant: 'primary' | 'danger'): React.CSSProperties => ({
  padding: '4px 10px',
  background: '#fff',
  border: '1px solid',
  borderColor: variant === 'primary' ? '#0ea5e9' : '#fecaca',
  color: variant === 'primary' ? '#0ea5e9' : '#dc2626',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  whiteSpace: 'nowrap',
});
