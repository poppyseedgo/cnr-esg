// ============================================================================
// App — 루트 컴포넌트 (Phase 0-3: 라우팅 적용)
//
// 구조:
//   <AuthProvider>           ← 인증 Context (전역)
//     <BrowserRouter>        ← React Router
//       <Routes>
//         <Route element={<AppLayout />}>   ← 공통 헤더/푸터
//           <Route path="/" element={<HomePage />} />     ← 공개
//           <Route path="/posts" ... />                    ← 공개
//           <Route path="/bazaar" ... />                   ← 공개 (구매는 로그인 필요)
//           <Route path="/auction" ... />                  ← 공개 (입찰은 로그인 필요)
//           <Route path="/cart" element={<RequireAuth>...} />
//           <Route path="/mypage/*" element={<RequireAuth>...} />
//           <Route path="/admin/*" element={<RequireAdmin>...} />
//         </Route>
//       </Routes>
//     </BrowserRouter>
//   </AuthProvider>
//
// 라우터: createBrowserRouter (data router) 사용해서 ScrollRestoration 활용.
// ============================================================================

import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useCurrentUser';
import { AppLayout } from '@/components/layouts/AppLayout';
import { RequireAuth } from '@/components/routing/RequireAuth';
import { RequireAdmin } from '@/components/routing/RequireAdmin';
import { ActivityGate } from '@/components/ActivityGate';

// Pages
import { HomePage } from '@/pages/HomePage';
import { PostsPage } from '@/pages/PostsPage';
import { PostDetailPage } from '@/pages/PostDetailPage';
import { BazaarPage } from '@/pages/BazaarPage';
import { BazaarProductPage } from '@/pages/BazaarProductPage';
import { AuctionPage } from '@/pages/AuctionPage';
import { AuctionDetailPage } from '@/pages/AuctionDetailPage';
import { CartPage } from '@/pages/CartPage';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { OrderDetailPage } from '@/pages/OrderDetailPage';
import { DonatePage } from '@/pages/DonatePage';
import { FaqPage } from '@/pages/FaqPage';
import { QnaPage } from '@/pages/QnaPage';
import { DonateOrderPage } from '@/pages/DonateOrderPage';
import { DonationCertificatePage } from '@/pages/DonationCertificatePage';
import {
  MyPage,
  MyPagePending,
  MyPageCompleted,
  MyPageBidding,
  MyPageAuctionWon,
  MyPageWishlist,
  MyPageDonations,
} from '@/pages/MyPage';
import { AdminPage } from '@/pages/AdminPage';
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { AdminSettings } from '@/pages/admin/AdminSettings';
import { AdminAuctions } from '@/pages/admin/AdminAuctions';
import { AdminProducts } from '@/pages/admin/AdminProducts';
import { AdminOrders } from '@/pages/admin/AdminOrders';
import { AdminPosts } from '@/pages/admin/AdminPosts';
import { AdminEmails } from '@/pages/admin/AdminEmails';
import { AdminDonations } from '@/pages/admin/AdminDonations';
import { AdminQA } from '@/pages/admin/AdminQA';
import { AdminBazaarGuide } from '@/pages/admin/AdminBazaarGuide';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// ============================================================================
// Router 정의
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
