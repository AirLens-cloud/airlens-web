/**
 * literature.ts — the external published work behind AirLens's methods, as a
 * repo-owned source. Sixth corpus source for `scripts/build-corpus.mjs`
 * (the first five are this site's own rendered content).
 *
 * ## Why this file exists
 *
 * The assistant's corpus was 62 chunks of AirLens's own documentation and zero
 * academic sources — so "is there a paper behind this?" had no grounded answer
 * and the model could only improvise one. The research was already done; it
 * just lived outside the repo.
 *
 * ## Provenance (vault, not reachable from CI — hence the copy)
 *
 *   LITERATURE_REFS      ← raw/claude-science/2026-09-02-platform-strategy/
 *                          science-out/s2-sota/sota_lit.json  (93 refs)
 *   CALIBRATION_METHODS  ← .../science-out/prior-conformal-session/
 *                          t2_calibration_methods.csv          (18 methods)
 *   DOMAIN_POSITIONS     ← .../science-out/s2-sota/AirLens_methodology_sota.md
 *                          §1.1 / §2.1 / §3.1 / §4.1·4.3 (quoted, not paraphrased)
 *
 * The ledger's own inclusion rule: **"arXiv ID 또는 DOI가 API로 확인된 문헌만
 * 포함. 확인 실패 항목은 전량 제외."** All 93 entries carry
 * `verification.status = "verified"` (arXiv Atom API id_list / Crossref
 * /works/{DOI}, retrieved 2026-09-02). Nothing here was accepted on a title
 * match alone, and `quantitativeClaim` is null wherever the paper's own
 * abstract/body did not state a figure — an absent number is recorded as
 * absent rather than filled in from a secondary source.
 *
 * ## What this file is NOT
 *
 * These are *other people's* published results. They are not AirLens
 * measurements, and — as the SOTA review says of its own comparison table —
 * "절대 R² 비교가 성립하지 않는다" because region, period, split design and
 * AOD product all differ. Every emitted chunk repeats that caveat, and
 * `buildGroundedContext` (workers/assistant/src/rag.ts) labels each retrieved
 * chunk with its category so the model cannot present a paper as AirLens's own
 * documentation.
 *
 * ## Known limits of the evidence itself
 *
 * See CORPUS_CAVEAT below — it ships as a chunk of its own so the assistant can
 * answer "how much should I trust this reading list?" from the corpus rather
 * than from confidence.
 *
 * ## Maintenance
 *
 * Hand-edited from here on. To re-derive after a new science session, re-run
 * the same extraction against the vault artifacts named above; chunk ids are
 * `literature:*` and stable, so re-indexing overwrites in place — but a renamed
 * or dropped entry leaves an orphan vector behind (Vectorize upsert never
 * deletes), so removals need an explicit delete of the old id.
 */

export interface LiteratureRef {
  /** Stable short id from the ledger; also the chunk id suffix. */
  refId: string
  title: string
  authors: string[]
  year: number | null
  arxivId: string | null
  doi: string | null
  /** What this work is *to AirLens* — from the ledger, in Korean. */
  role: string
  /** Domain ids; see LITERATURE_DOMAINS. */
  domains: number[]
  /**
   * A figure the paper itself reports, verbatim. `null` means the paper states
   * none in its abstract/body — never "we didn't look".
   */
  quantitativeClaim: string | null
}

export interface CalibrationMethod {
  slug: string
  method: string
  family: string
  idea: string
  assumptions: string
  limits: string
  applicability: string
  priority: string
  /** Identifier string(s) as recorded in the comparison table. */
  sources: string
}

export interface LiteratureDomain {
  id: number
  title: string
  /** AirLens's current state in this area, quoted from the SOTA review. */
  position: string
  /** Where the honest uncertainty is — never omitted. */
  caveat: string
  /** Anchor on /methodology that best matches this area. */
  href: string
}

