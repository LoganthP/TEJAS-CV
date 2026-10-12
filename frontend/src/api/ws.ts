import { useEffect, useRef, useState, useCallback } from "react";
import { API_URL, getAuthToken } from "./client";
import { getJobEvents } from "./endpoints";
import { Check, Decision, EngineName, JobEvent, Stage } from "../types/api";

// Set VITE_LIVE_EVENTS=off on serverless hosts (Vercel). The always-open global event socket
// then stays closed (each one pins a function instance), and job progress uses HTTP polling.
export const LIVE_EVENTS_ENABLED =
  String(import.meta.env.VITE_LIVE_EVENTS ?? "on").toLowerCase() !== "off";

export function getWsUrl(path: string): string {
  let base = API_URL;
  if (!base && typeof window !== "undefined") {
    base = window.location.origin;
  }
  if (!base) throw new Error("WebSocket connections require a browser origin or VITE_API_URL");
  const parsed = new URL(base, typeof window !== "undefined" ? window.location.origin : undefined);
  const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  let finalPath = path.startsWith("/") ? path : `/${path}`;
  const token = getAuthToken();
  if (token && !finalPath.includes("token=")) {
    const sep = finalPath.includes("?") ? "&" : "?";
    finalPath = `${finalPath}${sep}token=${encodeURIComponent(token)}`;
  }
  return `${protocol}//${parsed.host}${finalPath}`;
}

export interface EngineState {
  progress: number;
  message: string;
  completed: boolean;
  duration_s?: number;
  error?: string | null;
  findings: { type: string; severity: any; title: string; confidence: number }[];
  checks: Check[];
}

export interface JobStreamState {
  events: JobEvent[];
  lastSeq: number;
  stage: Stage | null;
  progress: number;
  message: string;
  decision: Decision | null;
  riskScore: number | null;
  confidence: number | null;
  auditBlock: number | null;
  engineScores: Record<EngineName, number> | null;
  engineStates: Record<EngineName, EngineState>;
  isComplete: boolean;
  isFailed: boolean;
  error: string | null;
  connected: boolean;
  usingPolling: boolean;
}

const INITIAL_ENGINE_STATE: Record<EngineName, EngineState> = {
  data: { progress: 0, message: "Waiting to initialize...", completed: false, findings: [], checks: [] },
  model: { progress: 0, message: "Waiting to initialize...", completed: false, findings: [], checks: [] },
  provenance: { progress: 0, message: "Waiting to initialize...", completed: false, findings: [], checks: [] },
  drift: { progress: 0, message: "Waiting to initialize...", completed: false, findings: [], checks: [] },
};

