// ============================================================================
// App — 루트 컴포넌트
//
// 변경 이력:
//   2026-06-02  코드 스플리팅 도입 (라우트 기반 lazy 로딩)
//               - 기존: 전 페이지 정적 import → index 청크 단일 비대화 (500.58KB, 경고)
//               - 변경: HomePage/NotFoundPage/가드만 eager 유지, 나머지 전 페이지 React.lazy
//               - Suspense 경계 3곳: AppLayout(최상위) / MyPage(탭) / AdminPage(탭)
//               - vite.config 의 chunkSizeWarningLimit 은 미변경 (임시방편 배제, 근본 분할로 해결)
//   2026-06-02  청크 stale 복구: 전 lazy 를 lazyWithRetry 로 교체 (배포로 사라진 옛 청크
//               요청 시 1회 자동 새로고침). main.tsx vite:preloadError + public/_headers 동반.
//
// 구조:
//   <AuthProvider>           ← 인증 Context (전역)
//     <RouterProvider>       ← createBrowserRouter (data router, ScrollRestoration 활용)
//       <AppLayout>          ← 공통 헤더/푸터 + 본문 Suspense 경계
//         <Outlet />         ← 자식 라우트 (대부분 lazy)
//       </AppLayout>
//   </AuthProvider>
// ============================================================================

import { lazyWithRetry } from '@/lib/lazyWithRetry'; // ← 청크 로드 실패 시 1회 자동 새로고침 래퍼
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useCurrentUser';
import { AppLayout } from '@/components/layouts/AppLayout';
import { RequireAuth } from '@/components/routing/RequireAuth';
import { RequireAdmin } from '@/components/routing/RequireAdmin';
import { RouteError } from '@/components/routing/RouteError'; // ← [2026-06-18] 라우트 에러 폴백
import { ActivityGate } from '@/components/ActivityGate';

// ----------------------------------------------------------------------------
// Eager (정적) — 첫 진입 필수 / 분리 무의미한 페이지
//   HomePage: 100% 사용자가 첫 진입하는 랜딩 → 정적 유지로 첫 페인트 Suspense 깜빡임 방지
//   NotFoundPage: 708B 초소형 → 별도 청크 분리 이득 없음
// ----------------------------------------------------------------------------
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// ----------------------------------------------------------------------------
// Lazy (지연 로딩) — 진입 시점에만 청크 로드
//   named export 파일이므로 .then 으로 default 매핑
//   MyPage 계열은 모두 같은 파일(MyPage.tsx) → Rollup 이 단일 청크로 묶음
//   admin/* 12개는 각각 독립 청크 → 어드민 미진입 사용자는 코드 다운로드 0
// ----------------------------------------------------------------------------
const PostsPage = lazyWithRetry(() => import('@/pages/PostsPage').then((m) => ({ default: m.PostsPage })));
const PostDetailPage = lazyWithRetry(() => import('@/pages/PostDetailPage').then((m) => ({ default: m.PostDetailPage })));
const BazaarPage = lazyWithRetry(() => import('@/pages/BazaarPage').then((m) => ({ default: m.BazaarPage })));
const BazaarProductPage = lazyWithRetry(() => import('@/pages/BazaarProductPage').then((m) => ({ default: m.BazaarProductPage })));
const AuctionPage = lazyWithRetry(() => import('@/pages/AuctionPage').then((m) => ({ default: m.AuctionPage })));
const AuctionDetailPage = lazyWithRetry(() => import('@/pages/AuctionDetailPage').then((m) => ({ default: m.AuctionDetailPage })));
const CartPage = lazyWithRetry(() => import('@/pages/CartPage').then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazyWithRetry(() => import('@/pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const OrderDetailPage = lazyWithRetry(() => import('@/pages/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })));
const DonatePage = lazyWithRetry(() => import('@/pages/DonatePage').then((m) => ({ default: m.DonatePage })));
const FaqPage = lazyWithRetry(() => import('@/pages/FaqPage').then((m) => ({ default: m.FaqPage })));
const QnaPage = lazyWithRetry(() => import('@/pages/QnaPage').then((m) => ({ default: m.QnaPage })));
const DonateOrderPage = lazyWithRetry(() => import('@/pages/DonateOrderPage').then((m) => ({ default: m.DonateOrderPage })));
const DonationCertificatePage = lazyWithRetry(() => import('@/pages/DonationCertificatePage').then((m) => ({ default: m.DonationCertificatePage })));
const NotificationsPage = lazyWithRetry(() => import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));

// MyPage 계열 (단일 파일 → 단일 청크 공유)
const MyPage = lazyWithRetry(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPage })));
const MyPagePending = lazyWithRetry(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPagePending })));
const MyPageCompleted = lazyWithRetry(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPageCompleted })));
const MyPageBidding = lazyWithRetry(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPageBidding })));
const MyPageAuctionWon = lazyWithRetry(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPageAuctionWon })));
const MyPageWishlist = lazyWithRetry(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPageWishlist })));
const MyPageDonations = lazyWithRetry(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPageDonations })));
const MyPageQna = lazyWithRetry(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPageQna })));

