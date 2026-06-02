/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_ENV: 'development' | 'staging' | 'production';
  readonly VITE_DONATION_GOAL_FALLBACK?: string;
  readonly VITE_AZURE_CLIENT_ID?: string;
  readonly VITE_AZURE_TENANT_ID?: string;
  readonly VITE_GA_MEASUREMENT_ID?: string; // ← [2026-06-02 추가] GA4 측정 ID (미설정 시 GA 비활성)
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