export const LITERATURE_REFS: LiteratureRef[] = [
  {
    refId: "xgboost",
    title: "XGBoost: A Scalable Tree Boosting System",
    authors: ["Tianqi Chen", "Carlos Guestrin"],
    year: 2016,
    arxivId: "1603.02754",
    doi: "10.1145/2939672.2939785",
    role: "현행 AOD 엔진의 기반 알고리즘",
    domains: [1],
    quantitativeClaim: null,
  },
  {
    refId: "cqr",
    title: "Conformalized Quantile Regression",
    authors: ["Yaniv Romano", "Evan Patterson", "Emmanuel J. Candès"],
    year: 2019,
    arxivId: "1905.03222",
    doi: null,
    role: "분위회귀 구간의 conformal 재보정(현행 split-CQR의 원 방법)",
    domains: [1, 3, 4],
    quantitativeClaim: null,
  },
  {
    refId: "ngboost",
    title: "NGBoost: Natural Gradient Boosting for Probabilistic Prediction",
    authors: ["Tony Duan", "Anand Avati", "Daisy Yi Ding", "Khanh K. Thai", "Sanjay Basu", "Andrew Y. Ng"],
    year: 2019,
    arxivId: "1910.03225",
    doi: null,
    role: "부스팅 기반 확률예측 대안(NLL 최적화, 분포 출력)",
    domains: [1],
    quantitativeClaim: null,
  },
  {
    refId: "gtwr",
    title: "Geographically and temporally weighted regression for modeling spatio-temporal variation in house prices",
    authors: ["Huang", "Wu", "Barry"],
    year: 2010,
    arxivId: null,
    doi: "10.1080/13658810802672469",
    role: "현행 GTWR 공간보정의 원 방법",
    domains: [1, 2],
    quantitativeClaim: null,
  },
  {
    refId: "wei2019_stet",
    title: "Estimating 1-km-resolution PM2.5 concentrations across China using the space-time random forest approach",
    authors: ["Wei", "Huang", "Li", "Xue", "Peng", "Sun"],
    year: 2019,
    arxivId: null,
    doi: "10.1016/j.rse.2019.111221",
    role: "중국 1km STET 계열 AOD→PM2.5 대표 성능 기준선",
    domains: [1],
    quantitativeClaim: null,
  },
  {
    refId: "wei2021_himawari",
    title: "Himawari-8-derived diurnal variations in ground-level PM\n                    2.5\n                    pollution across China using the fast space-time Light Gradient Boosting Machine (LightGBM)",
    authors: ["Wei", "Li", "Pinker", "Wang", "Sun", "Xue"],
    year: 2021,
    arxivId: null,
    doi: "10.5194/acp-21-7863-2021",
    role: "정지궤도(Himawari-8) 기반 시간해상 PM2.5 추정",
    domains: [1],
    quantitativeClaim: null,
  },
  {
    refId: "li2017_geodl",
    title: "Estimating Ground‐Level PM\n                    2.5\n                    by Fusing Satellite and Station Observations: A Geo‐Intelligent Deep Learning Approach",
    authors: ["Li", "Shen", "Yuan", "Zhang", "Zhang"],
    year: 2017,
    arxivId: null,
    doi: "10.1002/2017GL075710",
    role: "지리정보 결합 딥러닝 AOD→PM2.5(초기 DL 전환점)",
    domains: [1],
    quantitativeClaim: null,
  },
  {
    refId: "di2019_ensemble",
    title: "An ensemble-based model of PM2.5 concentration across the contiguous United States with high spatiotemporal resolution",
    authors: ["Di", "Amini", "Shi", "Kloog", "Silvern", "Kelly"],
    year: 2019,
    arxivId: null,
    doi: "10.1016/j.envint.2019.104909",
    role: "미국 전역 앙상블 결합 PM2.5 추정(앙상블 스태킹 기준선)",
    domains: [1],
    quantitativeClaim: null,
  },
  {
    refId: "vandonkelaar2021",
    title: "Monthly Global Estimates of Fine Particulate Matter and Their Uncertainty",
    authors: ["van Donkelaar", "Hammer", "Bindle", "Brauer", "Brook", "Garay"],
    year: 2021,
    arxivId: null,
    doi: "10.1021/acs.est.1c05309",
    role: "전지구 PM2.5 추정의 불확실성 동반 공개(V5.GL)",
    domains: [1, 4],
    quantitativeClaim: null,
  },
  {
    refId: "porcheddu2024",
    title: "Post-process correction improves the accuracy of satellite PM\n                    2.5\n                    retrievals",
    authors: ["Porcheddu", "Kolehmainen", "Lähivaara", "Lipponen"],
    year: 2024,
    arxivId: null,
    doi: "10.5194/amt-17-5747-2024",
    role: "MERRA-2 AOD→PM 변환비를 ML로 후처리 보정",
    domains: [1],
    quantitativeClaim: "위성 통과시각 100m 해상도 R2=0.55, RMSE=6.2 µg/m3 (중부유럽 2019)",
  },
  {
    refId: "porcheddu2025",
    title: "Machine learning data fusion for high spatio-temporal resolution PM\n                    2.5",
    authors: ["Porcheddu", "Kolehmainen", "Lähivaara", "Lipponen"],
    year: 2025,
    arxivId: null,
    doi: "10.5194/amt-18-4771-2025",
    role: "고시공간해상 PM2.5 ML 데이터 융합",
    domains: [1],
    quantitativeClaim: "월평균 R2=0.72, RMSE=3.7 µg/m3 / 통과시각 R2=0.55 (파리 2019)",
  },
  {
    refId: "review2026",
    title: "Satellite-driven prediction of fine particulate matter (PM\n                    2.5\n                    ) concentrations: machine learning and explainable artificial intelligence",
    authors: ["Nguyen", "Trinh"],
    year: 2026,
    arxivId: null,
    doi: "10.1088/2631-8695/ae7028",
    role: "2015-2025 위성+ML PM2.5 체계적 리뷰(현행 지형 확인용)",
    domains: [1],
    quantitativeClaim: null,
  },
  {
    refId: "addedvalue2024",
    title: "On the added value of satellite AOD for the investigation of ground-level PM2.5 variability",
    authors: ["Handschuh", "Erbertseder", "Baier"],
    year: 2024,
    arxivId: null,
    doi: "10.1016/j.atmosenv.2024.120601",
    role: "위성 AOD의 증분 가치와 CAMS 재분석 대비 비교",
    domains: [1],
    quantitativeClaim: "RF-AOD 모델 R2=0.71 vs CAMS 재분석 R2=0.57",
  },
  {
    refId: "geo_hourly2025",
    title: "Hour by Hour PM2.5 Mapping Using Geostationary Satellites",
    authors: ["Park", "Sayeed", "Seo", "Henderson", "Naeger", "Gupta"],
    year: 2025,
    arxivId: null,
    doi: "10.1021/acsestair.4c00365",
    role: "정지궤도(GOES/TEMPO)+DNN 시간별 PM2.5, 고농도 사례 강조",
    domains: [1],
    quantitativeClaim: "DNN이 RF/LightGBM 대비 IOA 최대 +44.68%, rRMSE −45.28% (특히 고농도)",
  },
  {
    refId: "tehran_maiac",
    title: "A machine learning-based framework for high resolution mapping of PM2.5 in Tehran, Iran, using MAIAC AOD data",
    authors: ["Hossein Bagheri"],
    year: 2022,
    arxivId: "2204.02093",
    doi: "10.1016/j.asr.2022.02.032",
    role: "MAIAC AOD 기반 고해상 PM2.5 ML 프레임워크",
    domains: [1],
    quantitativeClaim: null,
  },
  {
    refId: "deep_ens_forest",
    title: "Using Deep Ensemble Forest for High Resolution Mapping of PM2.5 from MODIS MAIAC AOD in Tehran, Iran",
    authors: ["Hossein Bagheri"],
    year: 2024,
    arxivId: "2402.02139",
    doi: "10.1007/s10661-023-10951-1",
    role: "Deep Ensemble Forest로 MAIAC AOD→PM2.5",
    domains: [1],
    quantitativeClaim: "R2=0.74 (DEF) vs 0.67 (DL) vs 0.68 (RF), 테헤란",
  },
  {
    refId: "conformal_pm25_africa",
    title: "Conformal PM2.5 Mapping Under Spatial Covariate Shift: Satellite-Reanalysis Fusion for Africa's Green Industrial Transition",
    authors: ["Yaw Osei Adjei", "Davis Opoku", "Ephraim Abotsi", "Kwadwo Owusu Amanqua", "Oliver Kornyo", "Elisha Soglo-Ahianyo"],
    year: 2026,
    arxivId: "2604.22787",
    doi: null,
    role: "공간 공변량 이동 하 conformal PM2.5 매핑 — 무작위분할과 지리분할의 괴리 정량화",
    domains: [1, 2, 4],
    quantitativeClaim: "지리분할 R2=0.134±0.023 (무작위분할 >0.90), 동아프리카 PICP=65.3% (목표 90%), OpenAQ 2,068,901행/404지점/29개국",
  },
  {
    refId: "locenc_pm25",
    title: "Performance and Generalizability Impacts of Incorporating Location Encoders into Deep Learning for Dynamic PM2.5 Estimation",
    authors: ["Morteza Karimzadeh", "Zhongying Wang", "James L. Crooks"],
    year: 2025,
    arxivId: "2505.18461",
    doi: null,
    role: "위치 인코더(GeoCLIP 등) 주입이 PM2.5 추정 성능·일반화에 주는 영향",
    domains: [1, 2],
    quantitativeClaim: "Appendix A: 무작위 분할(Table 2) 기준선 R2=0.73±0.035 / GeoCLIP-Hadamard 0.79±0.010 / GeoCLIP-Concat 0.73±0.036 / SatCLIP-Hadamard 0.68±0.077 / 원시 lat-lon 0.74±0.016 / 사인 0.75±0.024. 지리 분리분할(Table 3): West→East 0.38→0.47 (RMSE 7.43→6.90), East→West 0.52→0.61 (3.56→3.21). 체커보드 δ=8°(Table 4) 0.59|0.53→0.60|0.54, δ=16°(Table 5) 0.46|0.64→0.50|0.63",
  },
  {
    refId: "leakage",
    title: "Leakage and the Reproducibility Crisis in ML-based Science",
    authors: ["Sayash Kapoor", "Arvind Narayanan"],
    year: 2022,
    arxivId: "2207.07048",
    doi: null,
    role: "ML 기반 과학에서 누출(leakage)이 성능을 부풀리는 유형론 — require_dual_metrics의 이론적 근거",
    domains: [1, 2],
    quantitativeClaim: null,
  },
  {
    refId: "ploton2020",
    title: "Spatial validation reveals poor predictive performance of large-scale ecological mapping models",
    authors: ["Ploton", "Mortier", "Réjou-Méchain", "Barbier", "Picard", "Rossi"],
    year: 2020,
    arxivId: null,
    doi: "10.1038/s41467-020-18321-y",
    role: "공간 자기상관 하 무작위 CV가 성능을 과대평가함을 실증",
    domains: [1, 2],
    quantitativeClaim: null,
  },
  {
    refId: "roberts2017",
    title: "Cross‐validation strategies for data with temporal, spatial, hierarchical, or phylogenetic structure",
    authors: ["Roberts", "Bahn", "Ciuti", "Boyce", "Elith", "Guillera‐Arroita"],
    year: 2017,
    arxivId: null,
    doi: "10.1111/ecog.02881",
    role: "시간·공간·계층 구조 데이터의 CV 설계(블록 CV)",
    domains: [1, 2],
    quantitativeClaim: null,
  },
  {
    refId: "meyer2021_aoa",
    title: "Predicting into unknown space? Estimating the area of applicability of spatial prediction models",
    authors: ["Meyer", "Pebesma"],
    year: 2021,
    arxivId: null,
    doi: "10.1111/2041-210X.13650",
    role: "적용가능영역(AOA) 추정 — 외삽 구간 표기 방법",
    domains: [1, 2],
    quantitativeClaim: null,
  },
  {
    refId: "satclip",
    title: "SatCLIP: Global, General-Purpose Location Embeddings with Satellite Imagery",
    authors: ["Konstantin Klemmer", "Esther Rolf", "Caleb Robinson", "Lester Mackey", "Marc Rußwurm"],
    year: 2023,
    arxivId: "2311.17179",
    doi: null,
    role: "위성영상 기반 범용 위치 임베딩(GeoFM 레버 후보)",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "geoclip",
    title: "GeoCLIP: Clip-Inspired Alignment between Locations and Images for Effective Worldwide Geo-localization",
    authors: ["Vicente Vivanco Cepeda", "Gaurav Kumar Nayak", "Mubarak Shah"],
    year: 2023,
    arxivId: "2309.16020",
    doi: null,
    role: "CLIP 정렬 기반 위치 임베딩(2505.18461이 실제 사용한 인코더)",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "csp",
    title: "CSP: Self-Supervised Contrastive Spatial Pre-Training for Geospatial-Visual Representations",
    authors: ["Gengchen Mai", "Ni Lao", "Yutong He", "Jiaming Song", "Stefano Ermon"],
    year: 2023,
    arxivId: "2305.01118",
    doi: null,
    role: "대조학습 공간 사전학습 위치 표현",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "sphere2vec_arxiv",
    title: "Sphere2Vec: A General-Purpose Location Representation Learning over a Spherical Surface for Large-Scale Geospatial Predictions",
    authors: ["Gengchen Mai", "Yao Xuan", "Wenyun Zuo", "Yutong He", "Jiaming Song", "Stefano Ermon"],
    year: 2023,
    arxivId: "2306.17624",
    doi: "10.1016/j.isprsjprs.2023.06.016",
    role: "구면 위치 표현 학습(위도 왜곡 완화)",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "sh_siren",
    title: "Geographic Location Encoding with Spherical Harmonics and Sinusoidal Representation Networks",
    authors: ["Marc Rußwurm", "Konstantin Klemmer", "Esther Rolf", "Robin Zbinden", "Devis Tuia"],
    year: 2023,
    arxivId: "2310.06743",
    doi: null,
    role: "구면조화+SIREN 위치 인코딩(경량 대안)",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "range",
    title: "RANGE: Retrieval Augmented Neural Fields for Multi-Resolution Geo-Embeddings",
    authors: ["Aayush Dhakal", "Srikumar Sastry", "Subash Khanal", "Adeel Ahmad", "Eric Xing", "Nathan Jacobs"],
    year: 2025,
    arxivId: "2502.19781",
    doi: null,
    role: "검색증강 신경장 지오임베딩",
    domains: [2],
    quantitativeClaim: "SatCLIP/GeoCLIP 대비 분류 +13.1%, 회귀 R2 +0.145 (과제군 상이)",
  },
  {
    refId: "better_together",
    title: "Better Together: Evaluating the Complementarity of Earth Embedding Models",
    authors: ["Thijs L van der Plas", "Jacob JW Bakermans", "Vishal Nedungadi", "Gabrielė Tijūnaitytė", "Marc Rußwurm", "Ioannis N Athanasiadis"],
    year: 2026,
    arxivId: "2605.18667",
    doi: null,
    role: "Earth 임베딩 모델 상호보완성 평가",
    domains: [2],
    quantitativeClaim: "융합 임베딩이 6개 과제 중 4개에서 단일 최고 모델 상회",
  },
  {
    refId: "locenc_review",
    title: "A Review of Location Encoding for GeoAI: Methods and Applications",
    authors: ["Gengchen Mai", "Krzysztof Janowicz", "Yingjie Hu", "Song Gao", "Bo Yan", "Rui Zhu"],
    year: 2021,
    arxivId: "2111.04006",
    doi: "10.1080/13658816.2021.2004602",
    role: "GeoAI 위치 인코딩 방법론 리뷰",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "ignnk",
    title: "Inductive Graph Neural Networks for Spatiotemporal Kriging",
    authors: ["Yuankai Wu", "Dingyi Zhuang", "Aurelie Labbe", "Lijun Sun"],
    year: 2020,
    arxivId: "2006.07527",
    doi: null,
    role: "귀납적 GNN 시공간 kriging(미관측 지점 추론) 표준 기준선",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "satcn",
    title: "Spatial Aggregation and Temporal Convolution Networks for Real-time Kriging",
    authors: ["Yuankai Wu", "Dingyi Zhuang", "Mengying Lei", "Aurelie Labbe", "Lijun Sun"],
    year: 2021,
    arxivId: "2109.12144",
    doi: null,
    role: "공간집계+시간합성곱 실시간 kriging",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "increase",
    title: "INCREASE: Inductive Graph Representation Learning for Spatio-Temporal Kriging",
    authors: ["Chuanpan Zheng", "Xiaoliang Fan", "Cheng Wang", "Jianzhong Qi", "Chaochao Chen", "Longbiao Chen"],
    year: 2023,
    arxivId: "2302.02738",
    doi: "10.1145/3543507.3583525",
    role: "귀납적 그래프 표현학습 시공간 kriging",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "kits",
    title: "KITS: Inductive Spatio-Temporal Kriging with Increment Training Strategy",
    authors: ["Qianxiong Xu", "Cheng Long", "Ziyue Li", "Sijie Ruan", "Rui Zhao", "Zhishuai Li"],
    year: 2023,
    arxivId: "2311.02565",
    doi: null,
    role: "증분 학습 전략 기반 귀납적 kriging",
    domains: [2],
    quantitativeClaim: "기존 방법 대비 MAE 최대 18.33% 개선(초록 기재, 데이터셋 미명시)",
  },
  {
    refId: "stagann",
    title: "STA-GANN: A Valid and Generalizable Spatio-Temporal Kriging Approach",
    authors: ["Yujie Li", "Zezhi Shao", "Chengqing Yu", "Tangwen Qian", "Zhao Zhang", "Yifan Du"],
    year: 2025,
    arxivId: "2508.16161",
    doi: "10.1145/3746252.3761045",
    role: "유효성·일반화를 겨냥한 시공간 kriging (9개 데이터셋/4개 분야)",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "darkfarseer",
    title: "DarkFarseer: Robust Spatio-temporal Kriging under Graph Sparsity and Noise",
    authors: ["Zhuoxuan Liang", "Wei Li", "Dalin Zhang", "Ziyu Jia", "Yidan Chen", "Zhihong Wang"],
    year: 2025,
    arxivId: "2501.02808",
    doi: null,
    role: "그래프 희소·노이즈 하 강건 kriging",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "uniform_kriging",
    title: "Uniform Inductive Spatio-Temporal Kriging",
    authors: ["Lewei Xie", "Haoyu Zhang", "Yulong Chen", "Liangjun You", "Zongxian Yang", "Yifan Zhang"],
    year: 2026,
    arxivId: "2603.05301",
    doi: null,
    role: "불완전 관측 하 균일 귀납적 시공간 kriging(백본 무관 개선)",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "physkriging_pm25",
    title: "Physics-Guided Inductive Spatiotemporal Kriging for PM2.5 with Satellite Gradient Constraints",
    authors: ["Shuo Wang", "Mengfan Teng", "Yun Cheng", "Lothar Thiele", "Olga Saukh", "Shuangshuang He"],
    year: 2025,
    arxivId: "2511.16013",
    doi: null,
    role: "위성 기울기 제약 물리유도 귀납적 kriging (PM2.5 전용)",
    domains: [2],
    quantitativeClaim: "BTHSA 지역 MAE=9.52 µg/m3 (SOTA 주장, 베이스라인 수치 초록 미기재)",
  },
  {
    refId: "deepkriging",
    title: "DeepKriging: Spatially Dependent Deep Neural Networks for Spatial Prediction",
    authors: ["Wanfang Chen", "Yuxiao Li", "Brian J Reich", "Ying Sun"],
    year: 2020,
    arxivId: "2007.11972",
    doi: null,
    role: "공간 의존 신경망 기반 예측(비가우시안에서 kriging 대비 우위)",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "kcn",
    title: "Kriging Convolutional Networks",
    authors: ["Appleby", "Liu", "Liu"],
    year: 2020,
    arxivId: null,
    doi: "10.1609/aaai.v34i04.5716",
    role: "Kriging Convolutional Networks(그래프 kriging 초기 기준선)",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "uair",
    title: "U-Air",
    authors: ["Zheng", "Liu", "Hsieh"],
    year: 2013,
    arxivId: null,
    doi: "10.1145/2487575.2488188",
    role: "도시 대기질 추론의 원류(U-Air)",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "adain",
    title: "Deep Distributed Fusion Network for Air Quality Prediction",
    authors: ["Yi", "Zhang", "Wang", "Li", "Zheng"],
    year: 2018,
    arxivId: null,
    doi: "10.1145/3219819.3219822",
    role: "분산 융합 신경망 대기질 예측(ADAIN 계열)",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "prithvi",
    title: "Foundation Models for Generalist Geospatial Artificial Intelligence",
    authors: ["Johannes Jakubik", "Sujit Roy", "C. E. Phillips", "Paolo Fraccaro", "Denys Godwin", "Bianca Zadrozny"],
    year: 2023,
    arxivId: "2310.18660",
    doi: null,
    role: "범용 지리공간 파운데이션 모델(래스터 인코더 계열)",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "prithvi2",
    title: "Prithvi-EO-2.0: A Versatile Multi-Temporal Foundation Model for Earth Observation Applications",
    authors: ["Daniela Szwarcman", "Sujit Roy", "Paolo Fraccaro", "Þorsteinn Elí Gíslason", "Benedikt Blumenstiel", "Rinki Ghosal"],
    year: 2024,
    arxivId: "2412.02732",
    doi: null,
    role: "Prithvi-EO-2.0 다시점 EO 파운데이션 모델",
    domains: [2],
    quantitativeClaim: null,
  },
  {
    refId: "chronos",
    title: "Chronos: Learning the Language of Time Series",
    authors: ["Abdul Fatir Ansari", "Lorenzo Stella", "Caner Turkmen", "Xiyuan Zhang", "Pedro Mercado", "Huibin Shen"],
    year: 2024,
    arxivId: "2403.07815",
    doi: null,
    role: "현행 판정에서 승리한 TSFM 계열의 원 논문(Chronos/Chronos-Bolt 인용 기준)",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "chronos2",
    title: "Chronos-2: From Univariate to Universal Forecasting",
    authors: ["Abdul Fatir Ansari", "Oleksandr Shchur", "Jaris Küken", "Andreas Auer", "Boran Han", "Pedro Mercado"],
    year: 2025,
    arxivId: "2510.15821",
    doi: null,
    role: "공변량 지원 TSFM — CAMS를 공변량으로 넣는 무료 스택 1순위 후보",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "timesfm",
    title: "A decoder-only foundation model for time-series forecasting",
    authors: ["Abhimanyu Das", "Weihao Kong", "Rajat Sen", "Yichen Zhou"],
    year: 2023,
    arxivId: "2310.10688",
    doi: null,
    role: "디코더 전용 TSFM(2.5까지 Apache-2.0 가중치)",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "moirai",
    title: "Unified Training of Universal Time Series Forecasting Transformers",
    authors: ["Gerald Woo", "Chenghao Liu", "Akshat Kumar", "Caiming Xiong", "Silvio Savarese", "Doyen Sahoo"],
    year: 2024,
    arxivId: "2402.02592",
    doi: null,
    role: "any-variate TSFM(가중치 CC-BY-NC → 프로덕션 불가)",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "lagllama",
    title: "Lag-Llama: Towards Foundation Models for Probabilistic Time Series Forecasting",
    authors: ["Kashif Rasul", "Arjun Ashok", "Andrew Robert Williams", "Hena Ghonia", "Rishika Bhagwatkar", "Arian Khorasani"],
    year: 2023,
    arxivId: "2310.08278",
    doi: null,
    role: "확률 예보 지향 TSFM",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "tft",
    title: "Temporal Fusion Transformers for Interpretable Multi-horizon Time Series Forecasting",
    authors: ["Bryan Lim", "Sercan O. Arik", "Nicolas Loeff", "Tomas Pfister"],
    year: 2019,
    arxivId: "1912.09363",
    doi: null,
    role: "현행 자체 TFT의 원 방법",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "tirex",
    title: "TiRex: Zero-Shot Forecasting Across Long and Short Horizons with Enhanced In-Context Learning",
    authors: ["Andreas Auer", "Patrick Podest", "Daniel Klotz", "Sebastian Böck", "Günter Klambauer", "Sepp Hochreiter"],
    year: 2025,
    arxivId: "2505.23719",
    doi: null,
    role: "장·단기 지평 zero-shot TSFM",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "tirex2",
    title: "TiRex-2: Generalizing TiRex to Multivariate Data and Streaming",
    authors: ["Patrick Podest", "Marco Pichler", "Elias Bürger", "Levente Zólyomi", "Bernhard Voggenberger", "Wilhelm Berghammer"],
    year: 2026,
    arxivId: "2607.01204",
    doi: null,
    role: "TiRex의 다변량·스트리밍 확장",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "how_foundational",
    title: "How Foundational are Foundation Models for Time Series Forecasting?",
    authors: ["Nouha Karaouli", "Denis Coquenet", "Elisa Fromont", "Martial Mermillod", "Marina Reyboz"],
    year: 2025,
    arxivId: "2510.00742",
    doi: null,
    role: "TSFM이 과제특화 소형 모델을 항상 이기지 않는다는 반증 근거 — fine-tune 투자 판정의 핵심",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "icf",
    title: "In-Context Fine-Tuning for Time-Series Foundation Models",
    authors: ["Abhimanyu Das", "Matthew Faw", "Rajat Sen", "Yichen Zhou"],
    year: 2024,
    arxivId: "2410.24087",
    doi: null,
    role: "In-context fine-tuning: 명시적 fine-tune에 근접하는 저비용 대안",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "aurora",
    title: "A Foundation Model for the Earth System",
    authors: ["Cristian Bodnar", "Wessel P. Bruinsma", "Ana Lucic", "Megan Stanley", "Anna Vaughan", "Johannes Brandstetter"],
    year: 2024,
    arxivId: "2405.13063",
    doi: "10.1038/s41586-025-09005-y",
    role: "CAMS 대기오염 예보를 fine-tune으로 다루는 지구시스템 파운데이션 모델",
    domains: [3],
    quantitativeClaim: "대기오염 과제에서 CAMS와 동등 이상 74% (제조사 보고). 논문 초록은 '운영예보 상회, 계산비용 수 자릿수 절감'만 기재",
  },
  {
    refId: "gencast",
    title: "GenCast: Diffusion-based ensemble forecasting for medium-range weather",
    authors: ["Ilan Price", "Alvaro Sanchez-Gonzalez", "Ferran Alet", "Tom R. Andersson", "Andrew El-Kadi", "Dominic Masters"],
    year: 2023,
    arxivId: "2312.15796",
    doi: "10.1038/s41586-024-08252-9",
    role: "확산 기반 앙상블 기상예보(결정론→확률 전환의 대표 사례)",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "graphcast",
    title: "Learning skillful medium-range global weather forecasting",
    authors: ["Lam", "Sanchez-Gonzalez", "Willson", "Wirnsberger", "Fortunato", "Alet"],
    year: 2023,
    arxivId: null,
    doi: "10.1126/science.adi2336",
    role: "결정론 ML 기상예보 기준선",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "emos",
    title: "Calibrated Probabilistic Forecasting Using Ensemble Model Output Statistics and Minimum CRPS Estimation",
    authors: ["Gneiting", "Raftery", "Westveld", "Goldman"],
    year: 2005,
    arxivId: null,
    doi: "10.1175/MWR2904.1",
    role: "EMOS/NGR — 결정론·앙상블을 확률로 승격하는 고전 저비용 표준",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "rasp_lerch",
    title: "Neural Networks for Postprocessing Ensemble Weather Forecasts",
    authors: ["Rasp", "Lerch"],
    year: 2018,
    arxivId: null,
    doi: "10.1175/MWR-D-18-0187.1",
    role: "신경망 앙상블 후처리(분포 파라미터 회귀)",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "bremnes",
    title: "Ensemble Postprocessing Using Quantile Function Regression Based on Neural Networks and Bernstein Polynomials",
    authors: ["Bremnes"],
    year: 2020,
    arxivId: null,
    doi: "10.1175/MWR-D-19-0227.1",
    role: "Bernstein 분위함수 회귀 후처리",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "analog",
    title: "Probabilistic Weather Prediction with an Analog Ensemble",
    authors: ["Delle Monache", "Eckel", "Rife", "Nagarajan", "Searight"],
    year: 2013,
    arxivId: null,
    doi: "10.1175/MWR-D-12-00281.1",
    role: "아날로그 앙상블 — 학습 없이 결정론 예보를 확률화",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "vannitsem2021",
    title: "Statistical Postprocessing for Weather Forecasts: Review, Challenges, and Avenues in a Big Data World",
    authors: ["Vannitsem", "Bremnes", "Demaeyer", "Evans", "Flowerdew", "Hemri"],
    year: 2021,
    arxivId: null,
    doi: "10.1175/BAMS-D-19-0308.1",
    role: "통계적 후처리 리뷰(방법 선택 지형도)",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "gneiting2007",
    title: "Strictly Proper Scoring Rules, Prediction, and Estimation",
    authors: ["Gneiting", "Raftery"],
    year: 2007,
    arxivId: null,
    doi: "10.1198/016214506000001437",
    role: "엄격 적정 채점규칙 — CRPS/분위손실 평가의 근거",
    domains: [3, 4],
    quantitativeClaim: null,
  },
  {
    refId: "gefs_aerosol",
    title: "Development and evaluation of the Aerosol Forecast Member in the National Center for Environment Prediction (NCEP)'s Global Ensemble Forecast System (GEFS-Aerosols v1)",
    authors: ["Zhang", "Montuoro", "McKeen", "Baker", "Bhattacharjee", "Grell"],
    year: 2022,
    arxivId: null,
    doi: "10.5194/gmd-15-5337-2022",
    role: "현재 수집 중인 GEFS-Aerosols 앙상블의 사양·평가",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "enbpi",
    title: "Conformal prediction for time series",
    authors: ["Chen Xu", "Yao Xie"],
    year: 2020,
    arxivId: "2010.09107",
    doi: null,
    role: "시계열 conformal 구간(EnbPI) — 교환성 없는 상황의 저비용 밴드",
    domains: [3, 4],
    quantitativeClaim: null,
  },
  {
    refId: "aci",
    title: "Adaptive Conformal Inference Under Distribution Shift",
    authors: ["Isaac Gibbs", "Emmanuel Candès"],
    year: 2021,
    arxivId: "2106.00170",
    doi: null,
    role: "적응적 conformal 추론(분포이동 하 온라인 보정)",
    domains: [3, 4],
    quantitativeClaim: null,
  },
  {
    refId: "spci",
    title: "Sequential Predictive Conformal Inference for Time Series",
    authors: ["Chen Xu", "Yao Xie"],
    year: 2022,
    arxivId: "2212.03463",
    doi: null,
    role: "순차적 예측 conformal 추론",
    domains: [3, 4],
    quantitativeClaim: null,
  },
  {
    refId: "copula_cp",
    title: "Copula Conformal Prediction for Multi-step Time Series Forecasting",
    authors: ["Sophia Sun", "Rose Yu"],
    year: 2022,
    arxivId: "2212.03281",
    doi: null,
    role: "다단계 지평 공동 커버리지(코퓰라 conformal)",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "no2_extreme",
    title: "Probabilistic forecasting approaches for extreme NO$_2$ episodes: a comparison of models",
    authors: ["Sebastián Pérez Vasseur", "José L. Aznarte"],
    year: 2020,
    arxivId: "2003.11356",
    doi: null,
    role: "극단 NO2 에피소드 확률예보 10종 비교 — 분위 GBT가 최고",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "wavecatboost",
    title: "WaveCatBoost for Probabilistic Forecasting of Regional Air Quality Data",
    authors: ["Jintu Borah", "Tanujit Chakraborty", "Md. Shahrul Md. Nadzir", "Mylene G. Cayetano", "Shubhankar Majumdar"],
    year: 2024,
    arxivId: "2404.05482",
    doi: "10.1109/LSENS.2024.3519719",
    role: "지역 대기질 확률예보(저비용 트리 기반)",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "estgcn",
    title: "E-STGCN: Extreme Spatiotemporal Graph Convolutional Networks for Air Quality Forecasting",
    authors: ["Madhurima Panja", "Tanujit Chakraborty", "Anubhab Biswas", "Soudeep Deb"],
    year: 2024,
    arxivId: "2411.12258",
    doi: null,
    role: "극단값 이론을 결합한 시공간 GCN 대기질 예보",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "deep_st_uq",
    title: "Quantifying Uncertainty in Deep Spatiotemporal Forecasting",
    authors: ["Dongxia Wu", "Liyao Gao", "Xinyue Xiong", "Matteo Chinazzi", "Alessandro Vespignani", "Yi-An Ma"],
    year: 2021,
    arxivId: "2105.11982",
    doi: null,
    role: "딥 시공간 예보의 불확실성 정량화 비교",
    domains: [3],
    quantitativeClaim: null,
  },
  {
    refId: "barber2019_limits",
    title: "The limits of distribution-free conditional predictive inference",
    authors: ["Rina Foygel Barber", "Emmanuel J. Candès", "Aaditya Ramdas", "Ryan J. Tibshirani"],
    year: 2019,
    arxivId: "1903.04684",
    doi: null,
    role: "분포무관·유한표본 조건부 커버리지 불가능성 — 설계 전제",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "gibbs2023_cond",
    title: "Conformal Prediction With Conditional Guarantees",
    authors: ["Isaac Gibbs", "John J. Cherian", "Emmanuel J. Candès"],
    year: 2023,
    arxivId: "2305.12616",
    doi: null,
    role: "공변량 함수족에 대한 조건부 보장(그룹조건부 일반화)",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "equalized",
    title: "With Malice Towards None: Assessing Uncertainty via Equalized Coverage",
    authors: ["Yaniv Romano", "Rina Foygel Barber", "Chiara Sabatti", "Emmanuel J. Candès"],
    year: 2019,
    arxivId: "1908.05428",
    doi: null,
    role: "그룹별 균등 커버리지(Mondrian형 그룹 CQR)",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "beyond_exch",
    title: "Conformal prediction beyond exchangeability",
    authors: ["Rina Foygel Barber", "Emmanuel J. Candes", "Aaditya Ramdas", "Ryan J. Tibshirani"],
    year: 2022,
    arxivId: "2202.13415",
    doi: null,
    role: "교환성 붕괴 하 conformal 보장의 열화 한계",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "localized_cp",
    title: "Localized Conformal Prediction: A Generalized Inference Framework for Conformal Prediction",
    authors: ["Leying Guan"],
    year: 2021,
    arxivId: "2106.08460",
    doi: null,
    role: "국소화 conformal — 근사 조건부 커버리지",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "batch_mvp",
    title: "Batch Multivalid Conformal Prediction",
    authors: ["Christopher Jung", "Georgy Noarov", "Ramya Ramalingam", "Aaron Roth"],
    year: 2022,
    arxivId: "2209.15145",
    doi: null,
    role: "BatchGCP/BatchMVP — 다중 그룹 동시 커버리지",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "adv_mvp",
    title: "Practical Adversarial Multivalid Conformal Prediction",
    authors: ["Osbert Bastani", "Varun Gupta", "Christopher Jung", "Georgy Noarov", "Ramya Ramalingam", "Aaron Roth"],
    year: 2022,
    arxivId: "2206.01067",
    doi: null,
    role: "실용적 적대적 multivalid conformal",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "crc",
    title: "Conformal Risk Control",
    authors: ["Anastasios N. Angelopoulos", "Stephen Bates", "Adam Fisch", "Lihua Lei", "Tal Schuster"],
    year: 2022,
    arxivId: "2208.02814",
    doi: null,
    role: "Conformal risk control — 커버리지 외 위험 통제",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "ltt",
    title: "Learn then Test: Calibrating Predictive Algorithms to Achieve Risk Control",
    authors: ["Anastasios N. Angelopoulos", "Stephen Bates", "Emmanuel J. Candès", "Michael I. Jordan", "Lihua Lei"],
    year: 2021,
    arxivId: "2110.01052",
    doi: null,
    role: "Learn-then-Test — 다중 가설 하 위험 통제(DQSS 임계 탐색에 적용 가능)",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "angelopoulos2021",
    title: "A Gentle Introduction to Conformal Prediction and Distribution-Free Uncertainty Quantification",
    authors: ["Anastasios N. Angelopoulos", "Stephen Bates"],
    year: 2021,
    arxivId: "2107.07511",
    doi: null,
    role: "conformal/분포무관 UQ 입문 — Beta 법칙 등 유한표본 성질 정리",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "vovk2013_cond",
    title: "Conditional validity of inductive conformal predictors",
    authors: ["Vovk"],
    year: 2013,
    arxivId: null,
    doi: "10.1007/s10994-013-5355-6",
    role: "귀납적 conformal 예측기의 조건부 타당성(Mondrian 보장의 정본)",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "mondrian_small",
    title: "Handling Small Calibration Sets in Mondrian Inductive Conformal Regressors",
    authors: ["Johansson", "Ahlberg", "Boström", "Carlsson", "Linusson", "Sönströd"],
    year: 2015,
    arxivId: null,
    doi: "10.1007/978-3-319-17091-6_22",
    role: "작은 캘리브레이션 집합을 갖는 Mondrian 귀납 conformal 회귀 처리법",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "extreme_cp",
    title: "Extreme Conformal Prediction: Reliable Intervals for High-Impact Events",
    authors: ["Olivier C. Pasche", "Henry Lam", "Sebastian Engelke"],
    year: 2025,
    arxivId: "2505.08578",
    doi: null,
    role: "극단 사건용 conformal 구간(EVT 결합) — tail 게이트의 직접 후보",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "erf",
    title: "Extremal Random Forests",
    authors: ["Nicola Gnecco", "Edossa Merga Terefe", "Sebastian Engelke"],
    year: 2022,
    arxivId: "2201.12865",
    doi: "10.1080/01621459.2023.2300522",
    role: "극단 분위 회귀(Extremal Random Forests)",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "kandinsky",
    title: "Kandinsky Conformal Prediction: Beyond Class- and Covariate-Conditional Coverage",
    authors: ["Konstantina Bairaktari", "Jiayun Wu", "Zhiwei Steven Wu"],
    year: 2025,
    arxivId: "2502.17264",
    doi: null,
    role: "클래스·공변량 조건부를 넘는 겹침 그룹 conformal",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "pf_gcocp",
    title: "Parameter-Free and Group Conditional Online Conformal Prediction",
    authors: ["Beepul Bharti", "Ambar Pal", "Jacopo Teneggi", "Jeremias Sulam"],
    year: 2026,
    arxivId: "2606.00419",
    doi: null,
    role: "파라미터 없는 그룹조건부 온라인 conformal",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "venn_abers",
    title: "Venn-Abers predictors",
    authors: ["Vladimir Vovk", "Ivan Petej"],
    year: 2012,
    arxivId: "1211.0025",
    doi: null,
    role: "Venn-Abers — 등척회귀 기반 검증된 확률 캘리브레이션(DQSS 등급 캘리브레이션 후보)",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "verified_cal",
    title: "Verified Uncertainty Calibration",
    authors: ["Ananya Kumar", "Percy Liang", "Tengyu Ma"],
    year: 2019,
    arxivId: "1909.10155",
    doi: null,
    role: "검증된 불확실성 캘리브레이션(측정 가능한 캘리브레이션 오차)",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "temp_scaling",
    title: "On Calibration of Modern Neural Networks",
    authors: ["Chuan Guo", "Geoff Pleiss", "Yu Sun", "Kilian Q. Weinberger"],
    year: 2017,
    arxivId: "1706.04599",
    doi: null,
    role: "현대 신경망의 캘리브레이션(신뢰도-정확도 괴리)",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "isotonic",
    title: "Transforming classifier scores into accurate multiclass probability estimates",
    authors: ["Zadrozny", "Elkan"],
    year: 2002,
    arxivId: null,
    doi: "10.1145/775047.775151",
    role: "분류기 점수→확률 변환(등척/플랫 캘리브레이션 원류)",
    domains: [4],
    quantitativeClaim: null,
  },
  {
    refId: "rel_diagram",
    title: "Increasing the Reliability of Reliability Diagrams",
    authors: ["Bröcker", "Smith"],
    year: 2007,
    arxivId: null,
    doi: "10.1175/WAF993.1",
    role: "신뢰도 다이어그램의 일관성 구간 — 규칙점수 캘리브레이션 진단 도구",
    domains: [4],
    quantitativeClaim: null,
  },
]

