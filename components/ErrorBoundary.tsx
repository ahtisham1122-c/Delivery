
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white font-sans">
          <div className="max-w-md w-full bg-slate-800 p-10 rounded-[3rem] border-4 border-red-500/20 shadow-2xl text-center space-y-8">
            <div className="bg-red-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle size={40} className="text-red-500" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-black uppercase tracking-tighter italic">System Crash</h1>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">An unexpected error occurred</p>
            </div>

            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-700 text-left overflow-hidden">
              <p className="text-[10px] font-mono text-red-400 break-words">
                {this.state.error?.message || 'Unknown Error'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <button 
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-blue-900/20"
              >
                <RefreshCcw size={16} /> Reload App
              </button>
              <button 
                onClick={() => window.location.href = '/'}
                className="flex items-center justify-center gap-2 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all"
              >
                <Home size={16} /> Go Home
              </button>
            </div>

            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
              If the problem persists, please contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
