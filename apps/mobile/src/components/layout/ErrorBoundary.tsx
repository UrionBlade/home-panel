import { Component, type ReactNode } from "react";
import { i18next } from "../../lib/i18n";
import { Button } from "../ui/Button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown): void {
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-10 text-center gap-6 bg-bg">
          <h1 className="font-display text-4xl text-text">
            {i18next.t("boundary.title", { ns: "errors" })}
          </h1>
          <p className="text-text-muted max-w-md">{i18next.t("boundary.body", { ns: "errors" })}</p>
          {this.state.error && (
            <pre className="text-sm text-text-subtle max-w-2xl whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
          )}
          <Button onClick={this.reset}>{i18next.t("boundary.reload", { ns: "errors" })}</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