export function useJobStream(jobId: string | null | undefined) {
  const [state, setState] = useState<JobStreamState>({
    events: [],
    lastSeq: 0,
    stage: null,
    progress: 0,
    message: "Connecting to assurance stream...",
    decision: null,
    riskScore: null,
    confidence: null,
    auditBlock: null,
    engineScores: null,
    engineStates: { ...INITIAL_ENGINE_STATE },
    isComplete: false,
    isFailed: false,
    error: null,
    connected: false,
    usingPolling: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const pollingTimerRef = useRef<any>(null);
  const lastSeqRef = useRef<number>(0);
  const isTerminalRef = useRef<boolean>(false);

  const processEvent = useCallback((ev: JobEvent) => {
    if (!ev) return;
    if (ev.seq !== undefined && ev.seq <= lastSeqRef.current) {
      return; // Already processed
    }
    if (ev.seq !== undefined) {
      lastSeqRef.current = Math.max(lastSeqRef.current, ev.seq);
    }

    setState((prev) => {
      const newEvents = [...prev.events, ev];
      let newStage = ev.stage || prev.stage;
      let newProgress = ev.progress !== undefined ? ev.progress : prev.progress;
      let newMessage = ev.message || prev.message;
      let newDecision = (ev as any).decision || prev.decision;
      let newRiskScore = (ev as any).risk_score !== undefined ? (ev as any).risk_score : prev.riskScore;
      let newConfidence = (ev as any).confidence !== undefined ? (ev as any).confidence : prev.confidence;
      let newAuditBlock = (ev as any).audit_block !== undefined ? (ev as any).audit_block : prev.auditBlock;
      let newEngineScores = (ev as any).engine_scores || prev.engineScores;
      let isComplete = prev.isComplete;
      let isFailed = prev.isFailed;
      let error = prev.error;

      const newEngineStates = { ...prev.engineStates };

      if (ev.type === "stage") {
        if (ev.stage) newStage = ev.stage;
        if (ev.decision) newDecision = ev.decision;
        if (ev.risk_score !== undefined) newRiskScore = ev.risk_score;
        if (ev.confidence !== undefined) newConfidence = ev.confidence;
      } else if (ev.type === "engine_progress") {
        const eng = ev.engine;
        if (eng && newEngineStates[eng]) {
          newEngineStates[eng] = {
            ...newEngineStates[eng],
            progress: ev.engine_progress,
            message: ev.message || newEngineStates[eng].message,
          };
        }
      } else if (ev.type === "engine_complete") {
        const eng = ev.engine;
        if (eng && newEngineStates[eng]) {
          newEngineStates[eng] = {
            ...newEngineStates[eng],
            progress: 100,
            completed: true,
            duration_s: ev.duration_s,
            error: ev.error,
            findings: ev.findings || [],
            checks: ev.checks || [],
            message: ev.message || "Completed",
          };
        }
      } else if (ev.type === "complete") {
        isComplete = true;
        isTerminalRef.current = true;
        newProgress = 100;
        newStage = "COMPLETED";
        if (ev.decision) newDecision = ev.decision;
        if (ev.risk_score !== undefined) newRiskScore = ev.risk_score;
        if (ev.confidence !== undefined) newConfidence = ev.confidence;
        if (ev.audit_block !== undefined) newAuditBlock = ev.audit_block;
        if (ev.engine_scores) newEngineScores = ev.engine_scores;
      } else if (ev.type === "failed") {
        isFailed = true;
        isTerminalRef.current = true;
        newStage = "FAILED";
        error = ev.error || "Job failed";
      } else if (ev.type === "error") {
        error = (ev as any).message || "An error occurred";
      }

      return {
        ...prev,
        events: newEvents,
        lastSeq: lastSeqRef.current,
        stage: newStage,
        progress: newProgress,
        message: newMessage,
        decision: newDecision,
        riskScore: newRiskScore,
        confidence: newConfidence,
        auditBlock: newAuditBlock,
        engineScores: newEngineScores,
        engineStates: newEngineStates,
        isComplete,
        isFailed,
        error,
      };
    });
  }, []);

  useEffect(() => {
    if (!jobId) return;

    lastSeqRef.current = 0;
    isTerminalRef.current = false;
    setState({
      events: [],
      lastSeq: 0,
      stage: null,
      progress: 0,
      message: "Initiating pipeline stream...",
      decision: null,
      riskScore: null,
      confidence: null,
      auditBlock: null,
      engineScores: null,
      engineStates: { ...INITIAL_ENGINE_STATE },
      isComplete: false,
      isFailed: false,
      error: null,
      connected: false,
      usingPolling: false,
    });

    let active = true;
    let pollingStarted = false;

    const startPolling = () => {
      if (!active || isTerminalRef.current || pollingStarted) return;
      pollingStarted = true;
      setState((s) => ({ ...s, usingPolling: true }));
      
      const poll = async () => {
        if (!active || isTerminalRef.current) return;
        try {
          const events = await getJobEvents(jobId, lastSeqRef.current);
          if (!active) return;
          setState((s) => ({ ...s, connected: true }));
          if (events && events.length > 0) {
            events.forEach(processEvent);
          }
        } catch {
          if (active) setState((s) => ({ ...s, connected: false }));
        }
        if (active && !isTerminalRef.current) {
          pollingTimerRef.current = setTimeout(poll, 1000);
        }
      };

      poll();
    };

    const connectWs = () => {
      const wsUrl = getWsUrl(`/ws/jobs/${jobId}`);
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!active) return;
          setState((s) => ({ ...s, connected: true, usingPolling: false }));
        };

        ws.onmessage = (event) => {
          if (!active) return;
          try {
            const data = JSON.parse(event.data);
            processEvent(data);
          } catch (e) {
            console.error("WS parse error:", e);
          }
        };

        ws.onerror = () => {
          if (!active) return;
          // Fall back to polling immediately
          if (!isTerminalRef.current) {
            startPolling();
          }
        };

        ws.onclose = () => {
          if (!active) return;
          if (!pollingStarted) setState((s) => ({ ...s, connected: false }));
          if (!isTerminalRef.current) {
            startPolling();
          }
        };
      } catch {
        startPolling();
      }
    };

    if (LIVE_EVENTS_ENABLED) connectWs();
    else startPolling();

    return () => {
      active = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [jobId, processEvent]);

  return state;
}

export function useGlobalEvents() {
  const [latestEvent, setLatestEvent] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let active = true;

    const connect = () => {
      const url = getWsUrl("/ws/events");
      try {
        ws = new WebSocket(url);
        ws.onopen = () => {
          if (active) setConnected(true);
        };
        ws.onmessage = (event) => {
          if (!active) return;
          try {
            const data = JSON.parse(event.data);
            setLatestEvent(data);
          } catch {}
        };
        ws.onerror = () => {
          if (active) setConnected(false);
        };
        ws.onclose = () => {
          if (active) {
            setConnected(false);
            setTimeout(connect, 3000);
          }
        };
      } catch {
        if (active) {
          setConnected(false);
          setTimeout(connect, 5000);
        }
      }
    };

    if (LIVE_EVENTS_ENABLED) connect();
    else setConnected(true);

    return () => {
      active = false;
      if (ws) ws.close();
    };
  }, []);

  return { latestEvent, connected };
}
