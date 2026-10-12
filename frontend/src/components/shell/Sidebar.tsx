import React from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Activity,
  Flame,
  FileSearch,
  GitBranch,
  Layers,
  Database,
  Binary,
  Settings,
  ChevronLeft,
  ChevronRight,
  BarChart2,
  Lock,
  Workflow,
  Users,
  Sparkles
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { getRequests } from "../../api/endpoints";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeJobId?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggle,
  activeJobId,
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: pendingRequests } = useQuery({
    queryKey: ["pendingRequestsCount"],
    queryFn: () => getRequests("pending"),
    enabled: isAdmin,
    refetchInterval: 15000,
  });
  const pendingCount = pendingRequests?.length || 0;

  const allNavItems = [
    {
      to: "/",
      label: "Dashboard",
      icon: LayoutDashboard,
      badge: null,
      adminOnly: false,
    },
    {
      to: "/workspace",
      label: "Workspace",
      icon: Workflow,
      badge: null,
      adminOnly: false,
    },
    {
      to: activeJobId ? `/jobs/${activeJobId}` : "/jobs",
      label: "Live Pipeline",
      icon: Activity,
      badge: "HERO",
      highlight: true,
      adminOnly: false,
    },
    {
      to: "/lab",
      label: "Attack Lab",
      icon: Flame,
      badge: "DEMO",
      accent: "rose",
      adminOnly: true,
    },
    {
      to: activeJobId ? `/jobs/${activeJobId}/evidence` : "/evidence",
      label: "Evidence",
      icon: FileSearch,
      badge: null,
      adminOnly: false,
    },
    {
      to: activeJobId ? `/jobs/${activeJobId}/provenance` : "/provenance",
      label: "Provenance",
      icon: GitBranch,
      badge: null,
      adminOnly: false,
    },
    {
      to: "/audit",
      label: "Audit Ledger",
      icon: Layers,
      badge: null,
      adminOnly: false,
    },
    {
      to: "/assets",
      label: "Assets & Registry",
      icon: Database,
      badge: null,
      adminOnly: false,
    },
    {
      to: "/inference",
      label: "Inference Provenance",
      icon: Binary,
      badge: null,
      adminOnly: false,
    },
    {
      to: "/benchmarks",
      label: "Benchmarks",
      icon: BarChart2,
      badge: null,
      adminOnly: false,
    },
    {
      to: "/admin",
      label: "Access Management",
      icon: Users,
      badge: pendingCount > 0 ? String(pendingCount) : null,
      adminOnly: true,
    },
    {
      to: "/welcome",
      label: "Landing Showcase",
      icon: Sparkles,
      badge: "DECK",
      adminOnly: false,
    },
    {
      to: "/settings",
      label: "System & Specs",
      icon: Settings,
      badge: null,
      adminOnly: false,
    },
  ];

  const navItems = allNavItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <aside
      className={`border-r border-white/[0.08] bg-bg-dark/95 backdrop-blur-xl flex flex-col justify-between transition-all duration-300 z-30 shrink-0 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex flex-col py-4">
        {/* Navigation list */}
        <nav className="space-y-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative ${
                    isActive
                      ? "bg-white/[0.08] text-cyan-300 border border-cyan-500/30 shadow-glass-edge"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`w-5 h-5 shrink-0 transition-colors ${
                        isActive
                          ? "text-cyan-400"
                          : item.accent === "rose"
                          ? "text-rose-400/80 group-hover:text-rose-400"
                          : "text-slate-400 group-hover:text-slate-200"
                      }`}
                    />
                    {!collapsed && (
                      <span className="truncate flex-1 tracking-tight">{item.label}</span>
                    )}

                    {!collapsed && item.badge && (
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                          item.badge === "HERO"
                            ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}

                    {collapsed && (
                      <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-xs font-medium text-slate-200 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap">
                        {item.label}
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Collapse button & Tagline footer */}
      <div className="p-3 border-t border-white/[0.08]">
        {!collapsed && (
          <div className="px-3 py-2 mb-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <div className="text-[10px] font-mono text-cyan-400 font-semibold tracking-wider uppercase">
              Assurance Doctrine
            </div>
            <div className="text-xs text-slate-400 italic">"From 'Trust me' to 'Prove it.'"</div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
    </aside>
  );
};