// Admin 계열 (각 파일 독립 청크)
const AdminPage = lazyWithRetry(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const AdminDashboard = lazyWithRetry(() => import('@/pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AdminSettings = lazyWithRetry(() => import('@/pages/admin/AdminSettings').then((m) => ({ default: m.AdminSettings })));
const AdminAuctions = lazyWithRetry(() => import('@/pages/admin/AdminAuctions').then((m) => ({ default: m.AdminAuctions })));
const AdminProducts = lazyWithRetry(() => import('@/pages/admin/AdminProducts').then((m) => ({ default: m.AdminProducts })));
const AdminBazaarIntake = lazyWithRetry(() => import('@/pages/admin/AdminBazaarIntake').then((m) => ({ default: m.AdminBazaarIntake }))); // ← [추가 2026-06-08] 바자회 물품 접수
const AdminOrders = lazyWithRetry(() => import('@/pages/admin/AdminOrders').then((m) => ({ default: m.AdminOrders })));
const AdminPosts = lazyWithRetry(() => import('@/pages/admin/AdminPosts').then((m) => ({ default: m.AdminPosts })));
const AdminEmails = lazyWithRetry(() => import('@/pages/admin/AdminEmails').then((m) => ({ default: m.AdminEmails })));
const AdminDonations = lazyWithRetry(() => import('@/pages/admin/AdminDonations').then((m) => ({ default: m.AdminDonations })));
const AdminRoster = lazyWithRetry(() => import('@/pages/admin/AdminRoster').then((m) => ({ default: m.AdminRoster }))); // ← [추가 2026-06-16 버그#5] 명단 관리
const AdminQA = lazyWithRetry(() => import('@/pages/admin/AdminQA').then((m) => ({ default: m.AdminQA })));
const AdminBazaarGuide = lazyWithRetry(() => import('@/pages/admin/AdminBazaarGuide').then((m) => ({ default: m.AdminBazaarGuide })));
const AdminFaq = lazyWithRetry(() => import('@/pages/admin/AdminFaq').then((m) => ({ default: m.AdminFaq })));
const AdminQnaEvent = lazyWithRetry(() => import('@/pages/admin/AdminQnaEvent').then((m) => ({ default: m.AdminQnaEvent })));

// ============================================================================
// Router 정의 (구조 동일 — element 참조만 eager→lazy 로 교체됨)
// ============================================================================

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteError />, // ← [2026-06-18] 청크/렌더 실패 시 친절한 복구 UI(모바일 대응)
    children: [
      // 공개 페이지 (비로그인 OK)
      { path: '/', element: <HomePage /> },
      { path: '/posts', element: <PostsPage /> },
      { path: '/posts/:category', element: <PostsPage /> },
      { path: '/posts/detail/:id', element: <PostDetailPage /> },
      // ← [2026-06-25] 바자회 ActivityGate 제거: 시작 전에도 전 직원 '열람' 허용(요구사항#3).
      //                구매 차단은 useBazaarSale 정책 + 서버 트리거가 담당. (경매는 게이트 유지)
      { path: '/bazaar', element: <BazaarPage /> },
      { path: '/bazaar/:productId', element: <BazaarProductPage /> },
      { path: '/auction', element: <ActivityGate activityKey="auction"><AuctionPage /></ActivityGate> },
      { path: '/auction/:auctionId', element: <ActivityGate activityKey="auction"><AuctionDetailPage /></ActivityGate> },
      { path: '/donate', element: <DonatePage /> },
      { path: '/faq', element: <FaqPage /> },
      { path: '/qna', element: <QnaPage /> },

      // 로그인 필수
      {
        path: '/cart',
        element: (
          <RequireAuth>
            <CartPage />
          </RequireAuth>
        ),
      },
      {
        path: '/checkout',
        element: (
          <RequireAuth>
            <CheckoutPage />
          </RequireAuth>
        ),
      },
      {
        path: '/orders/:orderNumber',
        element: (
          <RequireAuth>
            <OrderDetailPage />
          </RequireAuth>
        ),
      },
      {
        path: '/donate/:id',
        element: (
          <RequireAuth>
            <DonateOrderPage />
          </RequireAuth>
        ),
      },
      {
        path: '/donate/:id/certificate',
        element: (
          <RequireAuth>
            <DonationCertificatePage />
          </RequireAuth>
        ),
      },
      {
        path: '/notifications',
        element: (
          <RequireAuth>
            <NotificationsPage />
          </RequireAuth>
        ),
      },
      {
        path: '/mypage',
        element: (
          <RequireAuth>
            <MyPage />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <Navigate to="pending" replace /> },
          { path: 'pending', element: <MyPagePending /> },
          { path: 'completed', element: <MyPageCompleted /> },
          { path: 'bidding', element: <MyPageBidding /> },
          { path: 'auction-won', element: <MyPageAuctionWon /> },
          { path: 'wishlist', element: <MyPageWishlist /> },
          { path: 'donations', element: <MyPageDonations /> },
          { path: 'qna', element: <MyPageQna /> },
        ],
      },

      // 관리자 전용
      {
        path: '/admin',
        element: (
          <RequireAdmin>
            <AdminPage />
          </RequireAdmin>
        ),
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard', element: <AdminDashboard /> },
          { path: 'posts', element: <AdminPosts /> },
          { path: 'qa', element: <AdminQA /> },
          { path: 'bazaar-guide', element: <AdminBazaarGuide /> },
          { path: 'faq', element: <AdminFaq /> },
          { path: 'qna-event', element: <AdminQnaEvent /> },
          { path: 'products', element: <AdminProducts /> },
          { path: 'bazaar-intake', element: <AdminBazaarIntake /> }, // ← [추가 2026-06-08] 바자회 물품 접수
          { path: 'auctions', element: <AdminAuctions /> },
          { path: 'orders', element: <AdminOrders /> },
          { path: 'donations', element: <AdminDonations /> },
          { path: 'roster', element: <AdminRoster /> }, // ← [추가 2026-06-16 버그#5] 명단 관리
          { path: 'settings', element: <AdminSettings /> },
          { path: 'emails', element: <AdminEmails /> },
        ],
      },

      // 404
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