export const CALIBRATION_METHODS: CalibrationMethod[] = [
  {
    slug: "split-cqr",
    method: "Split CQR (현행 기반)",
    family: "조건부 분위",
    idea: "분위회귀 [q̂α/2,q̂1−α/2]에 conformity score E=max(q̂lo−y, y−q̂hi)의 (1−α) 분위를 대칭 오프셋으로 가산",
    assumptions: "캘리브레이션·테스트 표본의 교환가능성. score의 연속성(tie 없음)",
    limits: "주변부(marginal) 커버리지만 보장. 이분산 구간에서 조건부 커버리지 보장 없음",
    applicability: "이미 운영 중. 기준선으로 유지",
    priority: "기준선",
    sources: "Romano et al. arXiv:1905.03222; Lei et al. 2018 doi:10.1080/01621459.2017.1307116",
  },
  {
    slug: "mondrian",
    method: "Mondrian / 그룹 조건부 (현행)",
    family: "그룹 재보정",
    idea: "공변량의 함수 g(x)로 정의된 taxonomy 그룹마다 별도 오프셋을 계산",
    assumptions: "그룹 라벨이 테스트 시점에 알려진 x의 함수여야 함(라벨 y로 정의 금지). 그룹 내 교환가능성",
    limits: "그룹 수를 늘릴수록 그룹당 n_cal이 줄어 분산 팽창. 그룹 정의가 y 기반이면 보장 소멸",
    applicability: "핵심 점검 대상 — 그룹을 ŷ 밴드로 정의했는지, 평가도 동일 정의인지 확인 필요",
    priority: "즉시",
    sources: "Vovk 2013 doi:10.1007/s10994-013-5355-6; Boström et al. arXiv:2309.08313",
  },
  {
    slug: "conditional-impossibility",
    method: "분포무관 조건부 커버리지 불가능성",
    family: "이론 한계",
    idea: "연속 X에 대한 유한표본 X-조건부 커버리지는 무한폭 구간 없이는 달성 불가",
    assumptions: "분포 가정 없음",
    limits: "‘완전한 조건부 커버리지’ 목표 자체가 달성 불가 — 근사 목표(그룹/국소/캘리브레이션 조건부)로 재정의해야 함",
    applicability: "게이트 설계 근거. ‘≥150에서 0.80 정확 달성’을 KPI로 두지 말 것",
    priority: "설계 원칙",
    sources: "Foygel Barber et al. 2021 doi:10.1093/imaiai/iaaa017",
  },
  {
    slug: "kandinsky",
    method: "Kandinsky conformal",
    family: "그룹 재보정 확장",
    idea: "겹치는·분수 가중 그룹 공변량 클래스에 대한 조건부 커버리지를 선형계획으로 동시 보장",
    assumptions: "그룹 지시함수의 선형 스팬 내에서만 보장. 여전히 x의 함수",
    limits: "구현 복잡도↑, 그룹 수 대비 표본 요구 증가",
    applicability: "농도 밴드 × 계절 × 관측소유형처럼 겹치는 층화를 쓰고 싶을 때 Mondrian의 상위 대안",
    priority: "중기",
    sources: "arXiv:2502.17264",
  },
  {
    slug: "group-weighted",
    method: "Group-weighted conformal",
    family: "그룹 재보정 확장",
    idea: "그룹별 가중을 학습해 소표본 그룹의 분산과 편향을 절충",
    assumptions: "그룹 구조가 사전 지정. 그룹 간 부분적 정보 공유가 유효할 것",
    limits: "가중 선택이 데이터 의존적이면 커버리지 보장이 근사로 약화",
    applicability: "≥150 그룹의 n_cal이 수십 수준일 때 pooled 폴백보다 나은 절충안",
    priority: "높음",
    sources: "arXiv:2401.17452",
  },
  {
    slug: "weighted-covariate-shift",
    method: "Weighted conformal (공변량 시프트)",
    family: "가중 conformal",
    idea: "밀도비 w(x)=dP_test/dP_cal로 캘리브레이션 점을 가중해 시프트 하에서 커버리지 복원",
    assumptions: "공변량 시프트만 존재(조건부 분포 P(y|x)는 불변). 밀도비를 알거나 추정 가능",
    limits: "밀도비 추정 오차가 커버리지 오차로 직결. 유효표본이 1/Σw²만큼 감소",
    applicability: "계절/에어로졸 유형 시프트가 진단으로 확인될 때 1순위. 밀도비는 calib-vs-holdout 분류기로 추정",
    priority: "높음(진단 조건부)",
    sources: "Tibshirani et al. arXiv:1904.06019",
  },
  {
    slug: "non-exchangeable",
    method: "Non-exchangeable / 가중 conformal",
    family: "비교환 데이터",
    idea: "최근성 가중으로 교환가능성 위배 하에서도 커버리지 손실 상한을 총변동거리로 명시",
    assumptions: "가중치는 데이터 비의존(고정). 시간적 드리프트가 완만",
    limits: "보장이 ‘커버리지 ≥ 1−α − Δ’ 형태로 약화. Δ는 미지",
    applicability: "시계열 nowcast에 자연스러운 형태. 재보정 창을 롤링으로 바꿀 때의 이론적 근거",
    priority: "높음",
    sources: "Barber et al. 2023 doi:10.1214/23-AOS2276",
  },
  {
    slug: "aci",
    method: "Adaptive conformal inference (ACI)",
    family: "온라인 보정",
    idea: "실현 커버리지 오차로 α_t를 온라인 갱신해 장기 커버리지를 보장",
    assumptions: "장기 평균 커버리지만 목표. 피드백(실측 y)이 지연 없이 도착",
    limits: "구간 폭이 크게 진동. 짧은 고농도 에피소드 구간에서는 수렴 전에 사건이 끝남",
    applicability: "≥150 밴드에 단독 적용은 부적합(사건 희소). 전체 밴드의 드리프트 보정용으로는 유효",
    priority: "중기",
    sources: "Gibbs & Candès arXiv:2106.00170",
  },
  {
    slug: "split-localized",
    method: "Split localized conformal",
    family: "국소 재보정",
    idea: "테스트점 근방의 캘리브레이션 점에 커널 가중을 주어 국소 분위를 사용",
    assumptions: "국소 평활 가능성. 근방에 충분한 캘리브레이션 점 존재",
    limits: "고농도 영역은 정의상 근방 표본이 희소 → 대역폭이 커지며 국소성이 소실",
    applicability: "Mondrian의 이산 밴드 경계 효과를 없애는 연속판. tail에서는 EVT와 결합 필요",
    priority: "중기",
    sources: "arXiv:2206.13092",
  },
  {
    slug: "conditional-histogram",
    method: "Conditional histogram (CHR)",
    family: "조건부 분포 추정",
    idea: "조건부 히스토그램을 추정하고 그 위에서 conformal 보정 → 비대칭·다봉 구간 생성",
    assumptions: "조건부 분포를 이산 격자로 근사 가능",
    limits: "격자 상한을 넘는 영역은 외삽 불가 — tail 상단에서 절단",
    applicability: "PM2.5처럼 우편향이 강한 변수에 대칭 오프셋보다 적합. 상한 격자를 충분히 크게 잡아야 함",
    priority: "중기",
    sources: "Sesia & Candès arXiv:2105.08747",
  },
  {
    slug: "normalized-cqr",
    method: "Improved / 정규화 CQR",
    family: "CQR 변형",
    idea: "score를 구간폭으로 정규화하거나 비대칭 오프셋을 사용해 적응성 개선",
    assumptions: "구간폭이 국소 불확실성의 단조 대리변수",
    limits: "폭 추정이 tail에서 붕괴하면 정규화가 오히려 결손을 증폭",
    applicability: "저비용 개선. H2(폭 붕괴)가 배제된 뒤에 적용",
    priority: "낮음(저비용)",
    sources: "arXiv:2207.02808; arXiv:2309.08313",
  },
  {
    slug: "evt-conformal",
    method: "Extreme conformal prediction (EVT+CP)",
    family: "극단값이론 결합",
    idea: "conformity score의 상위 꼬리를 GPD로 적합해 캘리브레이션 표본 수가 허용하는 것보다 높은 신뢰수준의 유한폭 구간을 외삽",
    assumptions: "score 꼬리가 극단값 영역(2차 정칙 조건)에 있음. 임계값 선택이 타당",
    limits: "분포무관 보장이 아니라 점근적·모수적 보장으로 격하. 임계값·형상모수 추정 오차에 민감",
    applicability: "≥150 그룹의 n_cal이 수십 수준일 때 pooled 폴백의 대안으로 가장 직접적",
    priority: "높음",
    sources: "Auer/Gnecco 등 arXiv:2505.08578",
  },
  {
    slug: "evt-quantile-regression",
    method: "Extreme quantile regression (EVT 회귀)",
    family: "모델 측 tail 개선",
    idea: "극단 분위를 GPD 기반으로 외삽하는 회귀(극단 랜덤포레스트, 그래디언트 부스팅, 딥러닝)",
    assumptions: "꼬리 지수의 공변량 의존이 완만. 임계값 초과 표본이 충분",
    limits: "표준 pinball QR보다 하이퍼파라미터·임계값 민감도가 큼",
    applicability: "conformal 이전 단계에서 q̂90 자체를 개선 — H2가 원인으로 확인되면 근본 처방",
    priority: "높음(H2 확인 시)",
    sources: "arXiv:2201.12865; arXiv:2103.00808; arXiv:2404.09154; 개관 arXiv:1612.06850",
  },
  {
    slug: "non-crossing-quantiles",
    method: "비교차 분위회귀 + conformal",
    family: "분위 교차 대응",
    idea: "단조성 제약 하에서 분위함수를 추정해 교차를 구조적으로 제거하고 conformal로 마감",
    assumptions: "분위 곡선의 단조성. 제약 최적화 수렴",
    limits: "제약이 tail에서 편향을 유발할 수 있음. 학습 비용 증가",
    applicability: "q10>q90 발생률이 유의하면 즉시 적용 가능한 직접 처방",
    priority: "높음(H2 확인 시)",
    sources: "arXiv:2210.10161",
  },
  {
    slug: "label-noise-robust",
    method: "레이블 노이즈 강건 conformal",
    family: "라벨 오차 대응",
    idea: "노이즈 라벨로 만든 구간이 참값을 덮는 조건을 규명하고, 노이즈에 둔감한 score를 설계",
    assumptions: "노이즈 모형(분산증가형/비대칭)에 대한 가정",
    limits: "노이즈가 분산증가형이면 오히려 보수적 — 과소커버리지의 설명으로는 부적합. 비대칭·감쇠형일 때만 해당",
    applicability: "기준 측정기 오차 분산을 먼저 추정해야 채택 여부 판단 가능",
    priority: "진단 우선",
    sources: "Einbinder et al. arXiv:2209.14295; arXiv:2405.02648; arXiv:2509.15120",
  },
  {
    slug: "long-tailed",
    method: "장꼬리(long-tailed) conformal",
    family: "희소 그룹 보정",
    idea: "표본이 극히 적은 클래스/그룹에서 커버리지와 집합 크기를 함께 통제",
    assumptions: "그룹 간 공유 구조 존재",
    limits: "주로 분류 문제 대상 — 회귀 이식에는 추가 작업 필요",
    applicability: "≥150을 ‘희소 그룹’으로 보는 관점의 참고 문헌",
    priority: "참고",
    sources: "arXiv:2507.06867",
  },
  {
    slug: "spatial-shift-pm25",
    method: "공간 시프트 하 PM2.5 conformal (도메인 사례)",
    family: "도메인 선례",
    idea: "위성–재분석 융합 PM2.5에 위치 그룹 공간 교차검증 + conformal을 적용해 지리적 적용한계를 정량화",
    assumptions: "-",
    limits: "-",
    applicability: "AirLens와 동일 문제설정의 최근 선례 — 평가 프로토콜(위치 그룹 CV) 벤치마크로 활용",
    priority: "참고",
    sources: "arXiv:2604.22787",
  },
  {
    slug: "e-stgcn",
    method: "극단 시공간 예측 (E-STGCN)",
    family: "도메인 선례",
    idea: "EVT를 그래프 신경망 손실에 결합해 대기질 극단값 예측 성능을 개선",
    assumptions: "-",
    limits: "-",
    applicability: "고농도 특화 모델 계열의 참고 사례",
    priority: "참고",
    sources: "arXiv:2411.12258",
  },
]

