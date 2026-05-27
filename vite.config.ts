import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// ============================================================================
// Vite 설정
// 원칙:
//   - 도메인 하드코딩 0 — 모든 URL은 환경변수 또는 window.location.origin
//   - alias '@' = './src'로 경로 단순화
//   - 환경변수는 VITE_ prefix만 클라이언트 노출 (Vite 표준)
// ============================================================================

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // 필수 환경변수 검증 — 누락 시 빌드 자체 실패
  const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `[cnr-esg] 필수 환경변수 누락: ${missing.join(', ')}\n` +
      `.env.local 파일을 생성하고 .env.example 참고하여 값 설정 필요.`
    );
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: true, // 같은 네트워크 다른 기기에서 접근 가능 (모바일 테스트용)
    },
    build: {
      target: 'es2020',
      sourcemap: true,
      rollupOptions: {
        output: {
          // 라이브러리 청크 분리 (Cloudflare Pages 캐시 효율)
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'supabase': ['@supabase/supabase-js'],
          },
        },
      },
    },
  };
});
