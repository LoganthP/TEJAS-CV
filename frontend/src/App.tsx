import React, { useState, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TopBar } from "./components/shell/TopBar";
import { Sidebar } from "./components/shell/Sidebar";
import { EventTicker } from "./components/shell/EventTicker";
import { CoreOffline } from "./components/ui/CoreOffline";
import { LedgerBanner } from "./components/shell/LedgerBanner";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { useSystemStatus } from "./hooks/useSystemStatus";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { EventsProvider } from "./components/EventsProvider";

// Lazy-loaded pages
const LandingPage = lazy(() => import("./landing/LandingPage").then((m) => ({ default: m.LandingPage })));
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const LivePipeline = lazy(() => import("./pages/LivePipeline").then((m) => ({ default: m.LivePipeline })));
const AttackLab = lazy(() => import("./pages/AttackLab").then((m) => ({ default: m.AttackLab })));
const EvidencePage = lazy(() => import("./pages/EvidencePage").then((m) => ({ default: m.EvidencePage })));
const ProvenancePage = lazy(() => import("./pages/ProvenancePage").then((m) => ({ default: m.ProvenancePage })));
const AuditLedgerPage = lazy(() => import("./pages/AuditLedgerPage").then((m) => ({ default: m.AuditLedgerPage })));
const AssetsPage = lazy(() => import("./pages/AssetsPage").then((m) => ({ default: m.AssetsPage })));
const AssetDetailPage = lazy(() => import("./pages/AssetDetailPage").then((m) => ({ default: m.AssetDetailPage })));
const InferencePage = lazy(() => import("./pages/InferencePage").then((m) => ({ default: m.InferencePage })));
const Benchmarks = lazy(() => import("./pages/Benchmarks").then((m) => ({ default: m.Benchmarks })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import("./pages/SignupPage").then((m) => ({ default: m.SignupPage })));
const AdminConsolePage = lazy(() => import("./pages/AdminConsolePage").then((m) => ({ default: m.AdminConsolePage })));
const WorkspacePage = lazy(() => import("./pages/WorkspacePage").then((m) => ({ default: m.WorkspacePage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoadingFallback: React.FC = () => (
  <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-cyan-400 font-mono text-xs">
    <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
    <span className="tracking-widest uppercase text-slate-400">Loading module...</span>
  </div>
);

const MainLayout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user } = useAuth();

  // Shared single system status query
  const {
    systemStatus,
    error: systemError,
    isError,
    refetch,
  } = useSystemStatus();

  if (isError && !systemStatus) {
    return (
      <CoreOffline
        onRetry={() => refetch()}
        error={systemError instanceof Error ? systemError.message : "Connection failed"}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-dark text-slate-100 bg-grid-pattern selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Left Collapsible Rail */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Command Bar */}
        <TopBar status={systemStatus} />
        <LedgerBanner systemHealth={systemStatus?.health} />

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto px-6 py-6 scroll-smooth">
          <div className="max-w-7xl mx-auto">
            <ErrorBoundary fallbackTitle="Panel Encountered an Error">
              <Suspense fallback={<PageLoadingFallback />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>

        {/* Global Event Ticker & Live Bus */}
        <EventTicker />
      </div>
    </div>
  );
};

const RootHandler: React.FC = () => {
  const { user, isLoading, isError, error, refetchAuth } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageLoadingFallback />;

  if (!user && isError) {
    return <CoreOffline onRetry={() => { void refetchAuth(); }} error={error?.message} />;
  }

  if (!user) {
    if (
      location.pathname === "/" ||
      location.pathname === "/welcome" ||
      location.pathname === "/landing"
    ) {
      return <LandingPage />;
    }
    return <Navigate to="/login" replace />;
  }

  return <MainLayout />;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, isError, error, refetchAuth } = useAuth();
  if (isLoading) return <PageLoadingFallback />;
  if (!user && isError) return <CoreOffline onRetry={() => { void refetchAuth(); }} error={error?.message} />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <EventsProvider>
            <Suspense fallback={<PageLoadingFallback />}>
              <Routes>
                <Route path="/welcome" element={<LandingPage />} />
                <Route path="/landing" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />

                <Route path="/" element={<RootHandler />}>
                  <Route index element={<Dashboard />} />
                  <Route path="workspace" element={<WorkspacePage />} />
                  <Route path="admin" element={<AdminConsolePage />} />
                  <Route path="jobs" element={<LivePipeline />} />
                  <Route path="jobs/:id" element={<LivePipeline />} />
                  <Route path="lab" element={<AttackLab />} />
                  <Route path="evidence" element={<EvidencePage />} />
                  <Route path="jobs/:id/evidence" element={<EvidencePage />} />
                  <Route path="provenance" element={<ProvenancePage />} />
                  <Route path="jobs/:id/provenance" element={<ProvenancePage />} />
                  <Route path="audit" element={<AuditLedgerPage />} />
                  <Route path="assets" element={<AssetsPage />} />
                  <Route path="assets/:id" element={<AssetDetailPage />} />
                  <Route path="inference" element={<InferencePage />} />
                  <Route path="benchmarks" element={<Benchmarks />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </EventsProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