/**
 * Where AirLens stands in each area. Every `position`/`caveat` below is quoted
 * or tightly condensed from `AirLens_methodology_sota.md` — the judgments are
 * that review's, not this file's, and the caveats are carried over deliberately
 * (a positioning summary that keeps only the favorable half is marketing).
 */
export const LITERATURE_DOMAINS: LiteratureDomain[] = [
  {
    id: 1,
    title: '위성 AOD → PM2.5 보정',
    position:
      '현행은 XGBoost 분위회귀(p10/p50/p90) + GTWR 공간 보정이고, 알고리즘 계열로 보면 "SOTA 지형의 주류 중앙"이다. 2019년 이후 상위 성능 문헌은 대부분 시공간 정보를 명시적으로 넣은 트리 앙상블이거나 시퀀스/공간 딥러닝이며 XGBoost 계열은 전자의 표준 구성이다. 불확실성 측면에서는 문헌 상위 — 대부분의 AOD→PM2.5 문헌이 점추정만 보고하고, 구간을 함께 보고하는 사례조차 그룹 조건부 커버리지를 밴드별로 게이트하지는 않는다.',
    caveat:
      'AirLens의 점추정 성능이 문헌 범위의 어디에 있는지는 **판정 보류**다. 비교에 필요한 r2_full/r2_no_lag 쌍과 그 분할 설계가 제시되지 않았기 때문이다. 그리고 문헌 수치들끼리도 지역·기간·분할 설계·AOD 산출물이 모두 달라 "절대 R² 비교가 성립하지 않는다".',
    href: '/methodology#nature-satellite-derived',
  },
  {
    id: 2,
    title: '시공간 보간',
    position:
      'GNN 보간기는 현재 동결 상태다. 귀납적 시공간 kriging 문헌은 MAE/RMSE로 보고하고 R²를 거의 쓰지 않아(본 세션에서 확인한 7편 중 R² 보고 0건) 직접 대조할 지표 자체가 드물다.',
    caveat:
      '보고된 R² 값은 그 자체로 해석할 수 없다. 같은 데이터·같은 모델에서 분할 설계만 바꿔도 R²가 0.90+ 에서 0.134까지 내려가기 때문이다. 무작위/시간 분할에서 나온 값이라면 극단적으로 낮아 은퇴·재설계 후보이고, 지리 분리 분할에서 나온 값이라면 희소망 지리분할 문헌치(0.134)와 사실상 동일한 정상 범위 하단이다 — 이 경우 "낮다"는 판정 자체가 틀린 것이 된다. 분할 설계가 기록되기 전까지 이 숫자를 품질 주장으로 인용해서는 안 된다.',
    href: '/methodology#nature-interpolated',
  },
  {
    id: 3,
    title: '확률 예보',
    position:
      'AirLens는 모든 ML 출력에 p10-p90 + DQSS 등급을 의무화하지만 라이브 예보만 이 계약 밖에 있다. 이는 성능 문제가 아니라 구조적 결손이며, 따라서 최우선 조치는 더 좋은 예보 모델이 아니라 기존 결정론 예보에 밴드를 씌우는 후처리다. 통계적 후처리는 대기·기상 분야에서 20년간 확립된 표준 경로다(리뷰: DOI 10.1175/BAMS-D-19-0308.1).',
    caveat:
      '즉 현재 라이브 예보에는 불확실성 구간이 없다. 예보 수치를 관측값과 같은 확신으로 읽어서는 안 된다.',
    href: '/methodology#nature-forecast',
  },
  {
    id: 4,
    title: '불확실성 정량화 (Glass-box)',
    position:
      '분포무관·유한표본에서 비자명한 조건부 커버리지는 달성 불가능하다(arXiv 1903.04684). 따라서 설계 목표는 "조건부 커버리지 달성"이 아니라 "판정 가능한 근사와 그 근사의 유한표본 하한"이고, 현행 구조(Mondrian 그룹 + Wilson 하한 게이트)는 이미 그 형태다 — 방법론적으로 옳은 틀 위에 있다.',
    caveat:
      '전체 bin PICP 0.876은 명목 0.80에 대한 초과 커버리지이고, 표본 변동으로 설명되지 않는다(우연으로 설명하려면 DEFF ≥ 8,423이 필요한데 시공간 군집으로 도달 가능한 범위가 아니다). 기전 가설은 구간 폭 하한 클리핑 / 보수적 폴백 경로 / calib–holdout 비교환성 셋이며 아직 판별되지 않았다. 게이트 상한이 [0.75, 0.85]로 강화되면 현재 값은 상한 위반이 된다. "구간이 넓으니 안전하다"가 아니라 "왜 넓은지 아직 모른다"가 정확한 상태 서술이다.',
    href: '/methodology#uncertainty',
  },
]

