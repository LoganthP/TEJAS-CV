# TEJAS-CV Frontend

> **Trusted Evaluation & Judgement Assurance System for Computer Vision**  
> Tagline: *From "Trust me" to "Prove it."*

---

## Architecture Overview

TEJAS-CV Frontend is a defence-grade AI assurance command centre web application built with:
- **Core**: React 18, TypeScript, Vite
- **Styling & Aesthetics**: Tailwind CSS, Dark Graphite theme (`#0a0d12`), Glassmorphism panels, 32px cybernetic grid, hero scanline sweep
- **Animation & Visualizations**: Framer Motion, Recharts, React Flow (`@xyflow/react`), Lucide React
- **Data & Streaming**: TanStack Query, WebSocket stream with auto-reconnect, replay, and polling fallback
- **100% Offline Air-Gapped**: Self-bundled fonts (`@fontsource/inter`, `@fontsource/jetbrains-mono`), zero external CDNs, zero telemetry, zero Google fonts

---

## Quick Start

### 1. Prerequisites
- Node.js 18+ (tested on Node v23.7.0 and npm 11+)
- Python 3.10+ with the TEJAS-CV backend running on port 8000

### 2. Start the Backend
From the repository root or `backend/`:
```bash
cd backend
# Windows PowerShell
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Install & Run Frontend
In a new terminal:
```bash
cd frontend
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) in your browser.

---

## Configuration

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | `http://127.0.0.1:8000` | Base URL for TEJAS-CV FastAPI backend. WebSocket URL (`/ws/*`) is automatically derived. |

---

## Production & Air-Gapped Deployment

To build a standalone, offline production bundle:
```bash
npm run build
```

This outputs static files into `frontend/dist/`. In air-gapped defence field environments, serve it with any local web server:
```bash
npm run preview
# OR with python http.server
python -m http.server 5173 --directory dist
```

---

## 5-Minute Live Evaluation Flow

1. **Attack Lab (`/lab`)**: Click **Initialise Attack Lab** (~8s) to generate synthetic assets and baselines.
2. **Scenario: Clean**: Click **Run** on the *Clean Baseline* card. Watch the 4 parallel engines turn green live → **ACCEPT** verdict sealed into Audit Block.
3. **Scenario: Model Substitution**: Click **Run**. The Model Integrity engine turns red with Trojan backdoor trigger detection. Click "WHY?" to inspect the Attack Success Rate (ASR) chart.
4. **Scenario: Poisoned Dataset**: Click **Run**. The Data Integrity engine flags poisoned samples and displays verifiable Merkle inclusion proofs.
5. **Scenario: Inference Tamper**: Click **Run** or use the live tamper injector on `/inference`. Verify that forged output hashes are detected, and present the record twice to witness instant **REPLAY attack rejection**.
6. **Scenario: Environmental Shift (Drift)**: Click **Run**. Observe MMD $p < 0.01$ resulting in **REVIEW** with the explanatory doctrine *"Drift ≠ attack"*.
7. **Audit Ledger (`/audit`)**: Corrupt a block index in the Attack Lab, then click **VERIFY ENTIRE CHAIN** to watch the scan animation pinpoint the exact compromised block and invalidate downstream links.
