import { Component } from 'react';
import type { ReactNode } from 'react';

// Shows a message instead of a blank white page if any screen crashes.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card" style={{ maxWidth: 520, margin: '15vh auto' }}>
        <h3>Something went wrong</h3>
        <p className="muted">{this.state.error.message}</p>
        <button type="button" onClick={() => window.location.reload()}>Reload page</button>{' '}
        <button type="button" className="ghost" onClick={() => { window.location.href = '/'; }}>Go to home</button>
      </div>
    );
  }
}