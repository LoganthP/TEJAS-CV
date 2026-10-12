import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ShieldAlert, LogIn, Lock, Hourglass, XCircle, Ban, CheckCircle2, Shield } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { login, getAuthStatus } from "../api/endpoints";
import { useAuth } from "../hooks/useAuth";
import { ApiError, setAuthToken } from "../api/client";

interface LoginStatusState {
  type: "pending" | "declined" | "disabled" | "locked" | "invalid" | "banner";
  message: string;
  note?: string;
}

export const LoginPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const requestedParam = searchParams.get("requested") || "";
  const isSetupParam = searchParams.get("setup") === "true";

  const [username, setUsername] = useState(requestedParam);
  const [password, setPassword] = useState("");
  const [statusState, setStatusState] = useState<LoginStatusState | null>(() => {
    if (isSetupParam) {
      return {
        type: "banner",
        message: "Administrator account created. Sign in to continue.",
      };
    }
    if (requestedParam) {
      return {
        type: "banner",
        message: "Access request submitted. An administrator must approve it before you can sign in.",
      };
    }
    return null;
  });

  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      const saved = sessionStorage.getItem("redirect_after_login") || "/";
      sessionStorage.removeItem("redirect_after_login");
      navigate(saved.startsWith("/") && !saved.startsWith("//") ? saved : "/", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (requestedParam && !username) {
      setUsername(requestedParam);
    }
  }, [requestedParam, username]);

  useEffect(() => {
    // Check if system needs setup
    getAuthStatus().then(res => {
      if (res.setup_required) {
        navigate("/signup", { replace: true });
      } else if (!res.auth_required) {
        navigate("/", { replace: true });
      }
    }).catch(console.error);
  }, [navigate]);

  useEffect(() => {
    if (lockedUntil) {
      const timer = setInterval(() => {
        if (Date.now() > lockedUntil) {
          setLockedUntil(null);
          setStatusState(null);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockedUntil]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockedUntil && Date.now() < lockedUntil) return;
    
    setLoading(true);
    setStatusState(null);
    
    try {
      const res = await login({ username: username.trim(), password });
      if (!res?.token || !res?.user?.id) {
        throw new ApiError(502, "The sign-in response was incomplete. Please retry.");
      }
      // Cancel checks from the previous session before installing the new one.
      await queryClient.cancelQueries({ queryKey: ["authMe"] });
      setAuthToken(res.token);
      queryClient.setQueryData(["authMe"], res.user);
    } catch (err: any) {
      const msg: string = err.message || "";
      const lower = msg.toLowerCase();

      if (err.status === 403) {
        if (lower.includes("pending")) {
          setStatusState({
            type: "pending",
            message: "Access request awaiting administrator approval.",
            note: "Your access request has been received and logged in the tamper-proof ledger. An administrator must approve it before you can sign in.",
          });
        } else if (lower.includes("declined") || lower.includes("rejected")) {
          // Extract note if present after colon
          const parts = msg.split(":");
          const notePart = parts.length > 1 ? parts.slice(1).join(":").trim() : undefined;
          setStatusState({
            type: "declined",
            message: "Access request was declined.",
            note: notePart || "Contact your platform administrator for further details or submit a new request.",
          });
        } else if (lower.includes("disabled")) {
          setStatusState({
            type: "disabled",
            message: "Account disabled.",
            note: "This account has been disabled by an administrator. Please contact operations support.",
          });
        } else {
          setStatusState({
            type: "disabled",
            message: msg || "Access denied.",
          });
        }
      } else if (err.status === 423) {
        setLockedUntil(Date.now() + 5 * 60 * 1000);
        setStatusState({
          type: "locked",
          message: "Account temporarily locked due to repeated failed logins.",
          note: "Security lock active for 5 minutes. Try again after the timer expires.",
        });
      } else {
        setStatusState({
          type: "invalid",
          message: "Invalid operator ID or passcode.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-bg-dark text-slate-100 bg-grid-pattern overflow-y-auto py-6 sm:py-10 px-4 flex flex-col items-center justify-start">
      {/* Top Brand Bar */}
      <div className="w-full max-w-md flex items-center justify-between mb-4 px-1">
        <Link to="/welcome" className="flex items-center gap-3 group focus:outline-none" title="Back to Platform Overview">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-glow-cyan group-hover:scale-105 transition-transform">
            <ShieldAlert className="w-4 h-4 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-mono font-bold text-lg text-white tracking-wider leading-none group-hover:text-cyan-300 transition-colors">TEJAS-CV</span>
            <span className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">Assurance Core</span>
          </div>
        </Link>
        <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-mono font-bold tracking-widest uppercase flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          AIR-GAPPED
        </span>
      </div>

      <div className="w-full max-w-md p-6 sm:p-8 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl relative overflow-hidden mb-12 my-auto">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />
        
        <div className="text-center mb-6">
          <h2 className="text-2xl font-mono font-bold text-white mb-1.5">Clearance Required</h2>
          <p className="text-slate-400 text-xs font-mono italic">"From 'Trust me' to 'Prove it.'"</p>
        </div>

        {/* State Banners: setup, requested, pending, declined, disabled, locked, invalid */}
        {statusState && (
          <div className="mb-6 animate-[fadeIn_0.3s_ease-out]">
            {statusState.type === "banner" && (
              <div className={`p-4 rounded-xl border flex items-start gap-3 text-xs font-mono ${
                isSetupParam 
                  ? "bg-violet-500/10 border-violet-500/30 text-violet-200" 
                  : "bg-cyan-500/10 border-cyan-500/30 text-cyan-200"
              }`}>
                {isSetupParam ? (
                  <Shield className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <strong className="block font-bold mb-0.5">
                    {isSetupParam ? "Administrator Account Ready" : "Request Submitted"}
                  </strong>
                  <span>{statusState.message}</span>
                </div>
              </div>
            )}

            {statusState.type === "pending" && (
              <div className="p-4 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-200 flex items-start gap-3 text-xs font-mono">
                <Hourglass className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-spin duration-3000" />
                <div>
                  <strong className="block font-bold text-amber-300 uppercase tracking-wider mb-1">
                    Awaiting Approval
                  </strong>
                  <p className="mb-1">{statusState.message}</p>
                  {statusState.note && <p className="text-[11px] text-amber-300/80 leading-relaxed">{statusState.note}</p>}
                </div>
              </div>
            )}

            {statusState.type === "declined" && (
              <div className="p-4 rounded-xl border bg-rose-500/10 border-rose-500/30 text-rose-200 flex items-start gap-3 text-xs font-mono">
                <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold text-rose-300 uppercase tracking-wider mb-1">
                    Request Declined
                  </strong>
                  <p className="mb-1">{statusState.message}</p>
                  {statusState.note && (
                    <div className="p-2 rounded bg-black/40 border border-rose-500/20 text-[11px] text-rose-300 font-mono mt-2">
                      <span className="text-[10px] text-slate-400 block uppercase">Reviewer Note:</span>
                      {statusState.note}
                    </div>
                  )}
                </div>
              </div>
            )}

            {statusState.type === "disabled" && (
              <div className="p-4 rounded-xl border bg-rose-500/10 border-rose-500/30 text-rose-300 flex items-start gap-3 text-xs font-mono">
                <Ban className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold text-rose-300 uppercase tracking-wider mb-0.5">
                    Account Disabled
                  </strong>
                  <p>{statusState.message}</p>
                  {statusState.note && <p className="text-[11px] text-slate-400 mt-1">{statusState.note}</p>}
                </div>
              </div>
            )}

            {statusState.type === "locked" && (
              <div className="p-4 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-300 flex items-start gap-3 text-xs font-mono">
                <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold text-amber-300 uppercase tracking-wider mb-0.5">
                    Security Lockout Active
                  </strong>
                  <p>{statusState.message}</p>
                  {lockedUntil && (
                    <p className="text-xs font-bold text-amber-200 mt-1">
                      Countdown: {Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))}s remaining
                    </p>
                  )}
                </div>
              </div>
            )}

            {statusState.type === "invalid" && (
              <div className="p-3.5 rounded-xl border bg-rose-500/10 border-rose-500/30 text-rose-300 flex items-start gap-2.5 text-xs font-mono animate-[shake_0.5s_ease-in-out]">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{statusState.message}</span>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1 uppercase tracking-wider">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors outline-none"
              placeholder="analyst.name"
              required
              disabled={!!lockedUntil || loading}
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1 uppercase tracking-wider">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors outline-none"
              placeholder="••••••••••••"
              required
              disabled={!!lockedUntil || loading}
            />
          </div>

          <button
            type="submit"
            disabled={!!lockedUntil || loading || !username || !password}
            className="w-full mt-6 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg px-4 py-2.5 text-xs font-mono font-bold tracking-widest uppercase transition-all shadow-glass-edge hover:shadow-glow-cyan disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Authenticate
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-center">
          <Link to="/welcome" className="text-xs font-mono text-slate-400 hover:text-cyan-400 transition-colors flex items-center gap-1.5">
            <span>&larr;</span> Back to Platform Overview
          </Link>
          <Link to="/signup" className="text-xs font-mono text-slate-400 hover:text-cyan-400 transition-colors">
            Need clearance? <span className="text-cyan-400 underline decoration-cyan-500/40 underline-offset-2">Request access</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
