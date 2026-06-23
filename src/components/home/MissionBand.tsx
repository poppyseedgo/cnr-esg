// ============================================================================
// MissionBand.tsx — 메인 2번째 섹션: 미션 밴드 (Figma node 1718:55 "two section")
//
// [변경 이력]
//   2026-06-23  최초 작성 (3컬럼: 잎 / 미션 / 물).
//   2026-06-23  [수정] Figma 변경 반영 — 3컬럼→2컬럼(물 사진 제거), 텍스트 40→60px.
//
// [구성] 2등분 풀블리드 밴드
//   좌: 잎 사진(/home/mission-leaf.jpg, bg #d4ffbd)
//   우: #004228 — "사람과 지구의 건강을 지키는 / 우리의 사명"(60px) + C&R RESEARCH 로고
//   ※ 로고는 기존 cnr-research.svg(흰색). (물 사진 mission-water.jpg 는 더 이상 미사용)
// ============================================================================

import './MissionBand.css';

export function MissionBand() {
  return (
    <section className="mission" aria-label="C&R 29주년 ESG 사명">
      <div className="mission__inner">
        <div className="mission__row">
          {/* 좌: 잎 사진 */}
          <div className="mission__col mission__photo mission__leaf" aria-hidden="true" />

          {/* 우: 미션 문구 + 로고 */}
          <div className="mission__col mission__center">
            <p className="mission__text">사람과 지구의 건강을 지키는<br />우리의 사명</p>
            <img className="mission__logo" src="/home/cnr-research.svg" alt="C&amp;R RESEARCH" />
          </div>
        </div>
      </div>
    </section>
  );
}

export default MissionBand;
