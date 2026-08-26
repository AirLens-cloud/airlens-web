# 컴포넌트 자산 보고서 (explore-components)

드리프트: WfBox·PlaceholderGlobe·RagPanel은 실체 없음(문서 stale). 실제 = 페이지별 CSS 클래스 / GlobeFallback.tsx / ChatFAB+ChatPanel.

## Wf* 프리미티브 (`components/wireframe/`, 35파일, 배럴 index.ts)
- WfButton (`WfButton.tsx:16`) — variant primary/ghost/ink/outline/light/danger × family pill/square. `reado.css:858` `.btn{padding:12px 20px;border-radius:999px;font:700 11px mono;uppercase}` .btn-ink{bg:#000;color:#fff} hover→orange, .btn-outline{border:2px solid #000}, .btn-danger{bg:var(--semantic-bad)}
- WfSegmented (`:11`) — `reado.css:872` .seg{border:1px solid #000} .seg-item{padding:8px 16px;font:700 10.5px mono;border-right:1px solid #000} active{bg:#000;color:#fff}
- WfTabs (`:15`, ARIA tablist) — `reado.css:3798` 하단 1px rule, active::after 2px 검정 밑줄, tab padding 10px 16px font 600 11px mono ink-3
- WfToggle (`:30`) — `reado.css:4071` 트랙 36×20 border 1px ink-3 r999, checked bg #000, 썸 14px 원 translateX(16px)
- AqiDot (`:29`) — tier good/moderate/unhealthy/hazard/unknown, 10px 원, unknown=1px dashed ink-3 (`reado.css:4055`)
- DqssBadge (`:41`) — compact/default/verbose, `reado.css:4222` padding 2px 8px border 1px dashed rule mono 10px, data-dqss별 pastel bg+border
- SkyStrip (`:47`) — live/loading/unavailable × strip/stack. `reado.css:726` padding 14px pad-x, border-bottom rule, [data-aqi=good]{linear-gradient(to right,#cfe7ff,#f0f5fb)}, num 700 20px mono, live점 6px orange pulse 1.6s
- LiveBadge (`:35`) — 초록 5px 점 hud-pulse 2.4s + LIVE / 회색 SNAPSHOT·나이 (`reado.css:1594`)
- WfTag (`:21`) — 3px 9px, 1px solid rule, 600 10px mono uppercase (`reado.css:3985`)
- WfStamp (`:23`) — default/primary/unverified(점선+ink-2)
- WfNote (`:19`) — `source · date · extra` mono 10.5px (`reado.css:2729`)
- WfRule (`:19`) — solid/dashed hr (`reado.css:2743`)
- WfDispatchOrnament (`:6`) — `●●● ───── NO. 01` mono (`reado.css:854`)
- WfPlaceholder (`:26`) — `reado.css:4000` bg #fbf8ee + repeating-linear-gradient 45/-45° X 해치, 점선 테두리
- WfSkeleton (`:8`) — line/block/circle, bg-1 + wf-pulse 1.4s opacity .4↔.8 (`reado.css:4042`)
- WfDataState (`:80`) — partial/empty/no-coverage/unavailable/error: stamp→title→lede(60ch)→재시도→메타 dl (`reado.css:2755`)
- ScopeChip/Group (`:20`/`:25`) — p/r/t/pub, 세로 칩(라벨+설명) border 1px ink-2, active 검정 반전 (`reado.css:1028`)
- WfBreadcrumb (`:16`) — `/ SECTION · SUBSECTION` (`reado.css:3837`)
- WfPagination (`:16`) — load-more/prev-next, outline 사각버튼 + "N / M" (`reado.css:3852`)
- WfConfirmDialog (`:24`) — 중앙모달 min(100%,30rem), border 1px #000, shadow-pop, 백드롭 .45, focus trap (`reado.css:3862`)
- WfCoachmark (`:49`) — auto/top/bottom, ≤480px 시트, 45° 캐럿, border 1px #000 (`reado.css:3901`)
- wfToast (`WfToast.tsx:18`) — sonner 래퍼 paper-1+hairline+mono
- WfGlassCard (`:31`) — day/night × plate. `reado.css:4780` .glass-card{bg:var(--glass-fill);border:1px solid var(--glass-border);radius:20px;backdrop-filter:blur(20px)} night=--glass-night-*
- WfChartFrame (`composites/WfChartFrame.tsx:69`) — 헤더(title+DqssBadge)→p10/p90밴드→차트→범례→"95%CI ±N", 빈데이터 해치
- WfCodeBlock — bg-1 + 1px dashed + 12px mono + 언어태그 (`reado.css:4144`)
- WfTimelineScrubber — 스텝버튼 가로, active 검정 반전 (`reado.css:4176`)
- WfChart* 킷 (`chart/*.tsx` Surface/Axis/Line/Area/Fan/Crosshair/Brush) — d3-scale + 자체 SVG (`chart/wf-chart.css`)

## 레이아웃 셸
- PublicPageContainer (`:27`) — text 720px / hub 1280px(--shell) / wide 100vw. `reado.css:453` data-tier 분기
- Navbar (`Navbar.tsx:70`) — fixed top 24px island, 64px, 초기 투명 → scrolled: rgba(255,255,255,.72)+blur(20px) saturate(180%)+shadow-pop, transition .7s cubic-bezier(.22,1,.36,1) (`reado.css:471-476`)
- Footer (`Footer.tsx:11`) — .bot 5컬럼(브랜드+Explore+Project+Legal+Contact) + row-bot

## 브랜드
- AirLensMark (`AirLensMark.tsx:11`) — 7 세로 막대 EQ + 중앙 오렌지 점. alm-breathe(scaleY 1↔1.08, delay 파도) + alm-pulse. currentColor, 32×32, reduced-motion 대응
- AirLensWordmark — 존재만 확인

## Globe
- GlobeFallback (`:4`) — 2D SVG: 방사형 파랑 원 + 시안 rim + 위경도 타원 그리드 + 6 도시점
- GlobeObsHud (`globe/observatory/GlobeObsHud.tsx:12`) — "ATMOSPHERIC OBSERVATORY" + 점멸점 + 레이어/출처/유효시각 mono 스트립
- AtmosphericModeRail (`:7`) — 좌측 세로 모드 네비 "LENS / 05", 활성 ● 비활성 ○
- AtmosphericEvidenceCard (`:21`) — 값+단위 → p10-p90 트랙(low/center/high 마커) → DQSS → provenance dl
- 미조사: GlobeTooltip, MarkerTooltip, StationInfoPanel, PredictionInfoPanel, PredictionTooltip

## obs 프리미티브 (`styles/observatory-shared.css` 76줄)
- .m/.m-b mono 10px uppercase .14em / .obs-dqss(em 반전배지) / .obs-cnr 코너브래킷 4방(clip-path 마운트)
- TodaySkyWindow (`today/observatory/TodaySkyWindow.tsx:40`) — 하늘그라데이션+obs HUD: 코너브래킷 4개, 초대형 타이틀 clamp(38px,6vw,84px) OG900, PM2.5 clamp(54px,9vw,84px) mono, p10-p90+DQSS
- DawnReport (`home/observatory/DawnReport.tsx:18`) — "Field Report" 레터헤드, 스크롤 스크러빙 등장, `>` 프롬프트 mono줄
- InkInstrument (`home/observatory/InkInstrument.tsx:55`) — 미니 SVG 3종: spark/network(4노드)/arc(실선+점선 이중호)
- dispatch/insights/blog/article observatory = CSS만 존재

## 오버레이
- NotificationPanel (`notifications/NotificationPanel.tsx:37`) — fixed top64 right16 340×480, border rule + shadow-pop, 아이콘+제목+상대시간, 읽음 .75 (`reado.css:4526`)
- ChatFAB/ChatPanel (`chat/ChatFAB.tsx:14`) — 우하단 FAB 검정+오렌지 하드섀도 `2px 2px 0 var(--orange)`, "ASK ↗"↔"CLOSE", 패널 420×620 border 1px ink-0 (`styles/contribute-chat.css:456`)

## 미조사 존재 확인
OverlayPicker, GlobeShareButton, AtmosphericMotionLayer, CoachmarkTour, WfRobustnessChecks, DataHealthBanner, TransparencyPanel