/**
 * Ships as its own chunk so "how much should I trust this reading list?" has a
 * grounded answer. Two of these are limits nobody would volunteer.
 */
export const CORPUS_CAVEAT = {
  title: '이 문헌 목록의 한계',
  body: [
    '수록 규칙: arXiv ID 또는 DOI가 API로 확인된 문헌만 들어 있다. 확인에 실패한 항목은 전량 제외했으므로, 여기 없다는 것이 "그런 연구가 없다"는 뜻은 아니다.',
    '인용 지형(어떤 논문이 어떤 논문을 반박했는지)은 조회하지 못했다. 유료 서비스 재인증을 하지 않기로 결정했기 때문이다. 앞선 세션에서 확인한 "contrasting = 0"을 "반박이 없다"로 읽어서는 안 된다 — 그 세션 스스로 인용문장 99%가 mentioning으로 색인돼 명시적 반박 탐지가 구조적으로 어렵다며 판정 불가로 강등했고, 일부 논문은 집계 자체가 0건이었다.',
    '정량 수치는 각 논문이 자기 조건에서 보고한 값이다. 지역·기간·분할 설계·위성 산출물이 다르면 AirLens 수치와 직접 비교할 수 없다.',
    '건강영향 용량-반응과 국가별 AQI 산정 체계 차이 두 축은 아직 비어 있다. 시민이 실제로 많이 묻는 축인데도 식별자를 갖춘 근거를 확보하지 못했으므로, 그 두 주제는 이 코퍼스로 답할 수 없다.',
  ],
  href: '/methodology',
}

