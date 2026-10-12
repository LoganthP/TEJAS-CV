import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import {
  GitBranch,
  ArrowLeft,
  X,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Clock,
  Layers,
  Database,
  BrainCircuit,
  Eye,
  EyeOff,
} from "lucide-react";
import { getProvenanceGraph, listJobs, getJob } from "../api/endpoints";
import { nodeTypes } from "../components/graph/CustomNodes";
import { GlassPanel } from "../components/ui/GlassPanel";
import { EmptyState } from "../components/ui/EmptyState";
import { HashText } from "../components/ui/HashText";
import { DecisionBadge } from "../components/ui/DecisionBadge";
import { useGlobalEventsContext } from "../components/EventsProvider";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { useAuth } from "../hooks/useAuth";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 75;

function layoutDagreGraph(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: "LR",
    align: "UL",
    nodesep: 45,
    ranksep: 90,
    marginx: 50,
    marginy: 50,
  });

  // Strict layer assignments by node type
  // people (0) -> assets (1) -> engines (2) -> fusion (3) -> decision (4) -> audit (5)
  const rankMap: Record<string, number> = {
    user: 0,
    contributor: 0,
    dataset: 1,
    model: 1,
    inference: 1,
    engine: 2,
    fusion: 3,
    decision: 4,
    audit: 5,
  };

  nodes.forEach((n) => {
    dagreGraph.setNode(n.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      rank: rankMap[n.type || ""] ?? 2,
    });
  });

  edges.forEach((e) => {
    dagreGraph.setEdge(e.source, e.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes: Node[] = nodes.map((n) => {
    const nodeWithPos = dagreGraph.node(n.id);
    return {
      ...n,
      position: {
        x: nodeWithPos ? nodeWithPos.x - NODE_WIDTH / 2 : 50,
        y: nodeWithPos ? nodeWithPos.y - NODE_HEIGHT / 2 : 50,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

const ProvenanceContent: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { latestEvent } = useGlobalEventsContext();
  const { isCompromised } = useSystemStatus();
  const { user } = useAuth();

  const [showPeople, setShowPeople] = useState(true);
  const [showOnlyMe, setShowOnlyMe] = useState(false);

  const [legendOpen, setLegendOpen] = useState(() => localStorage.getItem("provenance-legend-open") === "true");
  const legendRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("provenance-legend-open", legendOpen.toString());
  }, [legendOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (legendRef.current && !legendRef.current.contains(e.target as globalThis.Node)) {
        setLegendOpen(false);
      }
    };
    if (legendOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [legendOpen]);

  // Search & filter for job picker
  const [jobSearch, setJobSearch] = useState("");
  const [hideTestJobs, setHideTestJobs] = useState(true);
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false);

  // Fetch recent jobs
  const { data: recentJobs } = useQuery({
    queryKey: ["recentJobsForProvenance"],
    queryFn: () => listJobs(50),
    staleTime: 10_000,
  });

  const activeJobId = id || (recentJobs && recentJobs.length > 0 ? recentJobs[0].id : null);

  // Fetch active job metadata
  const { data: activeJob } = useQuery({
    queryKey: ["jobDetailForProvenance", activeJobId],
    queryFn: () => getJob(activeJobId!),
    enabled: !!activeJobId,
    staleTime: 10_000,
  });

  // Fetch provenance DAG
  const {
    data: graphData,
    isLoading: loadingGraph,
    refetch: refetchGraph,
  } = useQuery({
    queryKey: ["provenanceGraph", activeJobId],
    queryFn: () => getProvenanceGraph(activeJobId!),
    enabled: !!activeJobId,
    staleTime: 15_000,
  });

  // Auto refetch when complete event for this job arrives
  useEffect(() => {
    if (latestEvent && latestEvent.job_id === activeJobId && latestEvent.type === "complete") {
      refetchGraph();
      queryClient.invalidateQueries({ queryKey: ["jobDetailForProvenance", activeJobId] });
    }
  }, [latestEvent, activeJobId, refetchGraph, queryClient]);

  const [selectedNodeData, setSelectedNodeData] = useState<{
    id: string;
    type?: string;
    data: any;
  } | null>(null);

  const isJobRunning = activeJob?.status === "RUNNING";

  // Build DAG with dagre
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!graphData) return { initialNodes: [], initialEdges: [] };

    const rawNodes: Node[] = graphData.nodes
      .filter((n) => {
        const isPerson = n.type === "user" || n.type === "contributor";
        if (isPerson) {
          if (!showPeople) return false;
          if (showOnlyMe && user) {
            const isMe = n.data?.username === user.username || n.data?.label === user.username;
            if (!isMe) return false;
          }
        }
        return true;
      })
      .map((n) => ({
        id: n.id,
        type: n.type,
        data: n.data,
        position: { x: 0, y: 0 },
      }));

    const validNodeIds = new Set(rawNodes.map((n) => n.id));

    const dangerNodeIds = new Set(
      rawNodes
        .filter((n) => n.data.status === "danger")
        .map((n) => n.id)
    );

    const edges: Edge[] = graphData.edges
      .filter((e) => validNodeIds.has(e.source) && validNodeIds.has(e.target))
      .map((e) => {
        const isPathToDanger = dangerNodeIds.has(e.target);
      // Animate ONLY while job is running, or on path to danger node
      const animated = isJobRunning || isPathToDanger;

      // Format timestamp on edge label in local time, with UTC tooltip
      let displayLabel = e.label || "";
      let utcTooltip = "";
      if (e.data?.timestamp) {
        try {
          const d = new Date(e.data.timestamp);
          const localStr = d.toLocaleString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          const verb = e.data.action || "action";
          displayLabel = `${verb} · ${localStr}`;
          utcTooltip = `${e.data.timestamp} UTC`;
        } catch {}
      }

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: displayLabel,
        animated,
        style: {
          stroke: isPathToDanger ? "#f43f5e" : "#38bdf8",
          strokeWidth: isPathToDanger ? 2.5 : 1.5,
          opacity: 0.85,
        },
        labelStyle: {
          fill: "#cbd5e1",
          fontSize: 11,
          fontFamily: "JetBrains Mono, monospace",
          fontWeight: 600,
        },
        labelBgStyle: {
          fill: "#0f172a",
          fillOpacity: 0.95,
        },
        labelBgPadding: [6, 4] as [number, number],
        labelBgBorderRadius: 6,
        data: {
          ...e.data,
          tooltip: utcTooltip || displayLabel,
        },
      };
    });

    const layouted = layoutDagreGraph(rawNodes, edges);
    return { initialNodes: layouted.nodes, initialEdges: layouted.edges };
  }, [graphData, isJobRunning, showPeople, showOnlyMe, user]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const handleNodeClick = (_: any, node: Node) => {
    setSelectedNodeData({ id: node.id, type: node.type, data: node.data });
  };

  // Filtered jobs for searchable picker
  const filteredJobs = useMemo(() => {
    if (!recentJobs) return [];
    return recentJobs
      .filter((j) => {
        const lbl = (j.label || "").toLowerCase();
        const jId = (j.id || "").toLowerCase();
        if (hideTestJobs && (lbl.startsWith("[bench") || lbl.startsWith("[pack") || jId.startsWith("bench-"))) {
          return false;
        }
        if (jobSearch) {
          const s = jobSearch.toLowerCase();
          return lbl.includes(s) || jId.includes(s) || (j.decision || "").toLowerCase().includes(s);
        }
        return true;
      })
      .sort((a, b) => (b.id > a.id ? 1 : -1)); // newest first
  }, [recentJobs, hideTestJobs, jobSearch]);

  return (
    <div className="space-y-4 pb-12 flex flex-col h-[calc(100vh-6.5rem)]">
      {/* Top Header & Job Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
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
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-semibold">
              DAG PROVENANCE LINEAGE
            </span>
          </div>
          <h1 className="text-2xl font-bold font-mono text-white tracking-tight flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-violet-400" />
            <span>Cryptographic Provenance Graph</span>
          </h1>
        </div>

        {/* Searchable Job Picker */}
        <div className="flex items-center gap-2 relative">
          <button
            onClick={() => refetchGraph()}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors"
            title="Refresh graph"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => setJobDropdownOpen(!jobDropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-white/10 hover:border-cyan-500/40 text-xs font-mono transition-colors text-slate-200"
            >
              <span className="text-slate-400">Target Job:</span>
              <span className="text-cyan-300 font-bold truncate max-w-[160px]">
                {activeJob?.label || activeJobId || "Select Job"}
              </span>
              {activeJob?.decision && <DecisionBadge decision={activeJob.decision} size="sm" />}
            </button>

            {jobDropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                {/* Search & Toggle Controls */}
                <div className="space-y-2 mb-2 pb-2 border-b border-white/10">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search jobs..."
                      value={jobSearch}
                      onChange={(e) => setJobSearch(e.target.value)}
                      className="w-full bg-black/60 border border-white/10 rounded-lg pl-8 pr-2 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hideTestJobs}
                        onChange={(e) => setHideTestJobs(e.target.checked)}
                        className="rounded accent-cyan-400"
                      />
                      <span>Hide test jobs ([bench], [pack])</span>
                    </label>
                  </div>
                </div>

                {/* Job List */}
                <div className="max-h-60 overflow-y-auto space-y-1 pr-1 font-mono text-xs">
                  {filteredJobs.length === 0 ? (
                    <div className="p-3 text-center text-slate-500 text-[10px]">No matching jobs</div>
                  ) : (
                    filteredJobs.map((j) => {
                      const isCompromisedJob =
                        j.decision === "QUARANTINE" &&
                        (j.label?.includes("tamper") || (j as any).scenario?.includes("tamper"));

                      return (
                        <div
                          key={j.id}
                          onClick={() => {
                            navigate(`/jobs/${j.id}/provenance`);
                            setJobDropdownOpen(false);
                          }}
                          className={`p-2 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                            j.id === activeJobId
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                              : "hover:bg-white/5 text-slate-300"
                          }`}
                        >
                          <div className="overflow-hidden min-w-0 pr-2">
                            <span className="font-bold block truncate">{j.label || j.id}</span>
                            <span className="text-[10px] text-slate-500 block">{j.id}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isCompromisedJob && (
                              <span
                                className="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                title="Run during compromised ledger state"
                              >
                                COMPROMISED
                              </span>
                            )}
                            <DecisionBadge decision={j.decision} size="sm" />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 relative rounded-2xl border border-white/10 bg-slate-950/90 overflow-hidden shadow-2xl">
        {loadingGraph ? (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-cyan-400 gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Constructing layered DAG provenance graph…</span>
          </div>
        ) : nodes.length > 0 ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1e293b" gap={28} size={1} />
            <Controls className="!bg-slate-900 !border-white/10 !rounded-xl !shadow-2xl overflow-hidden" />
            <MiniMap
              nodeColor={(n) => {
                if (n.type === "user") return "#8b5cf6";
                if (n.data?.status === "danger") return "#f43f5e";
                if (n.data?.status === "warning") return "#fbbf24";
                return "#22d3ee";
              }}
              maskColor="rgba(15,23,42,0.85)"
              className="!bg-slate-900/95 !border !border-white/10 !rounded-xl overflow-hidden"
              style={{ width: 160, height: 110 }}
            />
            {/* Filters */}
            <div className="absolute top-4 left-4 z-10 flex gap-2">
              <button
                onClick={() => setShowPeople(!showPeople)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors border shadow-lg ${
                  showPeople ? "bg-violet-500/20 text-violet-300 border-violet-500/40" : "bg-slate-900/80 text-slate-500 border-white/10 hover:text-slate-300"
                }`}
              >
                {showPeople ? <Eye className="w-3.5 h-3.5 inline mr-1" /> : <EyeOff className="w-3.5 h-3.5 inline mr-1" />}
                People
              </button>
              {showPeople && user && (
                <button
                  onClick={() => setShowOnlyMe(!showOnlyMe)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors border shadow-lg ${
                    showOnlyMe ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "bg-slate-900/80 text-slate-500 border-white/10 hover:text-slate-300"
                  }`}
                >
                  Only Me
                </button>
              )}
            </div>
            {/* Legend */}
            <div 
              ref={legendRef}
              className={`absolute top-4 z-30 transition-all duration-300 ${selectedNodeData ? 'right-[420px]' : 'right-4'}`}
            >
              {legendOpen ? (
                <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-900/95 border border-white/10 shadow-2xl backdrop-blur-md min-w-[180px]">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider">Legend</div>
                    <button onClick={() => setLegendOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/5 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                    <div className="w-3 h-3 rounded-full bg-violet-500/20 border border-violet-500/40"></div>
                    <span>Platform User</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                    <div className="w-3 h-3 rounded-md bg-blue-500/20 border border-blue-500/40"></div>
                    <span>External Contributor</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                    <div className="w-3 h-3 rounded-md bg-cyan-500/20 border border-cyan-500/40"></div>
                    <span>Asset / Data</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                    <div className="w-3 h-3 rounded-md bg-rose-500/20 border border-rose-500/40"></div>
                    <span>Compromised / Danger</span>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setLegendOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors border shadow-lg bg-slate-900/90 text-slate-400 border-white/10 hover:text-slate-200"
                >
                  Legend
                </button>
              )}
            </div>
          </ReactFlow>
        ) : (
          <EmptyState
            icon={GitBranch}
            title="No Provenance Lineage Available"
            description="Select an assurance job to view its cryptographic contributor, asset, and engine DAG."
          />
        )}

        {/* Selected Node Side Panel Drawer */}
        {selectedNodeData && (
          <div className="absolute top-4 right-4 z-40 max-w-sm w-full animate-in slide-in-from-right duration-200">
            <GlassPanel className="p-4 border-cyan-500/40 bg-slate-900/95 shadow-2xl backdrop-blur-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 uppercase text-cyan-300 font-bold shrink-0">
                    {selectedNodeData.type}
                  </span>
                  <h4 className="font-mono text-xs font-bold text-white truncate">
                    {selectedNodeData.data.label}
                  </h4>
                </div>
                <button
                  onClick={() => setSelectedNodeData(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs font-mono">
                {selectedNodeData.type === "user" && (
                  <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Operator:</span>
                      <span className="text-violet-300 font-bold">
                        @{selectedNodeData.data.username || selectedNodeData.data.label}
                      </span>
                    </div>
                    {selectedNodeData.data.role && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Platform Role:</span>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-violet-500/20 text-violet-200 border border-violet-500/30 uppercase font-bold">
                          {selectedNodeData.data.role}
                        </span>
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400 pt-1 border-t border-white/5">
                      Attributed operator in immutable assurance provenance DAG.
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between p-2 rounded bg-black/40">
                  <span className="text-slate-400">Integrity Status:</span>
                  <span
                    className={`font-bold uppercase ${
                      selectedNodeData.data.status === "danger"
                        ? "text-rose-400"
                        : selectedNodeData.data.status === "warning"
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {selectedNodeData.data.status || "OK"}
                  </span>
                </div>

                {selectedNodeData.data.created_by && (
                  <div className="flex items-center justify-between p-2 rounded bg-black/40">
                    <span className="text-slate-400">Process Triggered By:</span>
                    <span className="text-cyan-300 font-bold">
                      @{selectedNodeData.data.created_by}
                    </span>
                  </div>
                )}

                {selectedNodeData.data.decision && (
                  <div className="flex items-center justify-between p-2 rounded bg-black/40">
                    <span className="text-slate-400">Assurance Verdict:</span>
                    <span className="font-bold text-white uppercase">
                      {selectedNodeData.data.decision}
                    </span>
                  </div>
                )}

                {selectedNodeData.data.sha256 && (
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase">SHA-256 Digest:</span>
                    <HashText hash={selectedNodeData.data.sha256} className="text-[11px] text-cyan-300" />
                  </div>
                )}

                {selectedNodeData.data.merkle_root && (
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase">Merkle Root:</span>
                    <HashText hash={selectedNodeData.data.merkle_root} className="text-[11px] text-violet-300" />
                  </div>
                )}

                {selectedNodeData.data.uploaded_by && (
                  <div className="flex items-center justify-between p-2 rounded bg-black/40">
                    <span className="text-slate-400">Uploaded By:</span>
                    <span className="text-slate-200 font-bold">
                      {selectedNodeData.data.uploaded_by}
                    </span>
                  </div>
                )}

                {selectedNodeData.data.uploaded_at && (
                  <div className="flex items-center justify-between p-2 rounded bg-black/40">
                    <span className="text-slate-400">Uploaded At:</span>
                    <span className="text-slate-300 text-[10px]">
                      {new Date(selectedNodeData.data.uploaded_at).toLocaleString()}
                    </span>
                  </div>
                )}

                {selectedNodeData.data.score !== undefined && (
                  <div className="flex items-center justify-between p-2 rounded bg-black/40">
                    <span className="text-slate-400">Engine Score:</span>
                    <span className="text-slate-200 font-bold">{selectedNodeData.data.score}</span>
                  </div>
                )}

                {selectedNodeData.data.risk !== undefined && (
                  <div className="flex items-center justify-between p-2 rounded bg-black/40">
                    <span className="text-slate-400">Fused Risk Score:</span>
                    <span className="text-slate-200 font-bold">{selectedNodeData.data.risk}</span>
                  </div>
                )}

                {selectedNodeData.data.block_hash && (
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase">Audit Block Hash:</span>
                    <HashText hash={selectedNodeData.data.block_hash} className="text-[11px] text-emerald-300" />
                  </div>
                )}

                {/* Direct Cross-Links */}
                <div className="pt-2 border-t border-white/10 flex flex-col gap-1.5">
                  <Link
                    to={`/jobs/${activeJobId}/evidence`}
                    className="w-full py-1.5 px-2 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-center text-xs hover:bg-cyan-500/30 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>View Evidence Ledger</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>

                  <Link
                    to="/assets"
                    className="w-full py-1.5 px-2 rounded-lg bg-white/5 text-slate-300 border border-white/10 text-center text-xs hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>Assets Registry</span>
                    <Database className="w-3 h-3 text-cyan-400" />
                  </Link>

                  <Link
                    to="/audit"
                    className="w-full py-1.5 px-2 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30 text-center text-xs hover:bg-violet-500/30 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>Inspect In Audit Ledger</span>
                    <Layers className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </GlassPanel>
          </div>
        )}
      </div>
    </div>
  );
};

export const ProvenancePage: React.FC = () => {
  return (
    <ErrorBoundary fallbackTitle="Provenance Graph Panel Error">
      <ProvenanceContent />
    </ErrorBoundary>
  );
};
