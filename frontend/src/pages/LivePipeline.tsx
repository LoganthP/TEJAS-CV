import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useJobStream } from "../api/ws";
import { getJobSummary, listJobs } from "../api/endpoints";
import { PipelineCanvas } from "../components/pipeline/PipelineCanvas";
import { GlassPanel } from "../components/ui/GlassPanel";
import { EmptyState } from "../components/ui/EmptyState";
import { Activity, ArrowRight, ShieldCheck, Flame } from "lucide-react";
import { DecisionBadge } from "../components/ui/DecisionBadge";

export const LivePipeline: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // If no ID provided, fetch recent jobs to redirect or allow selection
  const { data: recentJobs, isLoading: loadingJobs } = useQuery({
    queryKey: ["recentJobsForPipeline"],
    queryFn: () => listJobs(10),
    enabled: !id,
  });

  // Auto-redirect to latest job if on `/jobs` without an ID
  useEffect(() => {
    if (!id && recentJobs && recentJobs.length > 0) {
      navigate(`/jobs/${recentJobs[0].id}`, { replace: true });
    }
  }, [id, recentJobs, navigate]);

  // Connect live WebSocket stream (with polling fallback built-in)
  const stream = useJobStream(id);

  // Fetch job summary when complete or for initial state
  const {
    data: summary,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["jobSummary", id],
    queryFn: () => getJobSummary(id!),
    enabled: !!id,
    refetchInterval: stream.isComplete ? false : 3000,
  });

  if (!id) {
    return (
      <div className="py-12 max-w-2xl mx-auto space-y-6">
        <EmptyState
          icon={Activity}
          title="No Active Assurance Pipeline Selected"
          description="Select a recent job from the list below, or launch an automated attack scenario in the Attack Lab."
          actionText="Go to Attack Lab"
          onAction={() => navigate("/lab")}
        />

        {recentJobs && recentJobs.length > 0 && (
          <GlassPanel className="p-5 border-white/10">
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-slate-200 mb-3">
              Recent Assurance Jobs
            </h3>
            <div className="space-y-2">
              {recentJobs.map((j) => (
                <div
                  key={j.id}
                  onClick={() => navigate(`/jobs/${j.id}`)}
                  className="p-3 rounded-xl bg-black/40 hover:bg-black/60 border border-white/5 hover:border-white/20 flex items-center justify-between cursor-pointer transition-all"
                >
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-200 block">
                      {j.label || j.id}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      Stage: {j.stage} • Progress: {j.progress}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <DecisionBadge decision={j.decision} size="sm" />
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>
        )}
      </div>
    );
  }

  return (
    <PipelineCanvas
      jobId={id}
      stream={stream}
      summary={summary || null}
      onRefresh={refetchSummary}
    />
  );
};