/**
 * ── Corpus emission ─────────────────────────────────────────────────────────
 *
 * Turns the data above into corpus chunks.
 *
 * Separate from the data file because this is the one corpus source with real
 * emission logic worth testing: three different card shapes, a byte-capped id
 * convention, and counts that are computed from the ledger rather than typed
 * by hand. `scripts/build-corpus.mjs` calls `literatureChunks()` as its sixth
 * source; `literatureChunks.test.ts` pins the invariants.
 *
 * ## Why not one chunk per paper
 *
 * Retrieval is a flat top-5 over the whole index (`RAG_TOP_K`, no category
 * filter — workers/assistant/src/rag.ts `queryCorpus`). Emitting all 93
 * references as thin "title + doi" cards would spend those five slots on
 * bibliography and crowd out the chunks that actually answer a question, while
 * adding little: a card with no claim in it grounds nothing.
 *
 * So the emission follows the claim-unit rule instead — a chunk is a claim
 * plus its identifier and its scope:
 *
 *   - 4 domain cards      — where AirLens stands in an area, with its caveat
 *   - 12 paper cards      — only the papers that report a figure of their own
 *   - 18 method cards     — the calibration comparison, already claim-shaped
 *   - 1 caveat card       — the limits of this reading list
 *
 * The other 81 references stay in `LITERATURE_REFS` as the provenance ledger:
 * the domain cards count them and name them, and they are there to be
 * re-chunked if a later measurement says richer coverage helps. That
 * measurement does not exist yet — `retrieval_recall_at_3` is still null
 * (workers/assistant/eval/baseline.json), so the split above is a reasoned
 * default, not a tuned one.
 */

