# cnr-esg

C&R 29주년 창립기념일 ESG 이벤트 사이트.

## 📋 프로젝트 개요

- **이벤트 기간**: 2026-06-08 09:00 ~ 2026-07-10 18:00 (KST)
- **대상**: C&R 직원 약 525명 (USER 517 + ADMIN 8)
- **주요 기능**:
  - Posting: ESG 아이디어 / 제로 웨이스트 / 슬기로운 사회 생활 어워드 (3개 카테고리)
  - eCommerce: 바자회 (상품 판매), 경매 (실시간 비딩)
  - 결제: 계좌이체 + 관리자 수동 확인
  - 배송: 사내 수령 (배송지 입력 없음)
  - 알림: 이메일 (Resend, C&R Space와 같은 계정)
  - 실시간 모금 현황 트래킹

## 🏗 아키텍처

- **신규 프로젝트** — C&R Space와 코드는 별개, 같은 Supabase 인스턴스 공유
- **Supabase**: `jjzcqpbwkkujttwxksvy` (profiles 테이블 공유)
- **DB prefix**: `esg_` (충돌 없음)
- **인증**: Azure AD SSO (Supabase Auth + Azure OAuth Provider 추정, Phase 0-2B에서 확정)
- **배포**: Cloudflare Pages (도메인 미정 — 코드 어디에도 하드코딩 금지)

## 🚀 로컬 개발 셋업

### 1. 의존성 설치

```bash
cd cnr-esg
npm install
```

### 2. 환경변수 설정

```bash
cp .env.example .env.local
# .env.local 파일 열어서 VITE_SUPABASE_ANON_KEY 값 채우기
# (Supabase Dashboard → Settings → API → anon public key)
```

### 3. DB 마이그레이션 적용 (이전 단계)

`supabase/migrations/` 내 5개 SQL 파일을 순서대로 적용. README 별도 존재:

```
supabase/migrations/README.md
```

### 4. 개발 서버 실행

```bash
npm run dev
# → http://localhost:5173
```

브라우저에서 다음이 확인되면 셋업 성공:

- ✅ Supabase 연결 성공
- 이벤트 페이즈: `prelude`
- 설정값 10개 표시
- 모금 현황 0원

### 5. 빌드 검증

```bash
npm run type-check  # TypeScript 타입 검사
npm run build       # 프로덕션 빌드
npm run preview     # 빌드 결과 미리보기
```

## 📁 디렉토리 구조

```
cnr-esg/
├── package.json
├── vite.config.ts          # alias '@' = './src', 환경변수 검증
├── tsconfig.json
├── tsconfig.node.json
├── index.html              # 한국어 lang, noindex
├── .env.example            # 환경변수 템플릿 (도메인 하드코딩 0)
├── .gitignore
├── README.md
├── supabase/
│   └── migrations/         # DB 마이그레이션 (Phase 0-1)
│       ├── 20260526_001_create_esg_tables.sql
│       ├── 20260526_002_create_esg_views.sql
│       ├── 20260526_003_create_esg_rls.sql
│       ├── 20260526_004_create_esg_functions.sql
│       ├── 20260526_005_seed_esg_settings.sql
│       ├── HOTFIX_esg_is_admin.sql
│       └── README.md
└── src/
    ├── main.tsx            # React entry
    ├── App.tsx             # placeholder (셋업 검증용)
    ├── index.css           # 최소 글로벌 스타일
    ├── vite-env.d.ts       # 환경변수 타입
    ├── lib/
    │   └── supabase.ts     # Supabase client + Realtime/RPC 헬퍼
    ├── utils/
    │   ├── time.ts         # KST/UTC, 카운트다운, 페이즈 판정
    │   └── ownership.ts    # UUID+email 이중 식별 (절대 원칙)
    ├── types/
    │   └── esg.ts          # DB 스키마 1:1 TypeScript 타입
    ├── components/         # (Phase 0-2B부터)
    └── pages/              # (Phase 0-3부터)
```

## 🔑 핵심 설계 원칙

1. **도메인 하드코딩 0** — Cloudflare 도메인 미확정. 코드는 항상 `window.location.origin` 또는 환경변수 사용.

2. **snake_case 절대** — DB 컬럼은 모두 snake_case. camelCase 금지.

3. **UUID + email 이중 식별** — 사용자 식별은 항상 UUID OR email. 이름 비교 절대 금지 (C&R Space 메모리 #30 원칙).

4. **시간은 UTC 저장, KST 표시** — DB는 timestamptz. 표시할 때만 `formatKSTFull()` 등 사용. C&R Space의 9시간 차이 버그 교훈.

5. **익명은 DB 레벨에서 마스킹** — view (`esg_posts_public` 등) 사용. 프론트 마스킹은 보조 수단.

6. **동시성은 RPC + SELECT FOR UPDATE** — 경매 입찰, 재고 차감은 PostgreSQL row lock으로 원자성 보장.

7. **이벤트 페이즈는 데이터 기반** — `esg_settings.event_phase`로 제어. 코드 배포 없이 종료/재오픈 가능.

## 🛠 빌드 명령

| 명령                 | 용도                                  |
| -------------------- | ------------------------------------- |
| `npm run dev`        | 개발 서버 (port 5173)                 |
| `npm run build`      | 프로덕션 빌드                         |
| `npm run preview`    | 빌드 결과 로컬 확인                   |
| `npm run type-check` | TypeScript 타입만 검사 (배포 전 필수) |

## 🚢 Cloudflare Pages 배포

esg.cnrres.store
cnrres.store

### Cloudflare Pages 설정

- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Node version**: 20 (또는 22)
- **Environment variables** (Production / Preview 각각):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_APP_NAME`
  - `VITE_APP_ENV` = `production` (또는 `staging`)

### Git Branch 전략 (C&R Space와 동일)

- `dev` → Preview 배포 (개발 확인)
- `staging` → Preview 배포 (QA)
- `main` → Production 배포

### 배포 전 체크리스트

- [ ] `npm run build` 로컬 성공 확인 (chain `&&` 사용 금지, 단독 실행)
- [ ] `npm run type-check` 통과
- [ ] DB 마이그레이션 적용 완료
- [ ] Supabase Dashboard에서 Azure OAuth Provider 활성화 확인 (Phase 0-2B)

## 🔜 다음 Phase

| Phase    | 내용                                  | 상태        |
| -------- | ------------------------------------- | ----------- |
| 0-1      | DB 마이그레이션                       | ✅ 완료     |
| **0-2A** | **프로젝트 셋업 (인증 무관)**         | **✅ 현재** |
| 0-2B     | 인증 모듈 (방식 확정 후)              | ✅ 완료     |
| 0-3      | 라우팅 + AuthGate                     | ✅ 완료     |
| 1        | 홈화면 + 페이즈별 분기                | ✅ 완료     |
| 2        | Posting (게시글 CRUD + 좋아요 + 댓글) | ✅ 완료     |
| 3        | 바자회 + 결제                         | ✅ 완료     |
| 4        | 경매 + 실시간 비딩                    | ✅ 완료     |
| 5        | 마이페이지 + 어드민                   | ✅ 완료     |
| 6        | 디자인 적용 (피그마 기반)             | 대기        |
| 7        | QA + 런칭                             | 대기        |
