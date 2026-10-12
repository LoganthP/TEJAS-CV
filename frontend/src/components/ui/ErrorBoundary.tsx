import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";
import { GlassPanel } from "./GlassPanel";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  private handleReset = () => {
    if (/dynamically imported module|module script|ChunkLoadError|Loading chunk/i.test(this.state.error?.message || "")) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="py-12 max-w-xl mx-auto px-4">
          <GlassPanel className="p-6 border-rose-500/30 bg-rose-950/20 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mx-auto text-rose-400">
              <AlertOctagon className="w-6 h-6" />
            </div>

            <div>
              <h2 className="text-base font-mono font-bold text-white uppercase tracking-wider">
                {this.props.fallbackTitle || "Panel Render Error"}
              </h2>
              <p className="text-xs font-mono text-rose-300/80 mt-1 max-w-md mx-auto">
                {this.state.error?.message || "An unexpected error occurred while rendering this view."}
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold inline-flex items-center gap-2 transition-all shadow-glass-edge"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{/dynamically imported module|module script|ChunkLoadError|Loading chunk/i.test(this.state.error?.message || "") ? "Reload application" : "Reload this panel"}</span>
              </button>
            </div>
          </GlassPanel>
        </div>
      );
    }

    return this.props.children;
  }
}
