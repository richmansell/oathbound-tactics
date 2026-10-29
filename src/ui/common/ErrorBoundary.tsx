import { Component, type ComponentChildren } from 'preact';

/** Catches render errors so a bug never leaves the player on a blank screen. */
export class ErrorBoundary extends Component<{ children: ComponentChildren; onReset: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  componentDidCatch(error: Error): void {
    console.error('UI error', error);
    this.setState({ error });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div class="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#070b16', padding: '16px' }}>
        <div class="panel" style={{ width: 'min(520px, 94vw)', padding: '16px' }}>
          <div class="title-font gold-text" style={{ fontSize: '22px' }}>The lantern flickered.</div>
          <p>Something went wrong. Your progress up to the last autosave is safe.</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', color: 'var(--muted)', maxHeight: '30vh', overflow: 'auto' }}>{String(this.state.error?.message ?? this.state.error)}</pre>
          <button class="btn primary" onClick={() => { this.setState({ error: null }); this.props.onReset(); }}>Return to title</button>
        </div>
      </div>
    );
  }
}
