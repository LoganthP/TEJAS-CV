import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldAlert, UserPlus, Eye, EyeOff, Check, X, Shield, Terminal, Cpu } from "lucide-react";
import { signup, getAuthStatus, logout as apiLogout } from "../api/endpoints";
import { useAuth } from "../hooks/useAuth";
import { clearAuthToken } from "../api/client";

export const SignupPage: React.FC = () => {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [requestedRole, setRequestedRole] = useState<"client" | "operator">("client");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  
  const navigate = useNavigate();
  const { user } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    getAuthStatus().then(res => {
      if (res.setup_required) {
        setIsSetup(true);
      }
    }).catch(console.error);
  }, []);

  // Password rules validation
  const hasLength = password.length >= 10;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const notContainsUsername = username.length > 0 ? !password.toLowerCase().includes(username.toLowerCase()) : true;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  
  const isValid = hasLength && hasLetter && hasDigit && notContainsUsername && passwordsMatch && username.length >= 3 && username.length <= 32;

  // Username validation
  const usernameValid = /^[a-zA-Z0-9._-]+$/.test(username) || username === "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !usernameValid) return;
    
    setLoading(true);
    setError("");
    
    try {
      const res = await signup({
        username: username.trim(),
        password,
        display_name: displayName.trim(),
        requested_role: isSetup ? undefined : requestedRole,
        note: note.trim() || undefined,
      });

      // Clear any auth state and ensure no session exists
      clearAuthToken();
      try {
        await apiLogout();
      } catch {
        // Ignore logout errors
      }

      // Navigate to login with requested username and setup flag
      const setupParam = (isSetup || res?.setup_admin) ? "&setup=true" : "";
      navigate(`/login?requested=${encodeURIComponent(username.trim())}${setupParam}`, { replace: true });
    } catch (err: any) {
      setError(err.message || "Failed to submit access request");
    } finally {
      setLoading(false);
    }
  };

  const getStrengthProgress = () => {
    let score = 0;
    if (hasLength) score++;
    if (hasLetter && hasDigit) score++;
    if (notContainsUsername && password.length > 0) score++;
    if (passwordsMatch) score++;
    return (score / 4) * 100;
  };

  return (
    <div className="min-h-screen w-full bg-bg-dark text-slate-100 bg-grid-pattern overflow-y-auto py-6 sm:py-10 px-4 flex flex-col items-center justify-start">
      {/* Top Brand Bar */}
      <div className="w-full max-w-lg flex items-center justify-between mb-4 px-1">
        <Link to="/welcome" className="flex items-center gap-3 group focus:outline-none" title="Back to Platform Overview">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-glow-cyan group-hover:scale-105 transition-transform">
            <ShieldAlert className="w-4 h-4 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-mono font-bold text-lg text-white tracking-wider leading-none group-hover:text-cyan-300 transition-colors">TEJAS-CV</span>
            <span className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">Assurance Core</span>
          </div>
        </Link>
        <div className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-mono font-bold tracking-widest uppercase flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          AIR-GAPPED
        </div>
      </div>
      
      {/* Main Request Access Card */}
      <div className="w-full max-w-lg p-5 sm:p-7 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl relative overflow-hidden mb-12">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />
        
        {isSetup && (
          <div className="mb-4 bg-violet-500/10 border border-violet-500/30 rounded-lg p-3 flex items-start gap-3">
            <Shield className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
            <div className="text-sm font-mono text-violet-200">
              <strong className="block text-violet-300 mb-1 uppercase tracking-wider text-xs">First-time setup</strong>
              This account becomes the administrator.
            </div>
          </div>
        )}

        <div className="text-center mb-5">
          <h2 className="text-xl sm:text-2xl font-mono font-bold text-white mb-1">Request Access</h2>
          <p className="text-slate-400 text-xs font-mono">
            {isSetup ? "Create the primary administrator account." : "Submit an access request for administrator approval."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1 uppercase tracking-wider">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3.5 py-2 text-white font-mono text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors outline-none"
              placeholder="analyst.name"
              required
              disabled={loading}
              maxLength={32}
              minLength={3}
            />
            {!usernameValid && <p className="text-[10px] font-mono text-rose-400 mt-1">Only letters, numbers, dot, underscore, dash.</p>}
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1 uppercase tracking-wider">Display Name (Optional)</label>
            <input 
              type="text" 
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3.5 py-2 text-white font-mono text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors outline-none"
              placeholder="Jane Doe"
              disabled={loading}
            />
          </div>

          {/* Requested Role cards - hidden in setup mode */}
          {!isSetup && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider">Requested Role</label>
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider">
                  Selected: <strong className="text-white">{requestedRole}</strong>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setRequestedRole("client")}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer relative ${
                    requestedRole === "client"
                      ? "bg-cyan-500/10 border-cyan-500/60 shadow-glow-cyan ring-1 ring-cyan-500/40"
                      : "bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Terminal className={`w-4 h-4 ${requestedRole === "client" ? "text-cyan-400" : "text-slate-400"}`} />
                      <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">Client</span>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${requestedRole === "client" ? "bg-cyan-400 shadow-glow-cyan" : "bg-white/10"}`} />
                  </div>
                  <p className="text-[11px] font-mono text-slate-400 leading-snug">
                    View results, run assessments and inference.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRequestedRole("operator")}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer relative ${
                    requestedRole === "operator"
                      ? "bg-amber-500/10 border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.2)] ring-1 ring-amber-500/40"
                      : "bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Cpu className={`w-4 h-4 ${requestedRole === "operator" ? "text-amber-400" : "text-slate-400"}`} />
                      <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">Operator</span>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${requestedRole === "operator" ? "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]" : "bg-white/10"}`} />
                  </div>
                  <p className="text-[11px] font-mono text-slate-400 leading-snug">
                    Also ingest data, upload and train models, build baselines.
                  </p>
                </button>
              </div>
              <p className="text-[10px] font-mono text-slate-500 mt-1.5 italic">
                An administrator reviews every request and assigns the final role.
              </p>
            </div>
          )}

          {!isSetup && (
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1 uppercase tracking-wider">Reason / Unit (Optional)</label>
              <input 
                type="text" 
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-3.5 py-2 text-white font-mono text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors outline-none"
                placeholder="e.g. Model Verification Team Alpha"
                disabled={loading}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1 uppercase tracking-wider">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors outline-none pr-9"
                  placeholder="••••••••••••"
                  required
                  disabled={loading}
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1 uppercase tracking-wider">Confirm Password</label>
              <div className="relative">
                <input 
                  type={showConfirmPassword ? "text" : "password"} 
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors outline-none pr-9"
                  placeholder="••••••••••••"
                  required
                  disabled={loading}
                />
                <button 
                  type="button" 
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Password strength and requirements */}
          <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2.5">
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mb-2">
              <div 
                className={`h-full transition-all duration-300 ${
                  getStrengthProgress() === 100 ? "bg-emerald-500" : getStrengthProgress() > 50 ? "bg-amber-500" : "bg-rose-500"
                }`} 
                style={{ width: `${getStrengthProgress()}%` }} 
              />
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] font-mono">
              <span className={`flex items-center gap-1.5 ${hasLength ? "text-emerald-400 font-semibold" : "text-slate-500"}`}>
                {hasLength ? <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <X className="w-3.5 h-3.5 shrink-0 text-slate-600" />} 10+ characters
              </span>
              <span className={`flex items-center gap-1.5 ${(hasLetter && hasDigit) ? "text-emerald-400 font-semibold" : "text-slate-500"}`}>
                {(hasLetter && hasDigit) ? <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <X className="w-3.5 h-3.5 shrink-0 text-slate-600" />} Letters & digits
              </span>
              <span className={`flex items-center gap-1.5 ${notContainsUsername ? "text-emerald-400 font-semibold" : "text-slate-500"}`}>
                {notContainsUsername ? <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <X className="w-3.5 h-3.5 shrink-0 text-slate-600" />} No username in pw
              </span>
              <span className={`flex items-center gap-1.5 ${passwordsMatch ? "text-emerald-400 font-semibold" : "text-slate-500"}`}>
                {passwordsMatch ? <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <X className="w-3.5 h-3.5 shrink-0 text-slate-600" />} Passwords match
              </span>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg border bg-rose-500/10 border-rose-500/30 text-rose-400 text-xs font-mono flex items-start gap-2 animate-[shake_0.5s_ease-in-out]">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!isValid || !usernameValid || loading}
            className="w-full mt-4 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg px-4 py-2.5 text-xs font-mono font-bold tracking-widest uppercase transition-all shadow-glass-edge hover:shadow-glow-cyan disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                {isSetup ? "Create Administrator Account" : "Submit Access Request"}
              </>
            )}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-center">
          <Link to="/welcome" className="text-xs font-mono text-slate-400 hover:text-cyan-400 transition-colors flex items-center gap-1.5">
            <span>&larr;</span> Back to Platform Overview
          </Link>
          <Link to="/login" className="text-xs font-mono text-slate-400 hover:text-cyan-400 transition-colors">
            Already approved? <span className="text-cyan-400 underline decoration-cyan-500/40 underline-offset-2">Sign in</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