export interface CorpusChunk {
  id: string
  text: string
  source_title: string
  source_url: string
  category: string
}

/**
 * Every literature chunk carries this. The SOTA review's own words about its
 * comparison table — different region, period, split design and satellite
 * product mean the numbers are not on one scale, and none of them are
 * AirLens's own measurement.
 */
const SCOPE_NOTE =
  '이 카드는 외부에 published 된 연구 결과이며 AirLens가 측정한 값이 아니다. 지역·기간·분할 설계·위성 산출물이 다르면 AirLens 수치와 직접 비교할 수 없다.'

/** DOI link when the work has one, else its arXiv abstract page. */
export function refUrl(ref: LiteratureRef): string {
  if (ref.doi) return `https://doi.org/${ref.doi}`
  if (ref.arxivId) return `https://arxiv.org/abs/${ref.arxivId}`
  // The ledger's inclusion rule is "arXiv ID 또는 DOI가 API로 확인된 문헌만" —
  // an entry with neither should not exist. Fail loudly rather than emit a
  // citation card whose link goes nowhere.
  throw new Error(`literature ref "${ref.refId}" has neither a DOI nor an arXiv id`)
}

/** "Romano et al., 2019" / "Chen & Guestrin, 2016" — no fabricated initials. */
export function citeLabel(ref: LiteratureRef): string {
  const [first, second] = ref.authors
  const surname = (name: string) => name.trim().split(/\s+/).slice(-1)[0]
  const year = ref.year ?? 'n.d.'
  if (!first) return String(year)
  if (ref.authors.length === 1) return `${surname(first)}, ${year}`
  if (ref.authors.length === 2) return `${surname(first)} & ${surname(second)}, ${year}`
  return `${surname(first)} et al., ${year}`
}

