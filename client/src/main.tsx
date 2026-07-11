import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Polyfill crypto.randomUUID for older browsers / environments where extensions may clobber it
if (!crypto.randomUUID) {
  crypto.randomUUID = function() {
    var buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    var hex: string[] = [];
    for (var i = 0; i < 16; i++) {
      hex.push(buf[i].toString(16).padStart(2, '0'));
    }
    return hex.slice(0,4).join('') + '-' +
           hex.slice(4,6).join('') + '-4' +
           hex.slice(6,8).join('').slice(1) + '-' +
           ((parseInt(hex[8],16) & 0x3 | 0x8).toString(16)) +
           hex.slice(9,11).join('') + '-' +
           hex.slice(11).join('');
  };
}
console.log('[CryptChat] crypto.randomUUID available:', !!crypto.randomUUID);

// Global error boundary — catches React crashes and shows the error
class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(p: any) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 40, background: '#000', color: '#e7e9ea', minHeight: '100vh',
          fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6
        }}>
          <h1 style={{ color: '#f4212e', fontSize: 20, marginBottom: 16 }}>💥 CryptChat Crashed</h1>
          <div style={{
            background: '#16181c', border: '1px solid #2f3336', borderRadius: 12,
            padding: 20, overflow: 'auto', maxHeight: '70vh'
          }}>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {this.state.error.message}{'\n\n'}
              {this.state.error.stack}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
