import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Database,
  BrainCircuit,
  Image,
  Binary,
  ShieldAlert,
  Layers,
  Users,
  Activity,
  ArrowRight,
  ShieldCheck,
  Clock,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { getDashboardSummary, listJobs } from "../api/endpoints";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { GlassPanel } from "../components/ui/GlassPanel";
import { CountUp } from "../components/ui/CountUp";
import { RiskGauge } from "../components/ui/RiskGauge";
import { DecisionBadge } from "../components/ui/DecisionBadge";
import { SeverityChip } from "../components/evidence/SeverityChip";
import { Skeleton } from "../components/ui/Skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { systemStatus } = useSystemStatus();

  const {
    data: summary,
    isLoading: loadingSummary,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["dashboardSummary"],
    queryFn: getDashboardSummary,
    staleTime: 10_000,
    refetchInterval: 30_000, // 30s dashboard safety refetch
  });

  const { data: recentJobs, refetch: refetchJobs } = useQuery({
    queryKey: ["recentJobs"],
    queryFn: () => listJobs(15),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const counts = summary?.counts || {
    datasets: 0,
    models: 0,
    images: 0,
    inferences: 0,
    findings: 0,
    jobs: 0,
    contributors: 0,
    audit_blocks: 0,
  };

  const latestJob = summary?.latest_job;

  // Decision Donut Data
  const decisionDonutData = [
    { name: "ACCEPT", value: summary?.decisions?.ACCEPT || 0, color: "#34d399" },
    { name: "REVIEW", value: summary?.decisions?.REVIEW || 0, color: "#fbbf24" },
    { name: "QUARANTINE", value: summary?.decisions?.QUARANTINE || 0, color: "#f43f5e" },
  ];

  // Severity Bar Chart Data
  const severityChartData = [
    { name: "INFO", count: summary?.severity_counts?.INFO || 0, color: "#94a3b8" },
    { name: "LOW", count: summary?.severity_counts?.LOW || 0, color: "#38bdf8" },
    { name: "MED", count: summary?.severity_counts?.MEDIUM || 0, color: "#fbbf24" },
    { name: "HIGH", count: summary?.severity_counts?.HIGH || 0, color: "#fb923c" },
    { name: "CRIT", count: summary?.severity_counts?.CRITICAL || 0, color: "#f43f5e" },
  ];

  // Mini pipeline stages for latest job
  const pipelineStages = [
    { label: "INGEST", ok: !!latestJob },
    { label: "DATA", ok: (latestJob?.engine_scores?.data ?? 0) < 60 },
    { label: "MODEL", ok: (latestJob?.engine_scores?.model ?? 0) < 60 },
    { label: "PROVENANCE", ok: (latestJob?.engine_scores?.provenance ?? 0) < 60 },
    { label: "DRIFT", ok: (latestJob?.engine_scores?.drift ?? 0) < 60 },
    { label: "FUSION", ok: latestJob?.risk_score !== null },
    { label: "DECIDE", ok: !!latestJob?.decision },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              COMMAND CENTRE OVERVIEW
            </span>
            <span className="text-xs font-mono text-slate-500">
              DEFENCE AIR-GAP NODE
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight">
            Assurance Operations Dashboard
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/lab"
            className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-mono font-semibold flex items-center gap-2 transition-all shadow-glass-edge hover:shadow-glow-quarantine"
          >
            <Sparkles className="w-4 h-4" />
            <span>Launch Attack Lab</span>
          </Link>

          <button
            onClick={() => refetchSummary()}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors border border-white/10"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 1. KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Datasets", count: counts.datasets, icon: Database, color: "text-cyan-400" },
          { label: "Models", count: counts.models, icon: BrainCircuit, color: "text-violet-400" },
          { label: "Images", count: counts.images, icon: Image, color: "text-blue-400" },
          { label: "Inferences", count: counts.inferences, icon: Binary, color: "text-amber-400" },
          { label: "Findings", count: counts.findings, icon: ShieldAlert, color: "text-rose-400" },
          { label: "Audit Blocks", count: counts.audit_blocks, icon: Layers, color: "text-emerald-400" },
          { label: "Contributors", count: counts.contributors, icon: Users, color: "text-indigo-400" },
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <GlassPanel key={idx} className="p-3.5 border-white/5">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[10px] font-mono uppercase tracking-wider">{item.label}</span>
                <Icon className={`w-3.5 h-3.5 ${item.color}`} />
              </div>
              <div className="text-xl font-mono font-bold text-white tracking-tight">
                {loadingSummary ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <CountUp value={item.count} duration={700} />
                )}
              </div>
            </GlassPanel>
          );
        })}
      </div>

      {/* 2. Middle Row: Latest Assessment (Hero Card) + Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Latest Assessment Card (7 cols) */}
        <div className="lg:col-span-7">
          <GlassPanel className="p-5 border-white/10 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
                    Latest Security Assessment
                  </h3>
                </div>
                {latestJob && (
                  <Link
                    to={`/jobs/${latestJob.id}`}
                    className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                  >
                    <span>Inspect Pipeline</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>

              {latestJob ? (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
                  {/* Gauge */}
                  <div className="sm:col-span-5 flex flex-col items-center justify-center p-2 rounded-xl bg-black/30 border border-white/5">
                    <RiskGauge
                      score={latestJob.risk_score}
                      confidence={latestJob.confidence}
                      reviewThreshold={systemStatus?.fusion?.review_at || 35}
                      quarantineThreshold={systemStatus?.fusion?.quarantine_at || 70}
                      size={170}
                    />
                    <div className="mt-2">
                      <DecisionBadge decision={latestJob.decision} size="md" />
                    </div>
                  </div>

                  {/* Engine Bars */}
                  <div className="sm:col-span-7 space-y-3">
                    <div className="text-xs font-mono text-slate-400 flex items-center justify-between">
                      <span>Job: {latestJob.label || latestJob.id}</span>
                      <span className="text-[10px] text-slate-500">ENGINE SCORES</span>
                    </div>

                    {[
                      { key: "data", label: "Data Integrity", score: latestJob.engine_scores?.data },
                      { key: "model", label: "Model Integrity", score: latestJob.engine_scores?.model },
                      { key: "provenance", label: "Provenance Chain", score: latestJob.engine_scores?.provenance },
                      { key: "drift", label: "Shift / Drift", score: latestJob.engine_scores?.drift },
                    ].map((eng) => {
                      const sc = eng.score ?? 0;
                      const barColor =
                        sc >= 70 ? "bg-rose-500" : sc >= 35 ? "bg-amber-400" : "bg-emerald-400";
                      return (
                        <div key={eng.key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-slate-300">{eng.label}</span>
                            <span className="text-slate-400 font-bold">{sc.toFixed(1)}</span>
                          </div>
                          <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden border border-white/5">
                            <div
                              className={`h-full rounded-full ${barColor}`}
                              style={{ width: `${Math.min(100, sc)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-xs font-mono text-slate-400">
                  No completed assurance job found. Run a scenario from the Attack Lab.
                </div>
              )}
            </div>

            {/* Mini Pipeline Strip */}
            {latestJob && (
              <div className="mt-5 pt-4 border-t border-white/10">
                <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-2">
                  Assurance Pipeline Execution
                </div>
                <div className="flex items-center justify-between gap-1 overflow-x-auto py-1">
                  {pipelineStages.map((stg, i) => (
                    <React.Fragment key={stg.label}>
                      <div
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 shrink-0 border ${
                          stg.ok
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "bg-rose-500/15 border-rose-500/30 text-rose-400"
                        }`}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>{stg.label}</span>
                      </div>
                      {i < pipelineStages.length - 1 && (
                        <span className="text-slate-600 text-xs shrink-0">→</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </GlassPanel>
        </div>

        {/* Donut and Severity Charts (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <GlassPanel className="p-4 border-white/10">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200 mb-2">
              Decision Breakdown
            </h4>
            <div className="h-36 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={decisionDonutData}
                    innerRadius={38}
                    outerRadius={56}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {decisionDonutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f141b",
                      borderColor: "rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontFamily: "JetBrains Mono",
                      fontSize: "11px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-around text-xs font-mono pt-1 border-t border-white/5">
              {decisionDonutData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-slate-400">{d.name}:</span>
                  <span className="font-bold text-white">{d.value}</span>
                </div>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel className="p-4 border-white/10">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200 mb-2">
              Findings Severity Distribution
            </h4>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severityChartData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                  <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f141b",
                      borderColor: "rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontFamily: "JetBrains Mono",
                      fontSize: "11px",
                    }}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {severityChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassPanel>
        </div>
      </div>

      {/* 3. Bottom Row: Recent Findings Table + Active Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Findings Table (8 cols) */}
        <div className="lg:col-span-8">
          <GlassPanel className="p-5 border-white/10">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
                  Recent Forensic Findings
                </h3>
              </div>
              <Link
                to="/evidence"
                className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <span>View All Findings</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/5 text-slate-500 uppercase text-[10px]">
                    <th className="py-2 px-2">Severity</th>
                    <th className="py-2 px-2">Engine</th>
                    <th className="py-2 px-2">Title</th>
                    <th className="py-2 px-2">Job Target</th>
                    <th className="py-2 px-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {summary?.recent_findings && summary.recent_findings.length > 0 ? (
                    summary.recent_findings.slice(0, 7).map((finding) => (
                      <tr
                        key={finding.id}
                        onClick={() => navigate(`/jobs/${finding.job_id}/evidence`)}
                        className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-2">
                          <SeverityChip severity={finding.severity} size="sm" />
                        </td>
                        <td className="py-2.5 px-2 text-slate-400 uppercase">
                          {finding.engine}
                        </td>
                        <td className="py-2.5 px-2 text-slate-200 font-sans font-medium truncate max-w-xs">
                          {finding.title}
                        </td>
                        <td className="py-2.5 px-2 text-cyan-300">
                          {finding.job_label || finding.job_id.slice(0, 12)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-bold text-slate-300">
                          {finding.score.toFixed(1)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                        No findings recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        </div>

        {/* Active & Recent Jobs (4 cols) */}
        <div className="lg:col-span-4">
          <GlassPanel className="p-5 border-white/10">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
                  Recent Jobs
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500">HISTORICAL LOG</span>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {recentJobs && recentJobs.length > 0 ? (
                recentJobs.map((job) => (
                  <Link
                    key={job.id}
                    to={`/jobs/${job.id}`}
                    className="p-2.5 rounded-xl bg-black/30 hover:bg-black/50 border border-white/5 hover:border-white/20 block transition-all group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono font-bold text-slate-200 group-hover:text-cyan-300 truncate max-w-[160px]">
                        {job.label || job.id}
                      </span>
                      {job.decision ? (
                        <DecisionBadge decision={job.decision} size="sm" />
                      ) : (
                        <span className="text-[10px] font-mono text-cyan-400 animate-pulse">
                          {job.status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>Stage: {job.stage}</span>
                      <span>Risk: {job.risk_score !== null ? job.risk_score.toFixed(1) : "—"}</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="py-6 text-center text-xs font-mono text-slate-500">
                  No jobs found.
                </div>
              )}
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
};
