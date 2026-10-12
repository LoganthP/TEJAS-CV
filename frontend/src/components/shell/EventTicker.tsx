import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Radio, ArrowRight, History, X } from "lucide-react";
import { useGlobalEventsContext } from "../EventsProvider";
import { DecisionBadge } from "../ui/DecisionBadge";

interface ToastNotification {
  id: string;
  type: string;
  jobId: string;
  message: string;
  decision?: string;
  timestamp: Date;
}

interface TickerEntry {
  text: string;
  timestamp: Date;
  jobId?: string;
}

function formatTickerEvent(ev: any): string | null {
  if (!ev) return null;
  const id: string = ev.job_id || ev.id || "SYSTEM";

  if (id.startsWith("JOB-")) {
    if (ev.type === "complete") {
      const parts = [`Assessment ${id}`];
      if (ev.decision) {
        parts.push(`→ ${ev.decision}`);
      }
      if (ev.risk_score != null && !isNaN(ev.risk_score)) {
        parts.push(`(risk ${Number(ev.risk_score).toFixed(1)})`);
      }
      return parts.join(" ");
    }
    if (ev.type === "failed") {
      return `Assessment ${id} FAILED: ${ev.error || "Execution error"}`;
    }
    const msg = ev.message || ev.stage;
    return msg ? `Assessment ${id}: ${msg}` : `Assessment ${id}: active`;
  }

  if (id.startsWith("BENCH-")) {
    if (ev.type === "complete") {
      return `Benchmark ${id}: ${ev.message || "completed"}`;
    }
    if (ev.type === "failed") {
      return `Benchmark ${id} FAILED: ${ev.error || "Execution error"}`;
    }
    const msg = ev.message || ev.stage;
    return `Benchmark ${id}: ${msg || "running"}`;
  }

  if (id.startsWith("TRAIN-")) {
    if (ev.epoch != null) {
      const total = ev.total_epochs || 10;
      const lossPart = ev.loss != null ? ` loss ${Number(ev.loss).toFixed(2)}` : "";
      return `Training ${id}: epoch ${ev.epoch}/${total}${lossPart}`;
    }
    if (ev.message) {
      return `Training ${id}: ${ev.message}`;
    }
    if (ev.type === "failed") {
      return `Training ${id} FAILED: ${ev.error || "Execution error"}`;
    }
    return `Training ${id}: ${ev.stage || "in progress"}`;
  }

  // Generic system / fallback events
  if (ev.message) {
    return `[${id}] ${ev.message}`;
  }
  if (ev.type === "complete") {
    return `Job ${id} completed`;
  }
  return null;
}

function isBenchOrPackJob(jobId: string, label?: string): boolean {
  if (!jobId) return false;
  if (jobId.startsWith("BENCH-")) return true;
  if (label && (label.startsWith("[bench]") || label.startsWith("[pack]"))) return true;
  return false;
}

