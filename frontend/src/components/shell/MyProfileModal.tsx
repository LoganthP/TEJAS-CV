import React, { useState } from "react";
import {
  User as UserIcon,
  X,
  Shield,
  Key,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  Trash2,
  Lock,
  Building,
  Mail,
  UserCheck,
  Check,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import {
  editProfile,
  changePassword,
  requestRoleChange,
  cancelRoleChange,
} from "../../api/endpoints";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface MyProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_CAPABILITIES: Record<string, string[]> = {
  client: [
    "View dashboards, evidence, provenance, audit ledger, and benchmarks",
    "Run verification checks and assessments on existing data & models",
    "Perform single-image inference and inspect signed cryptographic receipts",
  ],
  operator: [
    "All Client capabilities",
    "Ingest raw datasets (classification, YOLO, COCO)",
    "Upload custom neural network models & build reference baselines",
    "Train models with live progress tracking & run red-team benchmarks",
  ],
  admin: [
    "All Operator capabilities",
    "Approve models into the immutable Trusted Model Registry",
    "Attack Lab write permissions (tamper simulation, restore ledger)",
    "Access management: approve accounts, change roles, inspect ledger",
  ],
};

export const MyProfileModal: React.FC<MyProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, refetchAuth } = useAuth();
  const queryClient = useQueryClient();

  // Profile Form State
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [unit, setUnit] = useState(user?.unit || "");
  const [profileMsg, setProfileMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // Password Form State
  const [currPassword, setCurrPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // Role Request Dialog State
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [targetRole, setTargetRole] = useState<"admin" | "operator" | "client">(
    user?.role === "client" ? "operator" : user?.role === "operator" ? "admin" : "client"
  );
  const [roleNote, setRoleNote] = useState("");
  const [roleMsg, setRoleMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // Live password validation checklist
  const lenOk = newPassword.length >= 10;
  const charsOk = /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword);
  const userOk = !user?.username || !newPassword.toLowerCase().includes(user.username.toLowerCase());
  const matchOk = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmitPassword = lenOk && charsOk && userOk && matchOk && currPassword.length > 0;

  // Profile update mutation
  const profileMutation = useMutation({
    mutationFn: () =>
      editProfile({
        display_name: displayName.trim() || undefined,
        email: email.trim(),
        unit: unit.trim(),
      }),
    onSuccess: async () => {
      setProfileMsg({ text: "Profile details updated successfully.", isError: false });
      await refetchAuth();
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
    },
    onError: (err: any) => {
      setProfileMsg({ text: err.message || "Failed to update profile", isError: true });
    },
  });

  // Password update mutation
  const passwordMutation = useMutation({
    mutationFn: () =>
      changePassword({
        current_password: currPassword,
        new_password: newPassword,
      }),
    onSuccess: () => {
      setPasswordMsg({ text: "Password changed successfully. Please note it for your next login.", isError: false });
      setCurrPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: any) => {
      setPasswordMsg({ text: err.message || "Failed to change password", isError: true });
    },
  });

  // Role request mutation
  const roleReqMutation = useMutation({
    mutationFn: () => requestRoleChange({ role: targetRole, note: roleNote.trim() || undefined }),
    onSuccess: async () => {
      setRoleMsg({ text: `Requested ${targetRole} clearance. An administrator will review your request.`, isError: false });
      setRoleDialogOpen(false);
      setRoleNote("");
      await refetchAuth();
    },
    onError: (err: any) => {
      setRoleMsg({ text: err.message || "Failed to submit role change request", isError: true });
    },
  });

  // Role request cancel mutation
  const roleCancelMutation = useMutation({
    mutationFn: () => cancelRoleChange(),
    onSuccess: async () => {
      setRoleMsg({ text: "Role request withdrawn.", isError: false });
      await refetchAuth();
    },
    onError: (err: any) => {
      setRoleMsg({ text: err.message || "Failed to withdraw role request", isError: true });
    },
  });

  if (!isOpen || !user) return null;

  const currentRole = user.role === "user" ? "client" : user.role;
  const capabilities = ROLE_CAPABILITIES[currentRole] || ROLE_CAPABILITIES.client;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-bg-dark border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-white/10 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-mono font-bold text-white flex items-center gap-2">
                My Profile
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-cyan-300 font-normal">
                  @{user.username}
                </span>
              </h2>
              <p className="text-xs font-mono text-slate-400">
                Account identity, credentials, and clearance management
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* SECTION 1: PROFILE DETAILS */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-cyan-400" />
                Personal & Unit Identification
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
                <Lock className="w-3 h-3 text-slate-600" />
                Username immutable
              </div>
            </div>

            {profileMsg && (
              <div
                className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 ${
                  profileMsg.isError
                    ? "bg-rose-500/10 border border-rose-500/30 text-rose-300"
                    : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                }`}
              >
                {profileMsg.isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                <span>{profileMsg.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Cmdr. Rajesh Verma"
                  maxLength={64}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Contact Email
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@organisation.gov"
                    className="w-full bg-black/50 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-white font-mono text-xs focus:border-cyan-500 outline-none"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Unit / Organisation
                </label>
                <div className="relative">
                  <Building className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="e.g. CV Assurance Flight, IAF"
                    maxLength={64}
                    className="w-full bg-black/50 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-white font-mono text-xs focus:border-cyan-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                disabled={profileMutation.isPending}
                onClick={() => profileMutation.mutate()}
                className="px-4 py-1.5 text-xs font-mono font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {profileMutation.isPending ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </div>

          {/* SECTION 2: ROLE & CAPABILITIES */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Shield className="w-4 h-4 text-violet-400" />
                Clearance & Role
              </h3>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider ${
                  currentRole === "admin"
                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                    : currentRole === "operator"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                }`}
              >
                {currentRole}
              </span>
            </div>

            {roleMsg && (
              <div
                className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 ${
                  roleMsg.isError
                    ? "bg-rose-500/10 border border-rose-500/30 text-rose-300"
                    : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                }`}
              >
                {roleMsg.isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                <span>{roleMsg.text}</span>
              </div>
            )}

            {/* Current Role Capabilities */}
            <div>
              <span className="text-[11px] font-mono text-slate-400 block mb-2">
                Assigned Capabilities:
              </span>
              <ul className="space-y-1.5">
                {capabilities.map((cap, i) => (
                  <li key={i} className="text-xs font-mono text-slate-300 flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Pending Role Request status or Button */}
            <div className="pt-2 border-t border-white/5">
              {user.role_request ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-mono font-bold text-amber-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Pending Request: {user.role_request.toUpperCase()}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      Requested on{" "}
                      {user.role_request_at
                        ? new Date(user.role_request_at).toLocaleDateString()
                        : "recently"}
                      {user.role_request_note && ` — "${user.role_request_note}"`}
                    </div>
                  </div>
                  <button
                    disabled={roleCancelMutation.isPending}
                    onClick={() => roleCancelMutation.mutate()}
                    className="px-3 py-1.5 text-xs font-mono text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Withdraw
                  </button>
                </div>
              ) : currentRole !== "admin" ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">
                    Need higher privileges for ingestion or model approval?
                  </span>
                  <button
                    onClick={() => setRoleDialogOpen(true)}
                    className="px-3 py-1.5 text-xs font-mono font-bold text-white bg-white/10 hover:bg-white/15 border border-white/15 rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5 text-cyan-400" />
                    Request Role Change
                  </button>
                </div>
              ) : (
                <span className="text-xs font-mono text-slate-500 italic">
                  You hold the highest clearance level (Administrator).
                </span>
              )}
            </div>
          </div>

          {/* SECTION 3: CHANGE PASSWORD */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              Change Password
            </h3>

            {passwordMsg && (
              <div
                className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 ${
                  passwordMsg.isError
                    ? "bg-rose-500/10 border border-rose-500/30 text-rose-300"
                    : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                }`}
              >
                {passwordMsg.isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                <span>{passwordMsg.text}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currPassword}
                  onChange={(e) => setCurrPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-amber-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 10 chars, letters & digits"
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              {/* Live rule checklist */}
              <div className="p-3 bg-black/30 border border-white/5 rounded-lg space-y-1.5 text-xs font-mono">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                  Password Requirements:
                </span>
                <div className={`flex items-center gap-2 ${lenOk ? "text-emerald-400" : "text-slate-500"}`}>
                  <Check className="w-3.5 h-3.5" />
                  <span>At least 10 characters</span>
                </div>
                <div className={`flex items-center gap-2 ${charsOk ? "text-emerald-400" : "text-slate-500"}`}>
                  <Check className="w-3.5 h-3.5" />
                  <span>Contains both letters and digits</span>
                </div>
                <div className={`flex items-center gap-2 ${userOk ? "text-emerald-400" : "text-slate-500"}`}>
                  <Check className="w-3.5 h-3.5" />
                  <span>Does not contain username</span>
                </div>
                <div className={`flex items-center gap-2 ${matchOk ? "text-emerald-400" : "text-slate-500"}`}>
                  <Check className="w-3.5 h-3.5" />
                  <span>Passwords match</span>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  disabled={!canSubmitPassword || passwordMutation.isPending}
                  onClick={() => passwordMutation.mutate()}
                  className="px-4 py-1.5 text-xs font-mono font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {passwordMutation.isPending ? "Updating..." : "Update Password"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ROLE CHANGE REQUEST DIALOG */}
      {roleDialogOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-bg-dark border border-white/20 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-mono font-bold text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-cyan-400" />
                  Request Clearance Elevation
                </h3>
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  Select desired role and provide operational justification.
                </p>
              </div>
              <button
                onClick={() => setRoleDialogOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-1.5">
                Requested Role
              </label>
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as any)}
                className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-cyan-500 outline-none"
              >
                {currentRole !== "operator" && <option value="operator">Operator (Data Ingestion & Training)</option>}
                <option value="admin">Administrator (Full Platform Control)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-1.5">
                Justification / Note (Optional)
              </label>
              <textarea
                value={roleNote}
                onChange={(e) => setRoleNote(e.target.value)}
                rows={3}
                placeholder="e.g. Assigned to dataset curation for project Garuda."
                className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-cyan-500 outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setRoleDialogOpen(false)}
                className="px-4 py-2 text-xs font-mono text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                disabled={roleReqMutation.isPending}
                onClick={() => roleReqMutation.mutate()}
                className="px-4 py-2 text-xs font-mono font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {roleReqMutation.isPending ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
