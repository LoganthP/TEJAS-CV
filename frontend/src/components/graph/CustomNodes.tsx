import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import {
  User,
  Database,
  BrainCircuit,
  Binary,
  Cpu,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Layers,
  HelpCircle,
} from "lucide-react";

interface NodeData {
  label: string;
  status?: "ok" | "warning" | "danger" | "pending";
  [key: string]: any;
}

const getStatusRing = (status?: string) => {
  switch (status) {
    case "ok":
      return "border-emerald-500/50 shadow-glow-accept text-emerald-400";
    case "warning":
      return "border-amber-500/50 shadow-glow-review text-amber-400";
    case "danger":
      return "border-rose-500/60 shadow-glow-quarantine text-rose-400 animate-pulse";
    default:
      return "border-cyan-500/30 text-cyan-300";
  }
};

const BaseNode: React.FC<{
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  data: NodeData;
  accentBg: string;
}> = ({ icon: Icon, title, subtitle, data, accentBg }) => {
  const statusRing = getStatusRing(data.status);

  return (
    <div
      className={`px-3 py-2.5 rounded-xl bg-slate-900/95 border backdrop-blur-xl transition-all duration-200 w-[220px] shadow-xl ${statusRing}`}
      title={data.label || title}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 !bg-cyan-400 border border-black"
      />

      <div className="flex items-center gap-2">
        <div
          className={`w-7 h-7 rounded-lg ${accentBg} border border-white/10 flex items-center justify-center shrink-0`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="overflow-hidden min-w-0 flex-1">
          <div className="font-mono text-xs font-bold text-slate-100 line-clamp-2 leading-tight break-words">
            {data.label || title}
          </div>
          <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
            {subtitle || title}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-2 h-2 !bg-cyan-400 border border-black"
      />
    </div>
  );
};

export const UserNode: React.FC<NodeProps<any>> = ({ data }) => {
  const username = data.username || data.label || "operator";
  const displayName = data.label || username;
  const role = data.role || (username.startsWith("local:") ? "cli" : "user");

  return (
    <div
      className="px-3 py-2.5 rounded-xl bg-slate-900/95 border border-violet-500/40 backdrop-blur-xl transition-all duration-200 w-[220px] shadow-xl"
      title={`${displayName} (@${username}) - ${role}`}
    >
      <Handle
        type="source"
        position={Position.Right}
        className="w-2 h-2 !bg-violet-400 border border-black"
      />
      <div className="flex items-center gap-2">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold border border-white/20 ${
            role === "admin"
              ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
              : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
          }`}
        >
          {data.avatar ? (
            <img src={data.avatar} alt={displayName} className="w-full h-full rounded-full object-cover" />
          ) : (
            <User className="w-4 h-4" />
          )}
        </div>
        <div className="overflow-hidden min-w-0 flex-1">
          <div className="font-mono text-xs font-bold text-slate-100 truncate">
            {displayName}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] font-mono text-slate-400 truncate">
              @{username}
            </span>
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                role === "admin"
                  ? "bg-violet-500/20 text-violet-300"
                  : "bg-cyan-500/20 text-cyan-300"
              }`}
            >
              {role}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ContributorNode: React.FC<NodeProps<any>> = ({ data }) => (
  <BaseNode
    icon={User}
    title="Contributor"
    subtitle="Identity / Auth"
    data={data}
    accentBg="bg-blue-500/20 text-blue-300"
  />
);

export const DatasetNode: React.FC<NodeProps<any>> = ({ data }) => (
  <BaseNode
    icon={Database}
    title="Dataset"
    subtitle="Merkle Leaf Root"
    data={data}
    accentBg="bg-cyan-500/20 text-cyan-300"
  />
);

export const ModelNode: React.FC<NodeProps<any>> = ({ data }) => (
  <BaseNode
    icon={BrainCircuit}
    title="Model"
    subtitle="Weights / SHA-256"
    data={data}
    accentBg="bg-violet-500/20 text-violet-300"
  />
);

export const InferenceNode: React.FC<NodeProps<any>> = ({ data }) => (
  <BaseNode
    icon={Binary}
    title="Inference"
    subtitle="Chained Proofs"
    data={data}
    accentBg="bg-amber-500/20 text-amber-300"
  />
);

export const EngineNode: React.FC<NodeProps<any>> = ({ data }) => (
  <BaseNode
    icon={Cpu}
    title="Engine"
    subtitle="Assurance Engine"
    data={data}
    accentBg="bg-emerald-500/20 text-emerald-300"
  />
);

export const FusionNodeCustom: React.FC<NodeProps<any>> = ({ data }) => (
  <BaseNode
    icon={Zap}
    title="Fusion"
    subtitle="Evidence Synthesis"
    data={data}
    accentBg="bg-purple-500/20 text-purple-300"
  />
);

export const DecisionNodeCustom: React.FC<NodeProps<any>> = ({ data }) => (
  <BaseNode
    icon={
      data.status === "ok"
        ? CheckCircle2
        : data.status === "warning"
        ? AlertTriangle
        : ShieldAlert
    }
    title="Decision"
    subtitle="Judgement Seal"
    data={data}
    accentBg="bg-white/10 text-white"
  />
);

export const AuditNodeCustom: React.FC<NodeProps<any>> = ({ data }) => (
  <BaseNode
    icon={Layers}
    title="Audit"
    subtitle="Block Sealing"
    data={data}
    accentBg="bg-violet-500/20 text-violet-300"
  />
);

export const nodeTypes = {
  user: UserNode,
  contributor: ContributorNode,
  dataset: DatasetNode,
  model: ModelNode,
  inference: InferenceNode,
  engine: EngineNode,
  fusion: FusionNodeCustom,
  decision: DecisionNodeCustom,
  audit: AuditNodeCustom,
};
