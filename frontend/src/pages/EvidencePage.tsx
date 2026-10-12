import React, { useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FileSearch,
  Filter,
  ArrowUpDown,
  Database,
  BrainCircuit,
  GitBranch,
  Wind,
  ShieldAlert,
  ArrowLeft,
} from "lucide-react";
import { getJobFindings, listJobs, getJob } from "../api/endpoints";
import { FindingCard } from "../components/evidence/FindingCard";
import { GlassPanel } from "../components/ui/GlassPanel";
import { EmptyState } from "../components/ui/EmptyState";
import { EngineName, Severity } from "../types/api";

export const EvidencePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // If no job ID in route, select latest job or allow selection
  const { data: recentJobs } = useQuery({
    queryKey: ["recentJobsForEvidence"],
    queryFn: () => listJobs(20),
    enabled: !id,
  });

  const activeJobId = id || (recentJobs && recentJobs.length > 0 ? recentJobs[0].id : null);

  const selectedEngine = searchParams.get("engine") || "";
  const selectedSeverity = searchParams.get("min_severity") || "";
  const [sortBy, setSortBy] = useState<"score" | "severity" | "confidence">("score");

  // Fetch job details for dataset id
  const { data: jobData } = useQuery({
    queryKey: ["jobInfo", activeJobId],
    queryFn: () => getJob(activeJobId!),
    enabled: !!activeJobId,
  });

  // Fetch findings
  const {
    data: findings,
    isLoading: loadingFindings,
  } = useQuery({
    queryKey: ["jobFindings", activeJobId, selectedEngine, selectedSeverity],
    queryFn: () =>
      getJobFindings(
        activeJobId!,
        selectedEngine || undefined,
        selectedSeverity || undefined
      ),
    enabled: !!activeJobId,
  });

  const setFilter = (key: string, val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set(key, val);
    else next.delete(key);
    setSearchParams(next);
  };

  const sortedFindings = [...(findings || [])].sort((a, b) => {
    if (sortBy === "score") return b.score - a.score;
    if (sortBy === "confidence") return b.confidence - a.confidence;
    return b.id - a.id;
  });

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {id && (
              <button
                onClick={() => navigate(`/jobs/${id}`)}
                className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 mr-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Pipeline</span>
              </button>
            )}
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              FORENSIC EVIDENCE REPOSITORY
            </span>
          </div>
          <h1 className="text-2xl font-bold font-mono text-white tracking-tight flex items-center gap-2">
            <FileSearch className="w-6 h-6 text-cyan-400" />
            <span>Cryptographic & Statistical Evidence</span>
          </h1>
        </div>

        {/* Job selector dropdown if on global /evidence route */}
        {!id && recentJobs && recentJobs.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-mono text-slate-400">Target Job:</label>
            <select
              value={activeJobId || ""}
              onChange={(e) => navigate(`/jobs/${e.target.value}/evidence`)}
              className="bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300 outline-none focus:border-cyan-400"
            >
              {recentJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label || j.id} ({j.decision || j.status})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Filter and Sort Toolbar */}
      <GlassPanel className="p-4 border-white/10 flex flex-wrap items-center justify-between gap-4">
        {/* Engine filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-mono text-slate-400 flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Engine:</span>
          </span>

          {["", "data", "model", "provenance", "drift"].map((eng) => (
            <button
              key={eng}
              onClick={() => setFilter("engine", eng)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono uppercase transition-colors ${
                selectedEngine === eng
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "bg-white/5 text-slate-400 hover:text-white border border-transparent"
              }`}
            >
              {eng || "All"}
            </button>
          ))}
        </div>

        {/* Severity filter & Sort */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">Min Severity:</span>
            <select
              value={selectedSeverity}
              onChange={(e) => setFilter("min_severity", e.target.value)}
              className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-slate-200 focus:border-cyan-400 outline-none"
            >
              <option value="">ALL</option>
              <option value="INFO">INFO +</option>
              <option value="LOW">LOW +</option>
              <option value="MEDIUM">MEDIUM +</option>
              <option value="HIGH">HIGH +</option>
              <option value="CRITICAL">CRITICAL ONLY</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>Sort:</span>
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-slate-200 focus:border-cyan-400 outline-none"
            >
              <option value="score">Risk Score (Desc)</option>
              <option value="confidence">Confidence (Desc)</option>
            </select>
          </div>
        </div>
      </GlassPanel>

      {/* Findings List */}
      <div className="space-y-4">
        {loadingFindings ? (
          <div className="py-12 text-center text-xs font-mono text-cyan-400 animate-pulse">
            Retrieving signed forensic findings from ledger...
          </div>
        ) : sortedFindings.length > 0 ? (
          sortedFindings.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              datasetId={jobData?.dataset_id}
              initiallyExpanded={sortedFindings.length <= 3}
            />
          ))
        ) : (
          <EmptyState
            icon={ShieldAlert}
            title="No Matching Forensic Findings"
            description="All active engines reported clean operational metrics or filters excluded current items."
            actionText="Clear Filters"
            onAction={() => {
              setFilter("engine", "");
              setFilter("min_severity", "");
            }}
          />
        )}
      </div>
    </div>
  );
};