function identifiers(ref: LiteratureRef): string {
  const parts: string[] = []
  if (ref.arxivId) parts.push(`arXiv:${ref.arxivId}`)
  if (ref.doi) parts.push(`DOI:${ref.doi}`)
  return parts.join(' / ')
}

function domainChunks(): CorpusChunk[] {
  return LITERATURE_DOMAINS.map((domain) => {
    const inDomain = LITERATURE_REFS.filter((r) => r.domains.includes(domain.id))
    const withNumbers = inDomain.filter((r) => r.quantitativeClaim)
    const numberLines = withNumbers
      .map((r) => `- ${citeLabel(r)} (${identifiers(r)}): ${r.quantitativeClaim}`)
      .join('\n')
    const reported =
      withNumbers.length > 0
        ? `\n문헌이 보고한 수치 (각 논문의 조건에서):\n${numberLines}`
        : '\n이 영역에서 자기 조건의 정량 수치를 보고한 문헌은 목록에 없다.'

    return {
      id: `literature:domain-${domain.id}`,
      text: `AirLens 방법론 위치 — ${domain.title}\n\n현재 위치: ${domain.position}\n\n남은 불확실성: ${domain.caveat}\n\n근거: 식별자(arXiv 또는 DOI)가 API로 확인된 문헌 ${inDomain.length}편.${reported}\n\n${SCOPE_NOTE}`,
      source_title: `AirLens 방법론 위치 — ${domain.title}`,
      source_url: domain.href,
      category: 'literature',
    }
  })
}

function paperChunks(): CorpusChunk[] {
  return LITERATURE_REFS.filter((r) => r.quantitativeClaim).map((ref) => ({
    id: `literature:${ref.refId}`,
    text: `${ref.title} (${citeLabel(ref)})\n\n보고된 결과: ${ref.quantitativeClaim}\n\nAirLens에서의 역할: ${ref.role}\n식별자: ${identifiers(ref)}\n검증: arXiv/Crossref API 조회로 식별자·제목 확인 (2026-09-02).\n\n${SCOPE_NOTE}`,
    source_title: `${ref.title} (${citeLabel(ref)})`,
    source_url: refUrl(ref),
    category: 'literature',
  }))
}

function calibrationChunks(): CorpusChunk[] {
  return CALIBRATION_METHODS.map((m) => ({
    id: `calibration:${m.slug}`,
    text: `예측구간 보정기법 — ${m.method} (${m.family})\n\n핵심 아이디어: ${m.idea}\n성립 가정: ${m.assumptions}\n한계: ${m.limits}\nAirLens 적용 가능성: ${m.applicability} (우선순위: ${m.priority})\n출처: ${m.sources}\n\n이 카드는 AirLens가 외부 문헌을 정리한 비교표의 한 행이다. ${SCOPE_NOTE}`,
    source_title: `예측구간 보정기법 — ${m.method}`,
    source_url: '/methodology#uncertainty',
    category: 'literature',
  }))
}

function caveatChunk(): CorpusChunk {
  return {
    id: 'literature:caveat',
    text: `${CORPUS_CAVEAT.title}\n\n${CORPUS_CAVEAT.body.map((line) => `- ${line}`).join('\n')}`,
    source_title: CORPUS_CAVEAT.title,
    source_url: CORPUS_CAVEAT.href,
    category: 'literature',
  }
}

export function literatureChunks(): CorpusChunk[] {
  return [...domainChunks(), ...paperChunks(), ...calibrationChunks(), caveatChunk()]
}
