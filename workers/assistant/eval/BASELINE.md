# baseline.json — 각 숫자가 어디서 나왔는가

`gate.ts` 의 계약: 베이스라인은 **사람이 더 나은 실행을 검토한 뒤** 갱신한다.
자동 갱신은 게이트를 무의미하게 만든다. 그래서 각 값의 출처를 여기 적는다 —
숫자만 보고는 검토할 수 없기 때문이다.

## 2026-09-03 — C4: retired chatbot worker eval 하네스 이식, baseline 전량 미확정

이 `eval/` 은 은퇴한 `apps/web/workers/chatbot/eval/`(AirLens-platform 레포)의
이식이다 — Field Assistant v2 design §1 D-1 "eval/ 하네스... 그대로 (cases 문항만
신 워커 프롬프트 대응 재작성)". RAG 백엔드가 Supabase pgvector → Cloudflare
Vectorize 로 바뀌었고 (design §1 D-3), 챗봇 자체가 새 워커(`workers/assistant`)
라서 **직전 레포의 baseline.json 수치를 그대로 들고 오지 않았다** — 다른
코퍼스·다른 검색 스택·다른 모델 환경에서 측정된 숫자를 새 시스템의 "이전
합격선"으로 자칭하는 건 게이트를 처음부터 거짓으로 시작하는 것이다.

**4 지표 전부 `null` 로 시작** (게이트 skip — report-only):

| metric | 이전 레포 값 (참고용, 이 레포 baseline 아님) | 이 레포 상태 |
|---|---|---|
| `routing_accuracy` | 1.0 | 측정 가능 (결정론적, `routing.eval.test.ts`) — C4 세션에서 실측했으나 **커밋은 사람 검토 후** |
| `retrieval_recall_at_3` | 0.667 (구 코퍼스 98건 PlatformDoc) | 코퍼스가 완전히 다름 (신규 62 chunks, `src/content/*.ts` 기반) — 구 값이 신 코퍼스에 대해 아무것도 말해주지 않음 |
| `quality_grounding` | 1.0 (judge 캘리브레이션) | judge 환경(`EVAL_JUDGE_URL`/`KEY`/`MODEL`) 이 이 레포 GitHub Secrets 에 아직 없음 — C4 세션 로컬에서도 미확인 |
| `quality_grounding_generated` | 1.0 (구 CHAT_MODEL 상한, 포화) | 위와 동일 사유 |

**커밋 안 한 이유** (C4 작업 지시 "baseline.json 갱신 금지 — 측정값만 보고"):
routing_accuracy 는 이 세션에서 로컬로 실측 가능했지만, gate.ts 의 계약 자체가
"사람이 검토한 뒤 갱신"이므로 에이전트가 측정 즉시 자체 커밋하면 계약을 어긴다.
실측값은 C4 세션 보고에 남기고, `null` 유지 상태로 PR 을 낸다 — 다음 사람이
값을 보고 승인하면 그 PR/커밋에서 baseline.json 을 갱신한다.

## 다음 단계

1. **routing_accuracy** — 결정론적이라 credential 없이 바로 측정 가능. 사람
   검토 후 즉시 커밋 가능한 지표.
2. **retrieval_recall_at_3** — `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_WORKERS_AI_TOKEN`
   (Workers AI Read/Run **+ Vectorize Read** 권한) 필요. 두 권한 모두 있는
   토큰이 아직 이 레포 GitHub Secrets 에 없음 (`CLOUDFLARE_ACCOUNT_ID` 만 존재,
   `CLOUDFLARE_PAGES_TOKEN` 은 별도 스코프 — Vectorize 접근 불가).
3. **quality_grounding[_generated]** — 위 토큰 + judge API 키
   (`EVAL_JUDGE_URL`/`EVAL_JUDGE_KEY`/`EVAL_JUDGE_MODEL`, 구 워크플로는
   `secrets.OPENAI_API_KEY` 사용) 필요. 둘 다 아직 미프로비저닝.
4. 위 시크릿이 갖춰지면 `.github/workflows/chatbot-model-ab.yml`(이식본,
   `.github/workflows/assistant-model-ab.yml`) 을 `workflow_dispatch` 하고,
   결과를 사람이 검토한 뒤 이 파일 + `baseline.json` 을 갱신한다.
