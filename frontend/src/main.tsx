import React, { Component, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import App from "./ui/App";
import { initTheme } from "./lib/theme";
import { registerGlobeServiceWorker } from "./lib/globe-offline";
import "./ui/styles.css";

initTheme();
void registerGlobeServiceWorker();

class RootErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[INFA-TRACK] render crash", err, info.componentStack);
  }

  render() {
    if (this.state.err) {
      return (
        <div style={{ fontFamily: "Segoe UI, sans-serif", padding: 24, maxWidth: 640 }}>
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Something broke the screen</h1>
          <p style={{ color: "#555", fontSize: 13 }}>{this.state.err.message}</p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "#f4f1ea", padding: 12 }}>
            {this.state.err.stack}
          </pre>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>,
);

