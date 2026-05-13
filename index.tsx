
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

// crypto.randomUUID polyfill — the native API only exists in secure
// contexts (HTTPS or localhost). On plain-HTTP deployments and in older
// browsers, `crypto.randomUUID()` throws TypeError, which crashes every
// save path that generates a client_request_id. This polyfill installs
// a v4 UUID generator using getRandomValues (widely available) so all
// downstream code keeps working regardless of how the app is served.
(() => {
  const g: any = (typeof globalThis !== 'undefined' ? globalThis : window) as any;
  if (!g.crypto) g.crypto = {};
  if (typeof g.crypto.randomUUID !== 'function') {
    g.crypto.randomUUID = function randomUUID(): string {
      // Prefer getRandomValues; fall back to Math.random as last resort.
      const bytes = new Uint8Array(16);
      if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
        g.crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      // Set version (4) and variant (10) per RFC 4122
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex: string[] = [];
      for (let i = 0; i < 256; i++) hex.push((i + 0x100).toString(16).slice(1));
      return (
        hex[bytes[0]] + hex[bytes[1]] + hex[bytes[2]] + hex[bytes[3]] + '-' +
        hex[bytes[4]] + hex[bytes[5]] + '-' +
        hex[bytes[6]] + hex[bytes[7]] + '-' +
        hex[bytes[8]] + hex[bytes[9]] + '-' +
        hex[bytes[10]] + hex[bytes[11]] + hex[bytes[12]] + hex[bytes[13]] + hex[bytes[14]] + hex[bytes[15]]
      );
    };
  }
})();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
