import { noteCrash } from '../core/health';
import { Component, type ReactNode } from 'react';

interface Props {
  /** Shown in the fallback, e.g. the widget's name. */
  label: string;
  children: ReactNode;
  /** Whole-page fallback (bigger, with recovery actions). */
  page?: boolean;
}

interface State {
  error: Error | null;
  key: number;
}

/** One broken widget never takes the page down: it shows a small card with a retry button instead. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[Nova] ${this.props.label}:`, error);
    if (this.props.page) noteCrash();
  }

  retry = () => this.setState((s) => ({ error: null, key: s.key + 1 }));

  render() {
    const { error, key } = this.state;
    if (!error) return <div key={key} style={{ display: 'contents' }}>{this.props.children}</div>;
    if (this.props.page) {
      return (
        <div role="alert" style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 24, background: '#05060A', color: '#ECE8E1', fontFamily: 'Vazirmatn, system-ui, sans-serif', direction: 'rtl' }}>
          <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>اورآ به خطا خورد</h1>
            <p style={{ margin: 0, lineHeight: 1.9, opacity: 0.75 }}>داده‌هایت سالم‌اند (در مرورگر ذخیره شده‌اند). در «حالت امن» پس‌زمینه‌ی سه‌بعدی و فونت شخصی خاموش می‌شوند تا بفهمیم مشکل از کجاست.</p>
            <pre dir="ltr" style={{ margin: 0, fontSize: 11, opacity: 0.6, whiteSpace: 'pre-wrap', textAlign: 'left' }}>{String(error.message).slice(0, 400)}</pre>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => location.reload()} style={{ height: 40, padding: '0 16px', borderRadius: 12 }}>بارگذاری دوباره</button>
              <button onClick={() => { location.href = `${location.pathname}?safe`; }} style={{ height: 40, padding: '0 16px', borderRadius: 12 }}>حالت امن</button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div role="alert" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, textAlign: 'center' }}>
        <span style={{ fontSize: 13 }}>«{this.props.label}» خطا داد.</span>
        <span className="faint" dir="ltr" style={{ fontSize: 11, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{error.message}</span>
        <button className="btn" style={{ height: 32 }} onClick={this.retry}>دوباره امتحان کن</button>
      </div>
    );
  }
}
