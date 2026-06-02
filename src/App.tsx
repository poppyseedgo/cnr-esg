// ============================================================================
// App — 루트 컴포넌트
//
// 변경 이력:
//   2026-06-02  코드 스플리팅 도입 (라우트 기반 lazy 로딩)
//               - 기존: 전 페이지 정적 import → index 청크 단일 비대화 (500.58KB, 경고)
//               - 변경: HomePage/NotFoundPage/가드만 eager 유지, 나머지 전 페이지 React.lazy
//               - Suspense 경계 3곳: AppLayout(최상위) / MyPage(탭) / AdminPage(탭)
//               - vite.config 의 chunkSizeWarningLimit 은 미변경 (임시방편 배제, 근본 분할로 해결)
//
// 구조:
//   <AuthProvider>           ← 인증 Context (전역)
//     <RouterProvider>       ← createBrowserRouter (data router, ScrollRestoration 활용)
//       <AppLayout>          ← 공통 헤더/푸터 + 본문 Suspense 경계
//         <Outlet />         ← 자식 라우트 (대부분 lazy)
//       </AppLayout>
//   </AuthProvider>
// ============================================================================

import { lazy } from 'react'; // ← [코드 스플리팅] React.lazy 사용
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useCurrentUser';
import { AppLayout } from '@/components/layouts/AppLayout';
import { RequireAuth } from '@/components/routing/RequireAuth';
import { RequireAdmin } from '@/components/routing/RequireAdmin';
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
const PostsPage = lazy(() => import('@/pages/PostsPage').then((m) => ({ default: m.PostsPage })));
const PostDetailPage = lazy(() => import('@/pages/PostDetailPage').then((m) => ({ default: m.PostDetailPage })));
const BazaarPage = lazy(() => import('@/pages/BazaarPage').then((m) => ({ default: m.BazaarPage })));
const BazaarProductPage = lazy(() => import('@/pages/BazaarProductPage').then((m) => ({ default: m.BazaarProductPage })));
const AuctionPage = lazy(() => import('@/pages/AuctionPage').then((m) => ({ default: m.AuctionPage })));
const AuctionDetailPage = lazy(() => import('@/pages/AuctionDetailPage').then((m) => ({ default: m.AuctionDetailPage })));
const CartPage = lazy(() => import('@/pages/CartPage').then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const OrderDetailPage = lazy(() => import('@/pages/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })));
const DonatePage = lazy(() => import('@/pages/DonatePage').then((m) => ({ default: m.DonatePage })));
const FaqPage = lazy(() => import('@/pages/FaqPage').then((m) => ({ default: m.FaqPage })));
const QnaPage = lazy(() => import('@/pages/QnaPage').then((m) => ({ default: m.QnaPage })));
const DonateOrderPage = lazy(() => import('@/pages/DonateOrderPage').then((m) => ({ default: m.DonateOrderPage })));
const DonationCertificatePage = lazy(() => import('@/pages/DonationCertificatePage').then((m) => ({ default: m.DonationCertificatePage })));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));

// MyPage 계열 (단일 파일 → 단일 청크 공유)
const MyPage = lazy(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPage })));
const MyPagePending = lazy(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPagePending })));
const MyPageCompleted = lazy(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPageCompleted })));
const MyPageBidding = lazy(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPageBidding })));
const MyPageAuctionWon = lazy(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPageAuctionWon })));
const MyPageWishlist = lazy(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPageWishlist })));
const MyPageDonations = lazy(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPageDonations })));

// Admin 계열 (각 파일 독립 청크)
const AdminPage = lazy(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings').then((m) => ({ default: m.AdminSettings })));
const AdminAuctions = lazy(() => import('@/pages/admin/AdminAuctions').then((m) => ({ default: m.AdminAuctions })));
const AdminProducts = lazy(() => import('@/pages/admin/AdminProducts').then((m) => ({ default: m.AdminProducts })));
const AdminOrders = lazy(() => import('@/pages/admin/AdminOrders').then((m) => ({ default: m.AdminOrders })));
const AdminPosts = lazy(() => import('@/pages/admin/AdminPosts').then((m) => ({ default: m.AdminPosts })));
const AdminEmails = lazy(() => import('@/pages/admin/AdminEmails').then((m) => ({ default: m.AdminEmails })));
const AdminDonations = lazy(() => import('@/pages/admin/AdminDonations').then((m) => ({ default: m.AdminDonations })));
const AdminQA = lazy(() => import('@/pages/admin/AdminQA').then((m) => ({ default: m.AdminQA })));
const AdminBazaarGuide = lazy(() => import('@/pages/admin/AdminBazaarGuide').then((m) => ({ default: m.AdminBazaarGuide })));
const AdminFaq = lazy(() => import('@/pages/admin/AdminFaq').then((m) => ({ default: m.AdminFaq })));
const AdminQnaEvent = lazy(() => import('@/pages/admin/AdminQnaEvent').then((m) => ({ default: m.AdminQnaEvent })));

// ============================================================================
// Router 정의 (구조 동일 — element 참조만 eager→lazy 로 교체됨)
// ============================================================================

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      // 공개 페이지 (비로그인 OK)
      { path: '/', element: <HomePage /> },
      { path: '/posts', element: <PostsPage /> },
      { path: '/posts/:category', element: <PostsPage /> },
      { path: '/posts/detail/:id', element: <PostDetailPage /> },
      { path: '/bazaar', element: <ActivityGate activityKey="bazaar"><BazaarPage /></ActivityGate> },
      { path: '/bazaar/:productId', element: <ActivityGate activityKey="bazaar"><BazaarProductPage /></ActivityGate> },
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
          { path: 'auctions', element: <AdminAuctions /> },
          { path: 'orders', element: <AdminOrders /> },
          { path: 'donations', element: <AdminDonations /> },
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
