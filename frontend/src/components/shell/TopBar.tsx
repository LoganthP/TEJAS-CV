import React, { useEffect, useState, useRef } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Key,
  Clock,
  LogOut,
  User as UserIcon,
  Activity,
  X,
  Server,
  Radio,
  Layers,
} from "lucide-react";
import { truncateHash } from "../../lib/format";
import { HashText } from "../ui/HashText";
import { useAuth } from "../../hooks/useAuth";
import { useSystemStatus } from "../../hooks/useSystemStatus";
import { useGlobalEventsContext } from "../EventsProvider";
import { getClientDiagnostics, subscribeClientDiagnostics } from "../../api/client";
import { useQuery } from "@tanstack/react-query";
import { verifyAuditChain } from "../../api/endpoints";
import { MyProfileModal } from "./MyProfileModal";

interface TopBarProps {
  status?: any;
}

export const TopBar: React.FC<TopBarProps> = ({ status: propStatus }) => {
  const [time, setTime] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const { user, logout } = useAuth();
  const { systemStatus, isSecure, isCompromised } = useSystemStatus();
  const { connected, socketState, lastEventTime } = useGlobalEventsContext();

  const [diagnostics, setDiagnostics] = useState(getClientDiagnostics());

  const menuRef = useRef<HTMLDivElement>(null);
  const diagRef = useRef<HTMLDivElement>(null);
  const prevRoleRef = useRef<string | null>(null);

  // Monitor for role changes (e.g. from 60s refetch or window focus) and notify
  useEffect(() => {
    if (user?.role && prevRoleRef.current && prevRoleRef.current !== user.role) {
      const formatted = user.role.charAt(0).toUpperCase() + user.role.slice(1);
      window.dispatchEvent(
        new CustomEvent("tejas:toast", {
          detail: {
            message: `Your role is now ${formatted}`,
            title: "Clearance Elevation",
            decision: "ACCEPT",
          },
        })
      );
    }
    if (user?.role) {
      prevRoleRef.current = user.role;
    }
  }, [user?.role]);

  // Verification query to get first broken block if compromised
  const { data: verifyData } = useQuery({
    queryKey: ["auditVerifyGlobal"],
    queryFn: verifyAuditChain,
    enabled: isCompromised,
    staleTime: 10_000,
  });

  useEffect(() => {
    const unsub = subscribeClientDiagnostics(() => {
      setDiagnostics(getClientDiagnostics());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (diagRef.current && !diagRef.current.contains(e.target as Node)) {
        setDiagOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      clearInterval(interval);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const mode = systemStatus?.mode || "AIR-GAPPED";

  return (
    <header className="h-16 border-b border-white/[0.08] bg-bg-dark/80 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Brand & Wordmark */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center font-mono font-bold text-white shadow-glow-cyan text-sm tracking-wider">
            TCV
          </div>
          <div>
            <span className="font-bold tracking-wider text-base text-white font-mono">
              TEJAS-CV
            </span>
            <p className="text-[10px] text-slate-400 font-mono tracking-tight hidden sm:block">
              Computer-Vision Integrity Assurance
            </p>
          </div>
        </div>
      </div>

      {/* System Status Indicators */}
      <div className="flex items-center gap-3">
        {/* Connection Diagnostics Pill */}
        <div className="relative" ref={diagRef}>
          <button
            onClick={() => setDiagOpen(!diagOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border transition-all ${
              connected
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
            }`}
            title="Click for system diagnostics"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-cyan-400 animate-pulse" : "bg-rose-500"
              }`}
            />
            <span className="font-semibold">
              {diagnostics.lastLatencyMs !== null
                ? `${diagnostics.lastLatencyMs}ms`
                : connected
                ? "CONNECTED"
                : "OFFLINE"}
            </span>
            <Activity className="w-3 h-3 text-cyan-400 ml-0.5" />
          </button>

          {/* Diagnostics Popover */}
          {diagOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-cyan-400" />
                  <h4 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                    Connection Diagnostics
                  </h4>
                </div>
                <button
                  onClick={() => setDiagOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-black/40">
                  <span className="text-slate-400">API URL:</span>
                  <span className="text-cyan-300 font-bold truncate max-w-[150px]" title={diagnostics.apiUrl}>
                    {diagnostics.apiUrl}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-black/40">
                  <span className="text-slate-400">Health Latency:</span>
                  <span className="text-emerald-400 font-bold">
                    {diagnostics.lastLatencyMs !== null ? `${diagnostics.lastLatencyMs} ms` : "n/a"}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-black/40">
                  <span className="text-slate-400">Event Socket:</span>
                  <span
                    className={`font-bold ${
                      socketState === "OPEN" ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {socketState}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-black/40">
                  <span className="text-slate-400">Last Event Time:</span>
                  <span className="text-slate-300">
                    {lastEventTime
                      ? lastEventTime.toLocaleTimeString([], { hour12: false })
                      : "None received"}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-black/40">
                  <span className="text-slate-400">In-Flight Requests:</span>
                  <span className="text-cyan-300 font-bold">
                    {diagnostics.inFlightRequests}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-black/40">
                  <span className="text-slate-400">Ledger Health:</span>
                  <span
                    className={`font-bold uppercase ${
                      isSecure ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {systemStatus?.health || "UNKNOWN"}
                  </span>
                </div>

                {isCompromised && (
                  <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300">
                    First broken block: #{verifyData?.first_invalid_index ?? "loading"}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Air-gapped badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-white/[0.04] border border-white/10 text-slate-300">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          <span>{mode}</span>
        </div>

        {/* System Health / Ledger Badge */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold border ${
            isSecure
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-glow-quarantine animate-pulse"
          }`}
        >
          {isSecure ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>SYSTEM SECURE</span>
            </>
          ) : (
            <>
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>LEDGER COMPROMISED</span>
            </>
          )}
        </div>

        {/* Embedder chip */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-white/[0.03] border border-white/[0.08] text-slate-300">
          <Cpu className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-slate-400">EMB:</span>
          <span className="text-violet-300 font-medium">{systemStatus?.embedder || "loading"}</span>
        </div>

        {/* Signing Key Chip */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-white/[0.03] border border-white/[0.08] text-slate-300">
          <Key className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">KEY:</span>
          <HashText
            hash={systemStatus?.signing?.key_id ? truncateHash(systemStatus.signing.key_id, 10, 4) : "—"}
            showCopy={false}
            className="text-cyan-300 text-xs"
          />
        </div>

        {/* Clock */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-black/40 border border-white/5 text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>{time}</span>
        </div>

        {/* User Profile */}
        {user && (
          <div className="relative ml-2" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-2 py-1 rounded-full bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center border border-white/20">
                <UserIcon className="w-4 h-4 text-slate-300" />
              </div>
              <div className="hidden md:flex flex-col items-start pr-2">
                <span className="text-xs font-mono text-white leading-none tracking-tight">
                  {user.display_name || user.username}
                </span>
                <span
                  className={`text-[9px] font-mono font-bold tracking-widest uppercase mt-0.5 ${
                    user.role === "admin"
                      ? "text-violet-400"
                      : user.role === "operator"
                      ? "text-amber-400"
                      : "text-cyan-400"
                  }`}
                >
                  {user.role}
                </span>
              </div>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-bg-dark border border-white/10 rounded-xl shadow-2xl py-1 z-50">
                <div className="px-4 py-2 border-b border-white/5 mb-1">
                  <div className="text-sm font-mono text-white truncate">{user.username}</div>
                  <div className="text-xs font-mono text-slate-400 capitalize">{user.role}</div>
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setProfileOpen(true);
                  }}
                  className="w-full text-left px-4 py-2 text-sm font-mono text-slate-300 hover:text-white hover:bg-white/5 transition-colors flex items-center justify-between"
                >
                  <span>My Profile</span>
                  <UserIcon className="w-4 h-4 text-cyan-400" />
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  className="w-full text-left px-4 py-2 text-sm font-mono text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center justify-between border-t border-white/5 mt-1"
                >
                  <span>Disconnect</span>
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <MyProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
    </header>
  );
};
