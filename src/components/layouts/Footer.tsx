// ============================================================================
// Footer — 사이트 푸터 (Figma 1027:736 v2 정밀 매핑)
//
// 구조:
//   [상단 영역] bg #fff, pt-32 pb-48 px-32 — 메뉴 + ESG 안내 테이블
//     · 메뉴 행: flex gap-80 items-start, pb-48 pr-24
//       - FAQ 링크 → /faq (28px Medium + arrow_outward 32×32)
//       - "행사 관련 문의 하기" 링크 → /qna (28px SemiBold + arrow_outward 32×32)
//       - ESG 프로그램 및 기간 안내 (flex-1, 우측 영역)
//     · 안내 테이블:
//       - 제목 28px SemiBold + border-b #eff4ff pb-48
//       - 행 1: ESG 어워드 (Medium w-200) | 슬기/제로 2줄 (Regular w-280)
//       - 행 2: 종이컵 없는 날 (Medium w-200) | Cup & Reduce day (Regular w-280) | 6월 30일 화요일
//       - 행 3: C&R 바자회 / C&R 경매 2서브 (col1 없음, col2부터 시작)
//
//   [하단 영역] flex-col gap-16 p-24 — 회사정보
//     · (주)씨엔알리서치 16px (letter-spacing 0.16px)
//     · 사업자등록번호 829-87-01755 16px
//     · footer_logo.svg (C&R RESEARCH 워드마크 175×24)
//
// 변경 이력:
//   2026-06-01  Figma 1027:736 v1 매핑
//   2026-06-01  Figma 1027:736 v2 — col1 제거(평면화), 행2 구조변경, © 텍스트→SVG 로고
// ============================================================================

import { Link, useLocation } from 'react-router-dom';
import { DonorMarquee } from '@/components/home/DonorMarquee'; // ← [2026-06-18] 기부자 전광판 푸터 상단 고정
import './Footer.css';

export function Footer() {
  // 어드민(/admin*)에서는 전광판 미렌더 — 무거운 어드민 화면 위에 무한 애니메이션/
  // ResizeObserver/realtime 전광판이 상주하면 버벅임·렌더 루프 유발. 내부 관리 화면엔 불필요.
  const { pathname } = useLocation();
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  return (
    <footer className="esg-footer">
      {/* ── 기부자 전광판 (어드민 제외 모든 페이지 푸터 최상단) ── */}
      {!isAdmin && <DonorMarquee placement="footer" />}

      {/* ── 상단: 메뉴 + ESG 안내 ── */}
      <div className="esg-footer__top">
        <div className="esg-footer__menu-row">
          {/* FAQ 링크 */}
          <Link to="/faq" className="esg-footer__menu-link esg-footer__menu-link--faq">
            <span>FAQ</span>
            <img
              src="/icons/arrow_outward.svg"
              alt=""
              aria-hidden="true"
              width={32}
              height={32}
            />
          </Link>

          {/* 행사 관련 문의 하기 링크 */}
          <Link to="/qna" className="esg-footer__menu-link">
            <span>행사 관련 문의 하기</span>
            <img
              src="/icons/arrow_outward.svg"
              alt=""
              aria-hidden="true"
              width={32}
              height={32}
            />
          </Link>

          {/* ESG 프로그램 및 기간 안내 */}
          <div className="esg-footer__schedule">
            <div className="esg-footer__schedule-title">
              <p>ESG 프로그램 및 기간 안내</p>
            </div>

            <div className="esg-footer__schedule-body">
              {/* 행 1: ESG 어워드 (슬기/제로 2줄) */}
              <div className="esg-footer__row esg-footer__row--bordered">
                <p className="esg-footer__col2">ESG 어워드</p>
                <div className="esg-footer__col3 esg-footer__col3--multi">
                  <div className="esg-footer__sub-row">
                    <p className="esg-footer__label">슬기로운 사회생활 어워드</p>
                    <p className="esg-footer__value">6월 30일 창립기념식에서 시상</p>
                  </div>
                  <div className="esg-footer__sub-row">
                    <p className="esg-footer__label">제로 웨이스트 어워드</p>
                    <p className="esg-footer__value">6월 30일 창립기념식에서 시상</p>
                  </div>
                </div>
              </div>

              {/* 행 2: 종이컵 없는 날 + (Cup & Reduce day + 6월 30일 화요일 sub-row gap-40) */}
              <div className="esg-footer__row esg-footer__row--bordered">
                <p className="esg-footer__col2">종이컵 없는 날</p>
                <div className="esg-footer__sub-row">
                  <p className="esg-footer__label">Cup & Reduce day</p>
                  <p className="esg-footer__value">6월 30일 화요일</p>
                </div>
              </div>

              {/* 행 3: 나눔 순환 자원 위크 (서브행 2개: C&R 바자회 / C&R 경매) */}
              <div className="esg-footer__row esg-footer__row--last">
                <div className="esg-footer__col-rest">
                  {/* 서브행 1: C&R 바자회 */}
                  <div className="esg-footer__sub-block">
                    <p className="esg-footer__col2">C&amp;R 바자회</p>
                    <div className="esg-footer__col3 esg-footer__col3--multi">
                      <div className="esg-footer__sub-row">
                        <p className="esg-footer__label">물품 참여 기간</p>
                        <div className="esg-footer__date-range">
                          <p>6월 8일 월요일</p>
                          <p>—</p>
                          <p>6월 22일 월요일</p>
                        </div>
                      </div>
                      <div className="esg-footer__sub-row">
                        <p className="esg-footer__label">바자회 판매 기간</p>
                        <div className="esg-footer__date-range">
                          <p>6월 30일 화요일</p>
                          <p>—</p>
                          <p>7월 8일 수요일</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 서브행 2: C&R 경매 */}
                  <div className="esg-footer__sub-block">
                    <p className="esg-footer__col2">C&amp;R 경매</p>
                    <div className="esg-footer__date-range">
                      <p>7월 8일 수요일</p>
                      <p>—</p>
                      <p>7월 10일 금요일</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 하단: 회사 정보 + 로고 ── */}
      <div className="esg-footer__bottom">
        <div className="esg-footer__company">
          <p className="esg-footer__company-name">(주)씨엔알리서치</p>
          <div className="esg-footer__biz">
            <p>사업자등록번호</p>
            <p>829-87-01755</p>
          </div>
        </div>
        <img
          src="/icons/footer_logo.svg"
          alt="C&R RESEARCH"
          className="esg-footer__logo"
          width={175}
          height={24}
        />
      </div>
    </footer>
  );
}
