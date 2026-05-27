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
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), 'VITE_');
    // 필수 환경변수 검증 — 누락 시 빌드 자체 실패
    var required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
    var missing = required.filter(function (k) { return !env[k]; });
    if (missing.length > 0) {
        throw new Error("[cnr-esg] \uD544\uC218 \uD658\uACBD\uBCC0\uC218 \uB204\uB77D: ".concat(missing.join(', '), "\n") +
            ".env.local \uD30C\uC77C\uC744 \uC0DD\uC131\uD558\uACE0 .env.example \uCC38\uACE0\uD558\uC5EC \uAC12 \uC124\uC815 \uD544\uC694.");
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
