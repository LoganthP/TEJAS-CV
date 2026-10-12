# TEJAS-CV — Frontend Build Prompt

Paste everything below the line into your AI coding tool (or hand it to your frontend teammate). It is
written against the **actual** backend in `backend/` — every endpoint, field and event name below exists.
Run the backend first (`uvicorn app.main:app --port 8000`) and keep `http://127.0.0.1:8000/docs` open.

---

## ROLE AND GOAL

You are a senior frontend engineer and product designer. Build the web frontend for **TEJAS-CV
(Trusted Evaluation & Judgement Assurance System for Computer Vision)**, an offline AI-integrity assurance
platform for defence computer-vision pipelines (Smart India Hackathon 2026, PS SIH26228, theme Blockchain &
Cybersecurity).

The product verifies datasets, models, inference records and contributors, fuses the evidence into a
risk score and returns **ACCEPT / REVIEW / QUARANTINE**, sealing every decision into a signed hash-chained
audit ledger. Story: **Detect → Explain → Prove → Decide**. Tagline: **From "Trust me" to "Prove it."**

It must feel like an **AI assurance command centre**, not a generic admin dashboard. The judges will watch
a live 5-minute demo, so the **Live Assurance Pipeline** screen is the hero.

## HARD CONSTRAINTS

- React 18 + TypeScript + Vite. Tailwind CSS. Framer Motion. Recharts. React Flow (`@xyflow/react`).
  Lucide React icons. React Router. TanStack Query for REST. No other UI kits.
- **Fully offline**: no CDN fonts, no Google Fonts, no analytics, no external images. Bundle fonts locally
  (e.g. `@fontsource/inter`, `@fontsource/jetbrains-mono`) or use system stacks.
- Backend base URL from `VITE_API_URL` (default `http://127.0.0.1:8000`); WebSocket URL derived from it.
- Strict TypeScript; all API types in `src/types/api.ts` exactly as specified below.
- Never invent data. Every number on screen comes from the API. Empty states must look intentional.
- Handle errors (backend down → full-screen "Assurance core offline" state with retry).
- Respect `prefers-reduced-motion`.
- `npm run build` and `npm run lint` must pass.

## VISUAL LANGUAGE

- **Base**: dark graphite `#0a0d12` → `#0f141b`, subtle radial gradients, a very faint 32px grid, one
  slow scanline sweep on the hero screen only. No particle storms.
- **Panels**: glass — `bg-white/[0.03]`, `backdrop-blur-xl`, `border border-white/[0.08]`, 16px radius,
  soft inner highlight on top edge.
- **Accents**: cyan `#22d3ee` (system / active), violet `#a78bfa` (cryptography / provenance).
- **Decision colours** (use only for status): ACCEPT `#34d399`, REVIEW `#fbbf24`, QUARANTINE `#f43f5e`.
- **Severity chips**: INFO slate, LOW sky, MEDIUM amber, HIGH orange, CRITICAL rose (with a pulsing dot).
- **Type**: Inter for UI, JetBrains Mono for hashes, IDs, block numbers and numeric readouts. Hashes shown
  truncated `8a4f…31d2` with copy-to-clipboard and full value on hover.
- **Motion rules**: the pipeline is the hero animation. Elsewhere: 150–250 ms fades/slides, number
  count-ups for scores, findings slide in as they arrive. Nothing loops forever except "processing"
  indicators and the CRITICAL pulse.
- Accessibility: never rely on colour alone — every status has an icon + label. WCAG AA contrast.

## APP SHELL

- Left rail (collapsible): Dashboard · Live Pipeline · Attack Lab · Evidence · Provenance · Audit Ledger ·
  Assets · Inference · Settings.
- Top bar: `TEJAS-CV` wordmark, **AIR-GAPPED ●** badge (from `/api/system/status.mode`), **SYSTEM SECURE**
  or **LEDGER COMPROMISED** badge (from `status.health`), embedder name chip (e.g. `handcrafted-v1` /
  `dinov2_vits14`), signing key id chip, clock.