export const EventTicker: React.FC = () => {
  const { latestEvent, connected } = useGlobalEventsContext();
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [latestTickerText, setLatestTickerText] = useState<string>("Event Bus Active — Monitoring CV Assets");
  const [tickerHistory, setTickerHistory] = useState<TickerEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  // Throttle: at most 2 updates per second (500 ms)
  const lastUpdateRef = useRef(0);
  const pendingEventRef = useRef<any>(null);

  const processEvent = useCallback((ev: any) => {
    if (!ev) return;
    const text = formatTickerEvent(ev);
    if (text) {
      // Ensure no undefined or null appears in output
      const sanitized = text.replace(/undefined/g, "").replace(/null/g, "").trim();
      setLatestTickerText(sanitized);
      setTickerHistory((prev) => [
        { text: sanitized, timestamp: new Date(), jobId: ev.job_id },
        ...prev.slice(0, 49),
      ]);
    }

    // Toasts: show only for complete/failed, never for BENCH or sub-jobs starting with [bench] or [pack]
    const label = ev.label || "";
    const isBench = isBenchOrPackJob(ev.job_id, label);

    if ((ev.type === "complete" || ev.type === "failed") && !isBench) {
      const riskPart = ev.risk_score != null ? ` · Risk ${Number(ev.risk_score).toFixed(1)}` : "";
      const newToast: ToastNotification = {
        id: `${ev.job_id}-${Date.now()}`,
        type: ev.type,
        jobId: ev.job_id,
        message:
          ev.type === "failed"
            ? `Pipeline failure: ${ev.error || "Execution error"}`
            : `${ev.decision || "COMPLETE"}${riskPart}`,
        decision: ev.decision || (ev.type === "failed" ? "QUARANTINE" : undefined),
        timestamp: new Date(),
      };

      setToasts((prev) => [newToast, ...prev.slice(0, 2)]); // stack at most 3
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 6000);
    }
  }, []);

  useEffect(() => {
    if (!latestEvent) return;
    const now = Date.now();
    const elapsed = now - lastUpdateRef.current;

    if (elapsed >= 500) {
      lastUpdateRef.current = now;
      processEvent(latestEvent);
    } else {
      if (pendingEventRef.current) clearTimeout(pendingEventRef.current);
      pendingEventRef.current = setTimeout(() => {
        lastUpdateRef.current = Date.now();
        processEvent(latestEvent);
        pendingEventRef.current = null;
      }, 500 - elapsed);
    }
  }, [latestEvent, processEvent]);

  // Listen for 403 Forbidden events across the application and display as high-priority toast
  useEffect(() => {
    const handleForbidden = (e: any) => {
      const msg = e.detail?.message || "Access denied: insufficient privileges";
      const newToast: ToastNotification = {
        id: `403-${Date.now()}`,
        type: "failed",
        jobId: "Security Policy",
        message: msg,
        decision: "QUARANTINE",
        timestamp: new Date(),
      };
      setToasts((prev) => [newToast, ...prev.slice(0, 2)]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 7000);
    };

    const handleToast = (e: any) => {
      const msg = e.detail?.message || "Notification";
      const newToast: ToastNotification = {
        id: `toast-${Date.now()}`,
        type: e.detail?.type === "failed" ? "failed" : "complete",
        jobId: e.detail?.title || "Account Notice",
        message: msg,
        decision: e.detail?.decision || "ACCEPT",
        timestamp: new Date(),
      };
      setToasts((prev) => [newToast, ...prev.slice(0, 2)]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 7000);
    };

    window.addEventListener("tejas:forbidden", handleForbidden);
    window.addEventListener("tejas:toast", handleToast);
    return () => {
      window.removeEventListener("tejas:forbidden", handleForbidden);
      window.removeEventListener("tejas:toast", handleToast);
    };
  }, []);

  // Close history popover on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <>
      {/* Bottom Ticker Strip */}
      <div className="h-7 border-t border-white/[0.06] bg-black/80 px-4 flex items-center justify-between text-[11px] font-mono select-none z-30">
        <div className="flex items-center gap-2 overflow-hidden flex-1 mr-4">
          <div className="flex items-center gap-1.5 shrink-0 text-cyan-400">
            <Radio className={`w-3 h-3 ${connected ? "animate-pulse text-cyan-400" : "text-slate-600"}`} />
            <span className="text-[10px] tracking-wider uppercase font-bold">BUS:</span>
          </div>
          <span className="truncate text-slate-300 font-mono">
            {latestTickerText}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-slate-400 relative" ref={historyRef}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
            title="Event history"
          >
            <History className="w-3 h-3" />
            <span>{tickerHistory.length}</span>
          </button>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-slate-600"}`} />

          {/* History Popover */}
          {showHistory && (
            <div className="absolute bottom-8 right-0 w-96 max-h-72 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/40">
                <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                  Recent Events ({tickerHistory.length})
                </span>
                <button onClick={() => setShowHistory(false)} className="text-slate-500 hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="overflow-y-auto max-h-60">
                {tickerHistory.length === 0 ? (
                  <div className="p-4 text-center text-[10px] text-slate-500">No events yet.</div>
                ) : (
                  tickerHistory.map((entry, i) => (
                    <div
                      key={i}
                      className="px-3 py-1.5 border-b border-white/5 text-[10px] font-mono text-slate-300 hover:bg-white/5 flex items-start gap-2"
                    >
                      <span className="text-slate-500 shrink-0">
                        {entry.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })}
                      </span>
                      <span className="truncate">{entry.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Global Toasts — bottom right, above status bar */}
      <div className="fixed bottom-9 right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto p-3 rounded-xl bg-slate-900/95 border border-white/10 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom-5 duration-300"
          >
            <div className="flex items-center gap-2.5">
              {toast.decision ? (
                <DecisionBadge decision={toast.decision} size="sm" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              )}
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-200">
                  {toast.message}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {toast.jobId}
                </span>
              </div>
            </div>

            <Link
              to={`/jobs/${toast.jobId}`}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-300 text-xs font-mono flex items-center gap-1 transition-colors shrink-0"
            >
              <span>View</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        ))}
      </div>
    </>
  );
};
