import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Global fail-safe: any render crash anywhere in the app lands here
 * instead of a white screen / dead tab. User can recover without losing data.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown) {
    console.error('App crash caught by ErrorBoundary:', err);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  private handleReset = () => {
    if (!window.confirm('Reset app to demo data? Your saved trips and uploads will be erased.')) return;
    Object.keys(localStorage)
      .filter((k) => k.startsWith('ws_'))
      .forEach((k) => localStorage.removeItem(k));
    try {
      sessionStorage.clear();
    } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-6 text-center space-y-3">
          <p className="text-3xl">⚠️</p>
          <h2 className="font-extrabold text-slate-900">Something went wrong</h2>
          <p className="text-xs text-slate-500">
            The app crashed, but your data is safe. Tap Retry — you will return to the same trip.
          </p>
          {this.state.message && (
            <p className="text-[11px] font-mono text-slate-400 bg-slate-50 rounded-xl px-3 py-2 break-words">
              {this.state.message.slice(0, 200)}
            </p>
          )}
          <button
            onClick={this.handleRetry}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
          >
            Retry (data stays safe)
          </button>
          <button onClick={this.handleReset} className="w-full text-[11px] font-bold text-slate-400 hover:text-rose-500 cursor-pointer">
            Reset to demo data
          </button>
        </div>
      </div>
    );
  }
}