- A global toast/ticker fed by `WS /ws/events` ("Job JOB-… → QUARANTINE").

## SCREENS

### 1. Dashboard (`/`)
Data: `GET /api/dashboard/summary`, `GET /api/system/status`, `GET /api/jobs?limit=20`.
- KPI strip: datasets, models, images, inferences, findings, audit blocks, contributors (count-up).
- Decision donut (ACCEPT/REVIEW/QUARANTINE from `decisions`) and severity bar chart (`severity_counts`).
- **Latest assessment** card: decision badge, risk gauge (0–100 arc with bands at 35 and 70 taken from
  `status.fusion.review_at / quarantine_at`), confidence %, four engine bars from `engine_scores`.
- Mini pipeline strip `INGEST → DATA → MODEL → PROVENANCE → DRIFT → FUSION → DECIDE` with state icons of
  the latest job.
- Recent findings table (severity, title, engine, job label) → click opens Evidence.
- Active jobs list with live progress.

### 2. Live Assurance Pipeline (`/jobs/:id`) — THE HERO
Data: `WS /ws/jobs/{id}` (replays history then streams live), `GET /api/jobs/{id}/summary` after
completion, `GET /api/jobs/{id}/findings`.
Layout (desktop):
```
  DATASET           MODEL            INFERENCE / LEDGER
     │                │                    │
  [FINGERPRINT] ── [FEATURES] ── [MODEL LOADING]         ← serial stages
     │
  ┌──────────┬──────────┬────────────┬──────────┐
  │  DATA    │  MODEL   │ PROVENANCE │  DRIFT   │       ← 4 parallel engine cards
  │ ████ 82% │ ███ 68%  │ █████ 91%  │ ██ 40%   │
  │ live msg │ live msg │ live msg   │ live msg │
  └────┬─────┴────┬─────┴─────┬──────┴────┬─────┘
       └──────────┴─────┬─────┴───────────┘
                 [EVIDENCE FUSION]  risk counts up
                        │
                  [ DECISION ]  big ACCEPT / REVIEW / QUARANTINE
                        │
                 [AUDIT BLOCK #n sealed]  → [SIGNED REPORT]
```
Behaviour:
- Overall progress bar driven by `progress` on every event; current `message` in mono under it.
- Serial stage nodes light up in order of `stage` events.
- Each engine card shows `engine_progress` % and the latest `message` for that `engine`; animated
  data-flow dots on its connector while running.
- On `engine_complete`: card settles to ok / warning / danger (worst severity in its `findings`:
  INFO/LOW → ok, MEDIUM → warning, HIGH/CRITICAL → danger), shows a findings count, a checks list
  (`checks[]` with PASSED / FLAGGED / SKIPPED / UNAVAILABLE / ERROR icons) and `duration_s`.
  Findings titles slide in under the card.
- On `stage` = `DECISION`: fusion node reveals `risk_score` (count-up) and `confidence`.
- On `complete`: decision node flips with a single decisive animation (scale + glow in decision colour),
  then the audit node shows `Block #{audit_block}` with a chain-link animation.
- On `failed`: danger state with the error.
- Right-side panel after completion: **"WHY?"** — `primary_reasons`, `rules_fired` (rule id + effect +
  reason), `recommended_action`, coverage (`ratio`, executed vs unavailable checks). Buttons: View evidence,
  View provenance graph, Download signed report (`GET /api/jobs/{id}/report` → save JSON), Verify report
  signature (show `signature_valid`).
- If the WebSocket drops, fall back to polling `GET /api/jobs/{id}/events?after={lastSeq}` every 1 s.

### 3. Attack Lab (`/lab`)
Data: `GET /api/demo/scenarios`, `POST /api/demo/bootstrap`, `POST /api/demo/scenarios/{name}`,
`POST /api/demo/reset`.
- "Initialise attack lab" button (shows spinner ~8 s; idempotent).
- Six scenario cards from the API (`title`, `story`, `expect`): clean, poisoned, model-substitution,
  weight-tamper, inference-tamper, drift. Each has **Run** → navigates to the Live Pipeline for the
  returned `job.id`. After completion, the card shows actual vs expected decision with ✓.
