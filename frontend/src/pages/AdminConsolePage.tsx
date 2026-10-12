import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Activity as ActivityIcon,
  ShieldAlert,
  Key,
  Ban,
  CheckCircle2,
  Shield,
  Clock,
  Check,
  X,
  AlertTriangle,
  UserCheck,
  UserX,
  Terminal,
  Cpu,
  Info,
  Pencil,
  Lock,
  Building,
  Mail,
} from "lucide-react";
import {
  getUsers,
  updateUser,
  resetUserPassword,
  getRequests,
  approveRequest,
  rejectRequest,
  approveRoleRequest,
  rejectRoleRequest,
  getAuditBlocks,
} from "../api/endpoints";
import { User } from "../types/api";
import { GlassPanel } from "../components/ui/GlassPanel";
import { RequirePermission } from "../hooks/RequirePermission";
import { useAuth } from "../hooks/useAuth";

export const AdminConsolePage: React.FC = () => {
  const [tab, setTab] = useState<"requests" | "users" | "matrix" | "activity">("requests");

  const { data: pendingRequests } = useQuery({
    queryKey: ["adminPendingRequests"],
    queryFn: () => getRequests("pending"),
    refetchInterval: 30000,
  });

  const pendingCount = pendingRequests?.length || 0;

  return (
    <RequirePermission perm="manage_users" fallback={<div className="text-center py-12 text-slate-400 font-mono">Administrator access required.</div>}>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-mono font-bold text-white flex items-center gap-2">
              <Users className="w-6 h-6 text-violet-400" />
              Access Management
            </h1>
            <p className="text-slate-400 font-mono text-sm mt-1">
              Review access requests, manage role assignments, and inspect security audit events.
            </p>
          </div>
          <div className="flex p-1 bg-black/40 border border-white/10 rounded-lg shrink-0">
            <button
              onClick={() => setTab("requests")}
              className={`px-3 py-1.5 rounded text-xs font-mono font-bold uppercase tracking-wider transition-colors flex items-center gap-2 ${
                tab === "requests" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>Pending Requests</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-black text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("users")}
              className={`px-3 py-1.5 rounded text-xs font-mono font-bold uppercase tracking-wider transition-colors ${
                tab === "users" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Users
            </button>
            <button
              onClick={() => setTab("matrix")}
              className={`px-3 py-1.5 rounded text-xs font-mono font-bold uppercase tracking-wider transition-colors ${
                tab === "matrix" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Roles & Permissions
            </button>
            <button
              onClick={() => setTab("activity")}
              className={`px-3 py-1.5 rounded text-xs font-mono font-bold uppercase tracking-wider transition-colors ${
                tab === "activity" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Activity
            </button>
          </div>
        </div>

        {tab === "requests" && <RequestsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "matrix" && <MatrixTab />}
        {tab === "activity" && <ActivityTab />}
      </div>
    </RequirePermission>
  );
};

// -----------------------------------------------------------------------------
// TAB 1: PENDING REQUESTS
// -----------------------------------------------------------------------------
const RequestsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [approvingUser, setApprovingUser] = useState<User | null>(null);
  const [rejectingUser, setRejectingUser] = useState<User | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const { data: requests, isLoading } = useQuery({
    queryKey: ["adminPendingRequests"],
    queryFn: () => getRequests("pending"),
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, role, note }: { id: string; role: string; note?: string }) =>
      approveRequest(id, { role, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminPendingRequests"] });
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      queryClient.invalidateQueries({ queryKey: ["pendingRequestsCount"] });
      setApprovingUser(null);
      setErrorMsg("");
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to approve request");
    },
  });

  const approveRoleMutation = useMutation({
    mutationFn: ({ id, role, note }: { id: string; role?: string; note?: string }) =>
      approveRoleRequest(id, { role, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminPendingRequests"] });
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      queryClient.invalidateQueries({ queryKey: ["pendingRequestsCount"] });
      setApprovingUser(null);
      setErrorMsg("");
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to approve role request");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      rejectRequest(id, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminPendingRequests"] });
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      queryClient.invalidateQueries({ queryKey: ["pendingRequestsCount"] });
      setRejectingUser(null);
      setErrorMsg("");
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to decline request");
    },
  });

  const rejectRoleMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      rejectRoleRequest(id, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminPendingRequests"] });
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      queryClient.invalidateQueries({ queryKey: ["pendingRequestsCount"] });
      setRejectingUser(null);
      setErrorMsg("");
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to decline role request");
    },
  });

  if (isLoading) {
    return <div className="text-center py-12 text-slate-400 font-mono">Loading pending requests...</div>;
  }

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 font-mono text-xs rounded-lg flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <GlassPanel className="p-0 overflow-hidden">
        <table className="w-full text-left text-sm font-mono">
          <thead className="bg-white/5 border-b border-white/10 text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Applicant</th>
              <th className="px-4 py-3 font-medium">Clearance / Role</th>
              <th className="px-4 py-3 font-medium">Reason / Note</th>
              <th className="px-4 py-3 font-medium">Requested At</th>
              <th className="px-4 py-3 font-medium text-right">Review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {requests?.map((req) => {
              const isRoleChange = req.type === "role_change";
              const noteText = req.note || req.role_request_note || req.request_note;
              const reqDate = req.requested_at || req.role_request_at || req.created_at;

              return (
                <tr key={`${req.type || "access"}-${req.id}`} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase inline-flex items-center gap-1 ${
                        isRoleChange
                          ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                          : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      }`}
                    >
                      {isRoleChange ? "Role Change" : "Access Request"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center border border-white/10 font-bold text-slate-300">
                        {req.display_name?.charAt(0) || req.username.charAt(0)}
                      </div>
                      <div>
                        <div className="text-white font-medium flex items-center gap-2">
                          <span>{req.username}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">{req.display_name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isRoleChange ? (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-400 capitalize">{req.current_role || "client"}</span>
                        <span className="text-slate-500">→</span>
                        <span className="text-amber-300 font-bold capitalize px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded text-[10px]">
                          {req.requested_role}
                        </span>
                      </div>
                    ) : (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase ${
                          req.requested_role === "operator"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                        }`}
                      >
                        {req.requested_role || "client"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300 max-w-xs truncate">
                    {noteText || <span className="text-slate-600 italic">No note provided</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{reqDate ? new Date(reqDate).toLocaleString() : "Recently"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setApprovingUser(req)}
                        className="px-2.5 py-1 text-xs font-mono font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded flex items-center gap-1.5 transition-colors"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => setRejectingUser(req)}
                        className="px-2.5 py-1 text-xs font-mono font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded flex items-center gap-1.5 transition-colors"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        Decline
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(!requests || requests.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500 text-xs font-mono">
                  No pending access requests. All submissions have been processed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </GlassPanel>

      {/* APPROVAL DIALOG */}
      {approvingUser && (
        <ApproveModal
          user={approvingUser}
          onClose={() => setApprovingUser(null)}
          onApprove={(role, note) => {
            if (approvingUser.type === "role_change") {
              approveRoleMutation.mutate({ id: approvingUser.id, role, note });
            } else {
              approveMutation.mutate({ id: approvingUser.id, role, note });
            }
          }}
          loading={approveMutation.isPending || approveRoleMutation.isPending}
        />
      )}

      {/* REJECTION DIALOG */}
      {rejectingUser && (
        <RejectModal
          user={rejectingUser}
          onClose={() => setRejectingUser(null)}
          onReject={(note) => {
            if (rejectingUser.type === "role_change") {
              rejectRoleMutation.mutate({ id: rejectingUser.id, note });
            } else {
              rejectMutation.mutate({ id: rejectingUser.id, note });
            }
          }}
          loading={rejectMutation.isPending || rejectRoleMutation.isPending}
        />
      )}
    </div>
  );
};

interface ApproveModalProps {
  user: User;
  onClose: () => void;
  onApprove: (role: string, note?: string) => void;
  loading: boolean;
}

const ApproveModal: React.FC<ApproveModalProps> = ({ user, onClose, onApprove, loading }) => {
  const [selectedRole, setSelectedRole] = useState<"admin" | "operator" | "client">(
    (user.requested_role as any) || "client"
  );
  const [note, setNote] = useState("");
  const [adminConfirmed, setAdminConfirmed] = useState(false);

  const canSubmit = selectedRole !== "admin" || adminConfirmed;
  const isRoleChange = user.type === "role_change";
  const applicantNote = user.note || user.role_request_note || user.request_note;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bg-dark border border-white/20 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-[fadeIn_0.2s_ease-out]">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-mono font-bold text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-400" />
              {isRoleChange ? "Approve Role Change Request" : "Approve Access Request"}
            </h3>
            <p className="text-xs font-mono text-slate-400 mt-1">
              {isRoleChange
                ? `Assign clearance level for @${user.username} (currently ${user.current_role || "client"} → requested ${user.requested_role})`
                : `Select clearance level for @${user.username}`}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {applicantNote && (
          <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg text-xs font-mono text-slate-300">
            <span className="text-slate-500 block text-[10px] uppercase">Applicant Note:</span>
            "{applicantNote}"
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block">Assigned Role</label>
          <div className="space-y-2">
            {/* CLIENT CARD */}
            <div
              onClick={() => setSelectedRole("client")}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                selectedRole === "client"
                  ? "bg-cyan-500/10 border-cyan-500/50 shadow-glow-cyan"
                  : "bg-white/[0.02] border-white/10 hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <span className="font-mono text-xs font-bold text-cyan-300 uppercase">Client</span>
                </div>
                <input
                  type="radio"
                  name="role"
                  checked={selectedRole === "client"}
                  onChange={() => setSelectedRole("client")}
                  className="text-cyan-500 focus:ring-0"
                />
              </div>
              <ul className="text-[11px] font-mono text-slate-400 space-y-0.5 mt-1 list-disc list-inside">
                <li>View dashboards, evidence, provenance, ledger, benchmarks</li>
                <li>Run assessments on existing assets, run inference, verify chains</li>
              </ul>
            </div>

            {/* OPERATOR CARD */}
            <div
              onClick={() => setSelectedRole("operator")}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                selectedRole === "operator"
                  ? "bg-amber-500/10 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                  : "bg-white/[0.02] border-white/10 hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-400" />
                  <span className="font-mono text-xs font-bold text-amber-300 uppercase">Operator</span>
                </div>
                <input
                  type="radio"
                  name="role"
                  checked={selectedRole === "operator"}
                  onChange={() => setSelectedRole("operator")}
                  className="text-amber-500 focus:ring-0"
                />
              </div>
              <ul className="text-[11px] font-mono text-slate-400 space-y-0.5 mt-1 list-disc list-inside">
                <li>All Client capabilities</li>
                <li>Ingest datasets, upload models, build baselines</li>
                <li>Train models (without approving them into trusted registry)</li>
                <li>Run benchmarks & red-team attack sets</li>
              </ul>
            </div>

            {/* ADMIN CARD */}
            <div
              onClick={() => setSelectedRole("admin")}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                selectedRole === "admin"
                  ? "bg-violet-500/10 border-violet-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                  : "bg-white/[0.02] border-white/10 hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-violet-400" />
                  <span className="font-mono text-xs font-bold text-violet-300 uppercase">Admin</span>
                </div>
                <input
                  type="radio"
                  name="role"
                  checked={selectedRole === "admin"}
                  onChange={() => setSelectedRole("admin")}
                  className="text-violet-500 focus:ring-0"
                />
              </div>
              <ul className="text-[11px] font-mono text-slate-400 space-y-0.5 mt-1 list-disc list-inside">
                <li>All Operator capabilities</li>
                <li>Approve models into the trusted registry</li>
                <li>Attack Lab write access (tamper / restore / reset)</li>
                <li>Register contributors and manage user accounts</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Warning if granting Admin */}
        {selectedRole === "admin" && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono space-y-2">
            <div className="flex items-center gap-2 font-bold text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Administrative Privileges Warning
            </div>
            <p className="text-[11px]">
              Admins can change or reset everything across the platform, including tamper states, ledger seals, and user access.
            </p>
            <label className="flex items-center gap-2 mt-2 cursor-pointer text-white text-xs">
              <input
                type="checkbox"
                checked={adminConfirmed}
                onChange={(e) => setAdminConfirmed(e.target.checked)}
                className="rounded border-white/20 text-rose-500 focus:ring-0"
              />
              <span>I confirm granting full platform administration privileges.</span>
            </label>
          </div>
        )}

        <div>
          <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-1">
            Review Note (Optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Approved for CV assurance pilot"
            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-cyan-500 outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit || loading}
            onClick={() => onApprove(selectedRole, note.trim() || undefined)}
            className="px-5 py-2 text-xs font-mono font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? "Processing..." : "Approve & Activate"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface RejectModalProps {
  user: User;
  onClose: () => void;
  onReject: (note?: string) => void;
  loading: boolean;
}

const RejectModal: React.FC<RejectModalProps> = ({ user, onClose, onReject, loading }) => {
  const [note, setNote] = useState("");

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bg-dark border border-white/20 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-[fadeIn_0.2s_ease-out]">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-mono font-bold text-white flex items-center gap-2">
              <UserX className="w-5 h-5 text-rose-400" />
              Decline Access Request
            </h3>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Decline access for <span className="text-cyan-400">@{user.username}</span>.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-1">
            Reason / Feedback (Optional, visible to applicant on sign in)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Unit verification pending. Please verify credentials with Ops lead."
            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-rose-500 outline-none resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-mono text-slate-400 hover:text-white">
            Cancel
          </button>
          <button
            disabled={loading}
            onClick={() => onReject(note.trim() || undefined)}
            className="px-5 py-2 text-xs font-mono font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? "Processing..." : "Confirm Decline"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface UserEditDrawerProps {
  user: User;
  currentAdmin: User | null;
  onClose: () => void;
  onSuccess: () => void;
  onResetPassword: (u: User) => void;
}

const UserEditDrawer: React.FC<UserEditDrawerProps> = ({
  user,
  currentAdmin,
  onClose,
  onSuccess,
  onResetPassword,
}) => {
  const isSelf = user.id === currentAdmin?.id;
  const [displayName, setDisplayName] = useState(user.display_name || "");
  const [email, setEmail] = useState(user.email || "");
  const [unit, setUnit] = useState(user.unit || "");
  const [role, setRole] = useState(user.role === "user" ? "client" : user.role);
  const [disabled, setDisabled] = useState(user.disabled);
  const [inlineError, setInlineError] = useState("");
  const [roleConfirmTarget, setRoleConfirmTarget] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateUser(user.id, data),
    onSuccess: () => {
      setInlineError("");
      onSuccess();
    },
    onError: (err: any) => {
      setInlineError(err.message || "Failed to update account");
    },
  });

  // Calculate diffs between original and modified values
  const diffs: string[] = [];
  const currentDisplayName = user.display_name || user.username;
  if (displayName.trim() && displayName.trim() !== currentDisplayName) {
    diffs.push(`Display name: "${currentDisplayName}" → "${displayName.trim()}"`);
  }
  if (email.trim() !== (user.email || "")) {
    diffs.push(`Email: "${user.email || "none"}" → "${email.trim() || "none"}"`);
  }
  if (unit.trim() !== (user.unit || "")) {
    diffs.push(`Unit: "${user.unit || "none"}" → "${unit.trim() || "none"}"`);
  }
  if (role !== (user.role === "user" ? "client" : user.role)) {
    diffs.push(`Role: ${user.role} → ${role}`);
  }
  if (disabled !== user.disabled) {
    diffs.push(`Status: ${user.disabled ? "Disabled" : "Active"} → ${disabled ? "Disabled" : "Active"}`);
  }

  const handleRoleChange = (newRole: string) => {
    if (isSelf) return;
    if (newRole !== role) {
      setRoleConfirmTarget(newRole);
    }
  };

  const handleSave = () => {
    setInlineError("");
    const payload: any = {};
    if (displayName.trim() !== currentDisplayName) {
      payload.display_name = displayName.trim();
    }
    if (email.trim() !== (user.email || "")) {
      payload.email = email.trim();
    }
    if (unit.trim() !== (user.unit || "")) {
      payload.unit = unit.trim();
    }
    if (role !== user.role) {
      payload.role = role;
    }
    if (disabled !== user.disabled) {
      payload.disabled = disabled;
    }
    updateMutation.mutate(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-md bg-bg-dark border-l border-white/10 p-6 flex flex-col justify-between shadow-2xl z-10 overflow-y-auto animate-in slide-in-from-right duration-200">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-white/10 pb-4">
            <div>
              <h3 className="text-base font-mono font-bold text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-cyan-400" />
                Edit Account
              </h3>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                Update account settings, attributes, and clearance
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Inline Error */}
          {inlineError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 font-mono text-xs rounded-lg flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{inlineError}</span>
              </div>
              <button onClick={() => setInlineError("")} className="text-rose-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-4">
            {/* Read-only Username */}
            <div>
              <label className="text-[11px] font-mono text-slate-400 block mb-1">
                Username (Recorded in Provenance & Ledger)
              </label>
              <div
                className="flex items-center justify-between px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-slate-400 font-mono text-xs cursor-not-allowed"
                title="Username is the immutable identity recorded in provenance and the audit ledger"
              >
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="text-slate-300 font-semibold">{user.username}</span>
                </div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Immutable</span>
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="text-[11px] font-mono text-slate-400 block mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={64}
                placeholder="e.g. John Mathew"
                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-cyan-500 outline-none"
              />
            </div>

            {/* Unit / Organisation */}
            <div>
              <label className="text-[11px] font-mono text-slate-400 block mb-1">Unit / Organisation</label>
              <div className="relative">
                <Building className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  maxLength={64}
                  placeholder="e.g. Air Force Research Lab"
                  className="w-full bg-black/50 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-white font-mono text-xs focus:border-cyan-500 outline-none"
                />
              </div>
            </div>

            {/* Contact Email */}
            <div>
              <label className="text-[11px] font-mono text-slate-400 block mb-1">Contact Email</label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@organisation.gov"
                  className="w-full bg-black/50 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-white font-mono text-xs focus:border-cyan-500 outline-none"
                />
              </div>
            </div>

            {/* Clearance / Role Dropdown */}
            <div>
              <label className="text-[11px] font-mono text-slate-400 block mb-1">Clearance / Role</label>
              <select
                value={role}
                onChange={(e) => handleRoleChange(e.target.value)}
                disabled={isSelf}
                title={isSelf ? "Ask another administrator" : "Change user role"}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-cyan-500 outline-none disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="admin">Admin</option>
                <option value="operator">Operator</option>
                <option value="client">Client</option>
              </select>
              {isSelf && (
                <span className="text-[10px] text-amber-400 font-mono mt-1 block">
                  Ask another administrator to change your own role.
                </span>
              )}
            </div>

            {/* Status Enable / Disable Toggle */}
            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-slate-200 block">Account Status</span>
                <span className="text-[10px] font-mono text-slate-500">
                  {disabled ? "Account is disabled" : "Account is active"}
                </span>
              </div>
              <button
                type="button"
                disabled={isSelf && !disabled}
                onClick={() => setDisabled(!disabled)}
                title={isSelf ? "Cannot disable own account" : disabled ? "Enable account" : "Disable account"}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  disabled
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                }`}
              >
                {disabled ? "Disabled" : "Active"}
              </button>
            </div>

            {/* Reset Password Button */}
            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-slate-200 block">Password Reset</span>
                <span className="text-[10px] font-mono text-slate-500">Terminates active sessions</span>
              </div>
              <button
                type="button"
                onClick={() => onResetPassword(user)}
                className="px-3 py-1.5 text-xs font-mono font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Key className="w-3.5 h-3.5" />
                Reset Password
              </button>
            </div>
          </div>

          {/* Diffs Summary */}
          {diffs.length > 0 && (
            <div className="p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-lg space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 block">
                Pending Changes to Commit:
              </span>
              {diffs.map((d, i) => (
                <div key={i} className="text-xs font-mono text-slate-300">
                  • {d}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-6 border-t border-white/10 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={diffs.length === 0 || updateMutation.isPending}
            onClick={handleSave}
            className="px-5 py-2 text-xs font-mono font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {updateMutation.isPending ? "Saving Changes..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Role Change Confirmation Modal inside Drawer */}
      {roleConfirmTarget && (
        <RoleChangeConfirmModal
          target={{ user: { ...user, role }, newRole: roleConfirmTarget }}
          onClose={() => setRoleConfirmTarget(null)}
          onConfirm={() => {
            setRole(roleConfirmTarget as any);
            setRoleConfirmTarget(null);
          }}
          loading={false}
        />
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// TAB 2: USERS TAB
// -----------------------------------------------------------------------------
const UsersTab: React.FC = () => {
  const queryClient = useQueryClient();
  const { user: currentAdmin } = useAuth();
  const [errorMsg, setErrorMsg] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ user: User; newRole: string } | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: getUsers,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      setRoleChangeTarget(null);
      setErrorMsg("");
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to update user");
    },
  });

  const resetPwdMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => resetUserPassword(id, data),
    onSuccess: () => {
      setErrorMsg("");
      alert("Password reset successfully. The user's active sessions were terminated.");
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to reset password");
    },
  });

  const handleRoleSelect = (u: User, newRole: string) => {
    if (u.id === currentAdmin?.id) {
      setErrorMsg("An administrator cannot change their own role. Ask another administrator.");
      return;
    }
    if (newRole !== u.role) {
      setRoleChangeTarget({ user: u, newRole });
    }
  };

  const handleToggleStatus = (u: User) => {
    if (u.id === currentAdmin?.id && !u.disabled) {
      setErrorMsg("You cannot disable your own account.");
      return;
    }
    updateMutation.mutate({ id: u.id, data: { disabled: !u.disabled } });
  };

  const handleResetPassword = (u: User) => {
    const newPwd = prompt(`Enter new password for ${u.username} (min 10 chars, letters & digits):`);
    if (newPwd) {
      resetPwdMutation.mutate({ id: u.id, data: { new_password: newPwd } });
    }
  };

  if (isLoading) return <div className="text-center py-12 text-slate-400 font-mono">Loading users...</div>;

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 font-mono text-xs rounded-lg flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg("")} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <GlassPanel className="p-0 overflow-hidden">
        <table className="w-full text-left text-sm font-mono">
          <thead className="bg-white/5 border-b border-white/10 text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Reviewed By / At</th>
              <th className="px-4 py-3 font-medium">Last Login</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users?.map((u) => {
              const isSelf = u.id === currentAdmin?.id;
              const roleDisplay = u.role === "user" ? "client" : u.role;

              return (
                <tr key={u.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center border border-white/10 font-bold text-slate-300">
                        {u.display_name?.charAt(0) || u.username.charAt(0)}
                      </div>
                      <div>
                        <div className="text-white font-medium flex items-center gap-2">
                          <span>{u.username}</span>
                          {isSelf && (
                            <span className="text-[10px] bg-white/10 text-slate-300 px-1.5 py-0.2 rounded font-normal">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">{u.display_name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase ${
                          roleDisplay === "admin"
                            ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                            : roleDisplay === "operator"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                        }`}
                      >
                        {roleDisplay}
                      </span>

                      {/* Dropdown for role change */}
                      <select
                        value={roleDisplay}
                        onChange={(e) => handleRoleSelect(u, e.target.value)}
                        disabled={isSelf}
                        title={isSelf ? "Ask another administrator" : "Change user role"}
                        className="bg-black/60 border border-white/10 text-slate-300 text-xs rounded px-2 py-0.5 font-mono outline-none disabled:opacity-40 disabled:cursor-not-allowed hover:border-white/30"
                      >
                        <option value="admin">Admin</option>
                        <option value="operator">Operator</option>
                        <option value="client">Client</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.disabled ? (
                      <span className="inline-flex items-center gap-1.5 text-rose-400 text-xs">
                        <Ban className="w-3.5 h-3.5" /> Disabled
                      </span>
                    ) : u.status === "rejected" ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-400 text-xs">
                        <X className="w-3.5 h-3.5" /> Rejected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {u.reviewed_by ? (
                      <div>
                        <span className="text-slate-300">@{u.reviewed_by}</span>
                        {u.reviewed_at && (
                          <div className="text-[10px] text-slate-500">
                            {new Date(u.reviewed_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ) : u.created_by === "setup" ? (
                      <span className="text-violet-400 text-[11px]">Primary Setup</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleString()
                      : u.last_login
                      ? new Date(u.last_login).toLocaleString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingUser(u)}
                        className="px-2.5 py-1 text-xs font-mono font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 rounded flex items-center gap-1.5 transition-colors"
                        title="Edit account details, roles, and status"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleStatus(u)}
                        disabled={isSelf && !u.disabled}
                        className="p-1.5 text-slate-400 hover:text-rose-400 bg-black/40 hover:bg-white/10 rounded border border-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title={isSelf ? "Cannot disable own account" : u.disabled ? "Enable Account" : "Disable Account"}
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleResetPassword(u)}
                        className="p-1.5 text-slate-400 hover:text-amber-400 bg-black/40 hover:bg-white/10 rounded border border-white/5 transition-colors"
                        title="Reset Password"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </GlassPanel>

      {/* USER EDIT DRAWER */}
      {editingUser && (
        <UserEditDrawer
          user={editingUser}
          currentAdmin={currentAdmin}
          onClose={() => setEditingUser(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
            setEditingUser(null);
          }}
          onResetPassword={handleResetPassword}
        />
      )}

      {/* ROLE CHANGE CONFIRMATION MODAL */}
      {roleChangeTarget && (
        <RoleChangeConfirmModal
          target={roleChangeTarget}
          onClose={() => setRoleChangeTarget(null)}
          onConfirm={() => updateMutation.mutate({ id: roleChangeTarget.user.id, data: { role: roleChangeTarget.newRole } })}
          loading={updateMutation.isPending}
        />
      )}
    </div>
  );
};

interface RoleChangeConfirmModalProps {
  target: { user: User; newRole: string };
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

const RoleChangeConfirmModal: React.FC<RoleChangeConfirmModalProps> = ({ target, onClose, onConfirm, loading }) => {
  const { user, newRole } = target;
  const currentRole = user.role === "user" ? "client" : user.role;

  // Summarize what the user gains or loses
  const getImpactSummary = () => {
    if (currentRole === "client" && newRole === "operator") {
      return {
        gains: ["Ingest datasets", "Upload models", "Build baselines", "Train models", "Run benchmarks"],
        loses: [],
      };
    }
    if (currentRole === "client" && newRole === "admin") {
      return {
        gains: [
          "Ingest datasets & upload models",
          "Train and approve models into trusted registry",
          "Full Attack Lab write access (tamper/restore/reset)",
          "Access Management & user administration",
        ],
        loses: [],
      };
    }
    if (currentRole === "operator" && newRole === "admin") {
      return {
        gains: [
          "Approve models into the trusted registry",
          "Attack Lab scenarios & tampering/reset operations",
          "Register contributors",
          "Access Management & user administration",
        ],
        loses: [],
      };
    }
    if (currentRole === "admin" && newRole === "operator") {
      return {
        gains: [],
        loses: [
          "Approve models into trusted registry",
          "Attack Lab tampering, reset & restore operations",
          "Access Management & user administration",
        ],
      };
    }
    if (currentRole === "admin" && newRole === "client") {
      return {
        gains: [],
        loses: [
          "Ingest datasets, upload models, build baselines",
          "Train models",
          "Approve models into trusted registry",
          "Attack Lab writes",
          "Access Management & user administration",
        ],
      };
    }
    if (currentRole === "operator" && newRole === "client") {
      return {
        gains: [],
        loses: ["Ingest datasets", "Upload models", "Build baselines", "Train models", "Run benchmarks"],
      };
    }
    return { gains: [], loses: [] };
  };

  const impact = getImpactSummary();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bg-dark border border-white/20 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-[fadeIn_0.2s_ease-out]">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-mono font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-violet-400" />
              Confirm Role Reassignment
            </h3>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Modifying clearance for <span className="text-cyan-400">@{user.username}</span>.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-white/[0.02] border border-white/10 rounded-xl flex items-center justify-between text-xs font-mono">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Current Role</span>
            <span className="font-bold uppercase text-slate-200">{currentRole}</span>
          </div>
          <span className="text-slate-500">➔</span>
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">New Role</span>
            <span className="font-bold uppercase text-cyan-300">{newRole}</span>
          </div>
        </div>

        {impact.gains.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block font-bold">
              Capabilities Gained:
            </span>
            <ul className="text-xs font-mono text-emerald-300 space-y-0.5 list-disc list-inside">
              {impact.gains.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}

        {impact.loses.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-rose-400 uppercase tracking-wider block font-bold">
              Capabilities Revoked:
            </span>
            <ul className="text-xs font-mono text-rose-300 space-y-0.5 list-disc list-inside">
              {impact.loses.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3">
          <button onClick={onClose} className="px-4 py-2 text-xs font-mono text-slate-400 hover:text-white">
            Cancel
          </button>
          <button
            disabled={loading}
            onClick={onConfirm}
            className="px-5 py-2 text-xs font-mono font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg disabled:opacity-50"
          >
            {loading ? "Updating..." : "Confirm Role Change"}
          </button>
        </div>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// TAB 3: ROLES & PERMISSIONS MATRIX TAB
// -----------------------------------------------------------------------------
const MatrixTab: React.FC = () => {
  const capabilities = [
    {
      name: "View dashboards, evidence, provenance, ledger, benchmarks",
      admin: true,
      operator: true,
      client: true,
    },
    {
      name: "Run assessments on existing assets, run inference, verify chains, independent verification",
      admin: true,
      operator: true,
      client: true,
    },
    {
      name: "Ingest datasets, upload models, build baselines",
      admin: true,
      operator: true,
      client: false,
    },
    {
      name: "Train models (without approving them)",
      admin: true,
      operator: true,
      client: false,
    },
    {
      name: "Run benchmarks, import benchmark data, generate red-team attack sets",
      admin: true,
      operator: true,
      client: false,
    },
    {
      name: "Approve models into the trusted registry",
      admin: true,
      operator: false,
      client: false,
    },
    {
      name: "Attack Lab scenarios, tamper / restore / reset",
      admin: true,
      operator: false,
      client: false,
    },
    {
      name: "Register contributors",
      admin: true,
      operator: false,
      client: false,
    },
    {
      name: "Access Management (approve requests, assign roles, disable, reset passwords)",
      admin: true,
      operator: false,
      client: false,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl flex items-start gap-3">
        <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-xs font-mono text-slate-300 leading-relaxed">
          <strong className="block text-white font-bold mb-1">Three-Role Security Architecture</strong>
          Roles follow a strict hierarchy: <span className="text-violet-400 font-bold">Admin</span> ⊇{" "}
          <span className="text-amber-400 font-bold">Operator</span> ⊇{" "}
          <span className="text-cyan-400 font-bold">Client</span>. Operators prepare and test assets, while only administrators may approve models into the trusted registry or manipulate security states.
        </div>
      </div>

      <GlassPanel className="p-0 overflow-hidden">
        <table className="w-full text-left text-sm font-mono">
          <thead className="bg-white/5 border-b border-white/10 text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 font-medium">Capability</th>
              <th className="px-4 py-3 font-medium text-center w-28 text-violet-400">Admin</th>
              <th className="px-4 py-3 font-medium text-center w-28 text-amber-400">Operator</th>
              <th className="px-4 py-3 font-medium text-center w-28 text-cyan-400">Client</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {capabilities.map((c, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-xs text-slate-200">{c.name}</td>
                <td className="px-4 py-3 text-center">
                  {c.admin ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-500/10 text-rose-400">
                      <X className="w-3.5 h-3.5" />
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {c.operator ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-500/10 text-rose-400">
                      <X className="w-3.5 h-3.5" />
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {c.client ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-500/10 text-rose-400">
                      <X className="w-3.5 h-3.5" />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  );
};

// -----------------------------------------------------------------------------
// TAB 4: ACTIVITY TAB
// -----------------------------------------------------------------------------
const ActivityTab: React.FC = () => {
  const { data: auditResponse, isLoading } = useQuery({
    queryKey: ["adminActivity"],
    queryFn: () => getAuditBlocks(0, 500),
  });

  const relevantEvents = [
    "ACCESS_REQUESTED",
    "ACCESS_APPROVED",
    "ACCESS_REJECTED",
    "USER_CREATED",
    "USER_UPDATED",
    "PASSWORD_RESET",
    "PASSWORD_CHANGED",
    "ACCOUNT_LOCKED",
  ];

  const activities = auditResponse?.items?.filter((b) => relevantEvents.includes(b.event_type)) || [];

  if (isLoading) return <div className="text-center py-12 text-slate-400 font-mono">Loading activity...</div>;

  return (
    <div className="space-y-3">
      {activities.map((block) => {
        const isReject = block.event_type === "ACCESS_REJECTED" || block.event_type === "ACCOUNT_LOCKED";
        const isApprove = block.event_type === "ACCESS_APPROVED";
        const isRequest = block.event_type === "ACCESS_REQUESTED";

        const badgeColor = isReject
          ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
          : isApprove
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          : isRequest
          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
          : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";

        return (
          <GlassPanel key={block.index} className="p-4 border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-lg border ${badgeColor}`}>
                <ActivityIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-mono text-sm text-slate-200">
                  <span className="font-bold text-white">{block.event_type}</span>:{" "}
                  <span className="text-slate-300">
                    {block.payload?.username
                      ? `@${String(block.payload.username)}`
                      : block.subject}
                  </span>
                  {Boolean(block.payload?.role) && (
                    <span className="ml-2 text-xs text-slate-400">
                      [role: <strong className="text-white">{String(block.payload?.role)}</strong>]
                    </span>
                  )}
                  {Boolean(block.payload?.note) && (
                    <span className="ml-2 text-xs text-slate-400 italic">
                      ("{String(block.payload?.note)}")
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-slate-500 flex items-center gap-2 mt-1">
                  <span>{new Date(block.timestamp).toLocaleString()}</span>
                  {(block.payload?.reviewer || block.payload?.actor) && (
                    <>
                      <span>·</span>
                      <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-cyan-300">
                        actor: @{String(block.payload.reviewer || block.payload.actor)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="text-xs font-mono text-slate-600 bg-black/40 px-2 py-1 rounded">
              Block #{block.index}
            </div>
          </GlassPanel>
        );
      })}
      {activities.length === 0 && (
        <div className="text-center py-12 text-slate-500 font-mono text-sm">
          No security or access administration events recorded in the ledger.
        </div>
      )}
    </div>
  );
};
