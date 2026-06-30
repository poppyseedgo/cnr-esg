// ============================================================================
// HeroBazaar.tsx — 신규 메인 히어로 (Figma node 1698:1390)
//
// [변경 이력]
//   2026-06-23  최초 작성. 기존 포스터 그리드 HomeHero 를 대체하는 메인 히어로.
//
// [구성]
//   좌(투명): 물건 미리보기/Coming Soon · "나무 심는 바자회"(타이틀) · 바자회 오픈 6/30
//             → 카운트다운(Days/Hours/min/sec) → 2026 Bazzar & Auction / 6/30—7/10
//   우(연녹): DonationTreeGrid(나무 그리드) + DonationProgressBar(진행바)
//
// [데이터 — 추측/하드코딩 배제]
//   · 카운트다운 타깃 = getActivity('bazaar').period.starts_at_utc (esg_settings SSOT)
//       바자회 오픈 시각이 데이터로 바뀌면 자동 반영. 오픈 후엔 0으로 clamp.
//   · 모금 현황 current/goal = useDonationStatus() (esg_donation_stats + donation_goal)
//
// [스타일] HeroBazaar.css (cqw 비례 스케일 + 사이드바 풀블리드 + 협폭 스택)
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom'; // ← [2026-06-29] 좌측 카드 → 바자회 물품 리스트 링크
import { useEventPhase } from '@/hooks/useEventPhase';
import { useDonationStatus } from '@/hooks/useDonationStatus';
import { DonationTreeGrid } from '@/components/donation/DonationTreeGrid';
import { DonationProgressBar } from '@/components/donation/DonationProgressBar';
import './HeroBazaar.css';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 타깃까지 남은 d/h/m/s (1초 틱). 타깃 없으면 null, 지났으면 0 clamp */
function useCountdown(targetIso: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000); // ← 1초 틱
    return () => window.clearInterval(id);
  }, []);
  if (!targetIso) return null;
  const diff = Math.max(0, new Date(targetIso).getTime() - now); // ← 지났으면 0
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  };
}

export function HeroBazaar() {
  const { getActivity } = useEventPhase();
  const { current, goal } = useDonationStatus();

  const bazaar = getActivity('bazaar');
  const cd = useCountdown(bazaar.period?.starts_at_utc); // ← 바자회 오픈까지

  const units = [
    { v: cd ? pad2(cd.d) : '--', l: 'Days' },
    { v: cd ? pad2(cd.h) : '--', l: 'Hours' },
    { v: cd ? pad2(cd.m) : '--', l: 'min' },
    { v: cd ? pad2(cd.s) : '--', l: 'sec' },
  ];

  return (
    <section className="hero-bz" aria-label="나무 심는 바자회 안내 및 모금 현황">
      <div className="hero-bz__inner">
        <div className="hero-bz__box">
          {/* ── 좌측: 텍스트 / 카운트다운 — 클릭 시 바자회 물품 리스트로 (← [2026-06-29]) ── */}
          <Link
            to="/bazaar"
            className="hero-bz__left hero-bz__left--link"
            aria-label="바자회 물품 리스트 보기"
          >
            <div className="hero-bz__toprow">
              <p className="hero-bz__note">물건 미리보기<br />Coming Soon</p>
              <h2 className="hero-bz__title">나무 심는<br />바자회</h2>
              <p className="hero-bz__note">바자회 오픈<br />6/30 Tue</p>
            </div>

            <div className="hero-bz__cd" aria-label="바자회 오픈까지 남은 시간">
              {units.map((u) => (
                <div className="hero-bz__cd-unit" key={u.l}>
                  <span className="hero-bz__cd-num">{u.v}</span>
                  <span className="hero-bz__cd-lbl">{u.l}</span>
                </div>
              ))}
            </div>

            <div className="hero-bz__bottom">
              <p className="hero-bz__bottom-ttl">2026<br />Bazzar &amp; Auction</p>
              <p className="hero-bz__bottom-date">6/30 — 7/10</p>
            </div>
          </Link>

          {/* ── 우측: 나무 그리드 + 진행바 ── */}
          <div className="hero-bz__right">
            <div className="hero-bz__grid">
              <DonationTreeGrid current={current} goal={goal} />
            </div>
            <div className="hero-bz__bar">
              <DonationProgressBar current={current} goal={goal} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroBazaar;