- "Live tamper" tools section (clearly labelled *simulated attacker with storage access*):
  - Tamper inference record → pick from `GET /api/inference`, `POST /api/demo/tamper/inference/{id}`.
  - Tamper audit block → pick index, `POST /api/demo/tamper/audit/{index}` (warn: "affects every later job;
    do this last or reset").
  - Tamper model file → pick model asset, `POST /api/demo/tamper/model-file/{asset_id}`.
- Reset button with confirmation dialog.

### 4. Evidence (`/jobs/:id/evidence` and drawer from anywhere)
Data: `GET /api/jobs/{id}/findings?engine=&min_severity=`.
- Filter by engine and severity; sort by `score`.
- Finding detail is a forensic card: FINDING (title + `finding_type`), SEVERITY, CONFIDENCE (%), SCORE,
  REASON, **EVIDENCE**, RECOMMENDATION, SUBJECT, `finding_hash` (mono, copy).
- Render `evidence` generically as a pretty key/value tree, **plus** these special renderers when keys
  exist:
  - `expected` / `observed` hashes or values → side-by-side diff with ✓/✕.
  - trigger tests (arrays with `attack_success_rate`, `target_class`, trigger names) → bar chart of ASR per
    trigger, control trigger highlighted.
  - sample lists with ids → thumbnail grid using `GET /api/assets/{dataset_id}/samples/{sid}/image`, each
    with a "Merkle proof" button (`GET …/proof` → show path and `verified`).
  - contributor attribution → per-contributor bar.
  - class distributions → grouped bars reference vs current.
  - p-values / OOD rates → stat tiles.
- Every finding shows the line "Sealed in audit block #n".

### 5. Provenance Graph (`/jobs/:id/provenance`)
Data: `GET /api/jobs/{id}/provenance-graph` → `{nodes, edges}` already shaped for React Flow
(`id`, `type`, `data.label`, `data.status` ok/warning/danger, extra data such as `merkle_root`, `sha256`,
`score`, `risk`, `confidence`, `block_hash`; edges with `label`).
- Node types: contributor, dataset, model, inference, engine, fusion, decision, audit — each a custom
  node component with an icon and status ring. Auto-layout left→right (dagre or a simple layered layout).
- Clicking a node opens a side panel with its data and links (asset detail, evidence filtered by engine,
  audit block).
- Animated edges only on the path to a danger node.

### 6. Audit Ledger (`/audit`)
Data: `GET /api/audit`, `POST /api/audit/verify`.
- Vertical chain of block cards: `#index`, `event_type`, `subject`, `timestamp`, `block_hash`,
  `previous_hash`, `merkle_root` + `leaf_count`, signature (truncated). Connectors between blocks.
- **VERIFY ENTIRE CHAIN** button: animate a scan down the chain block by block (~60 ms each), then apply
  results from `/api/audit/verify`: VALID ✓ (green), TAMPERED ⚠ (rose, show `issues` such as
  PAYLOAD_ALTERED / HEADER_ALTERED / LINK_BROKEN / BAD_SIGNATURE), UNTRUSTED_DOWNSTREAM (amber, dashed
  connector). Header banner: `AUDIT CHAIN ██████ VALID` or `COMPROMISED at block #n`.
- Block detail drawer shows the JSON payload.

### 7. Assets (`/assets`, `/assets/:id`)
Data: `GET /api/assets`, `GET /api/assets/{id}`, `GET /api/assets/{id}/samples`, `GET /api/contributors`,
`GET /api/registry/models`, `GET /api/baselines`.
- Tabs: Datasets · Models · Contributors · Trusted registry · Baselines.
- Dataset detail: Merkle root, sample count, class counts (from `meta`), signed ✓/✕, status badge
  (REGISTERED / ACCEPTED / UNDER_REVIEW / QUARANTINED), paginated sample grid with label filter.
- Model detail: format, params, input size, SHA-256, signed, status; "Approve as trusted"
  (`POST /api/registry/models {asset_id, name}`).
- Upload dialogs: dataset `.zip` (`POST /api/assets/datasets` multipart: file, name, contributor,
  signature?) and model (`POST /api/assets/models` multipart: file, name, contributor, adapter_meta JSON,
  signature?). Build-baseline dialog (`POST /api/baselines {dataset_id, name}`).
- **New assessment** wizard: pick dataset, model, baseline, trusted model name → `POST /api/jobs` →
  navigate to Live Pipeline.

### 8. Inference Provenance (`/inference`)
Data: `POST /api/inference` (multipart `model_id`, `file`), `GET /api/inference`,
`POST /api/inference/verify-chain`, `POST /api/inference/attest {record}`.
- Drop an image, pick a model → show the signed record: top class + probabilities chart, input/model/
  output hashes, nonce, timestamp, previous hash, record hash, signature.
- Chain view like the ledger, with Verify chain (statuses VALID / TAMPERED / UNTRUSTED_DOWNSTREAM and
  issues OUTPUT_ALTERED, RECORD_ALTERED, LINK_BROKEN, BAD_SIGNATURE, NONCE_REUSED, INPUT_ALTERED).
- "Present to downstream system" button calls attest; pressing it twice demonstrates **REPLAY** rejection.
  Show the `checks` map as a checklist and the `reason`.

### 9. Settings / System (`/settings`)
Data: `GET /api/system/status`. Read-only: mode, external network dependencies (should be an empty list —
display "None"), embedder + note, adapter availability, signing algorithm/key/public key, fusion weights and
thresholds, ledger length and head. Include a static **Known limitations** panel (copy from the report's
`limitations`) — "Honest by design" is part of the pitch.

## API TYPES (`src/types/api.ts`)

```ts
export type Decision = "ACCEPT" | "REVIEW" | "QUARANTINE";
export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type EngineName = "data" | "model" | "provenance" | "drift";
export type Stage = "QUEUED" | "LOADING" | "FINGERPRINTING" | "FEATURE_EXTRACTION" | "MODEL_LOADING"
  | "PARALLEL_ANALYSIS" | "FUSION" | "DECISION" | "AUDIT" | "REPORT" | "COMPLETED" | "FAILED";

export interface Job {
  id: string; label: string | null; dataset_id: string | null; model_id: string | null;
  baseline_id: string | null; trusted_model: string | null;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED"; stage: Stage; progress: number;
  risk_score: number | null; confidence: number | null; decision: Decision | null;
  engine_scores: Record<EngineName, number> | null; error: string | null;
  created_at: string; started_at: string | null; completed_at: string | null;
}
export interface JobSummary extends Job {
  severity_counts: Record<Severity, number>;
  primary_reasons: string[];
  rules_fired: { rule: string; effect: string; reason: string }[];
  recommended_action: string | null;
  coverage: { ratio?: number; executed?: number; unavailable?: number };
}
export interface Finding {
  id: number; job_id: string; engine: EngineName; finding_type: string; severity: Severity;
  confidence: number; score: number; title: string; reason: string;
  evidence: Record<string, unknown> | null; recommendation: string; subject: string; finding_hash: string;
}
export interface Check { name: string; status: "PASSED" | "FLAGGED" | "SKIPPED" | "UNAVAILABLE" | "ERROR"; detail: string }

interface EvBase { seq: number; job_id: string; ts: string; stage?: Stage; progress?: number; message?: string }
export type JobEvent =
  | (EvBase & { type: "queued" })
  | (EvBase & { type: "stage"; decision?: Decision; risk_score?: number; confidence?: number })
  | (EvBase & { type: "engine_progress"; engine: EngineName; engine_progress: number })
  | (EvBase & { type: "engine_complete"; engine: EngineName; duration_s: number; error: string | null;
      findings: { type: string; severity: Severity; title: string; confidence: number }[]; checks: Check[] })
  | (EvBase & { type: "complete"; decision: Decision; risk_score: number; confidence: number;
      engine_scores: Record<EngineName, number>; audit_block: number })
  | (EvBase & { type: "failed"; error?: string })
  | (EvBase & { type: "error" });

export interface Asset {
  id: string; asset_type: "dataset" | "model"; name: string; contributor: string; sha256: string;
  size: number; signed: boolean; status: string; meta: Record<string, any>; created_at: string;
}
export interface AuditBlock {
  index: number; timestamp: string; event_type: string; subject: string; payload: Record<string, unknown>;
  payload_hash: string; merkle_root: string | null; leaf_count: number; previous_hash: string;
  block_hash: string; signature: string;
}
export interface ChainVerification {
  valid: boolean; length: number; first_invalid_index: number | null; head_hash: string | null;
  verified_at: string;
  blocks: { index: number; event_type: string; subject: string; timestamp: string; block_hash: string;
    previous_hash: string; merkle_root: string | null;
    status: "VALID" | "TAMPERED" | "UNTRUSTED_DOWNSTREAM"; issues: string[] }[];
}
export interface InferenceRecord {
  id: string; seq: number; model_asset_id: string; model_hash: string; input_hash: string;
  output: { top_class: string; confidence: number; probabilities: Record<string, number>; [k: string]: unknown };
  output_hash: string; timestamp: string; nonce: string; previous_hash: string; record_hash: string;
  signature: string; attestations: number;
}
```
Verify any shape you are unsure about against `/docs` before coding it; adjust types, don't guess.

## PROJECT STRUCTURE

```
frontend/src/
  api/          client.ts (fetch wrapper, errors), endpoints.ts, ws.ts (useJobStream hook with replay,
                reconnect and polling fallback)
  types/api.ts
  components/
    shell/      Sidebar, TopBar, StatusBadges, EventTicker
    pipeline/   PipelineCanvas, StageNode, EngineCard, FusionNode, DecisionNode, AuditNode, FlowConnector
    evidence/   FindingCard, EvidenceRenderer (+ special renderers), SeverityChip
    ledger/     BlockCard, ChainVerifier
    graph/      custom React Flow nodes
    ui/         GlassPanel, HashText, RiskGauge, CountUp, DecisionBadge, EmptyState, Skeleton
  pages/        Dashboard, LivePipeline, AttackLab, Evidence, Provenance, AuditLedger, Assets,
                AssetDetail, Inference, Settings
  lib/          severity.ts, format.ts (hash truncation, %), decision.ts
```

## DEMO FLOW THE UI MUST MAKE EFFORTLESS (≈5 min)

1. Attack Lab → Initialise → Run **clean** → pipeline animates → ACCEPT.
2. Run **model-substitution** → model engine goes red live → WHY? shows the trigger-test finding;
   Evidence shows the ASR chart ("the signature was valid; the behaviour wasn't").
3. Run **poisoned** → contributor attribution + manifest mismatch with thumbnails and Merkle proof.
4. Run **inference-tamper** → Inference page chain shows the TAMPERED record; attest twice → REPLAY.
5. Run **drift** → REVIEW with named environmental conditions; banner "Drift ≠ attack".
6. Audit Ledger → tamper a block from the Lab → VERIFY ENTIRE CHAIN → scan animation → compromised.

Each step must be ≤2 clicks from the previous one. Add a "Next demo step →" helper on the Lab page.

## QUALITY BAR

- Looks deliberate at 1920×1080 on a projector and still works at 1366×768; readable from the back of a room
  (base font 15–16px, decision text ≥48px on the hero).
- Loading skeletons, not spinners, for data panels.
- No console errors. No placeholder lorem ipsum. No fake numbers.
- Write a short `frontend/README.md`: install, `npm run dev`, `VITE_API_URL`, offline build (`npm run build`
  → serve `dist/` locally).
