import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import './styles.css';
import App from './App';
import { installGlobalImageFallbacks } from './utils/media';

const registerServiceWorker = () => {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {
      // The website remains fully usable when service workers are unavailable.
    });
  });
};

const scheduleImageSafetyNet = () => {
  if (typeof window === "undefined") return;
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(installGlobalImageFallbacks, { timeout: 1800 });
    return;
  }
  window.setTimeout(installGlobalImageFallbacks, 1200);
};

scheduleImageSafetyNet();
registerServiceWorker();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-center"
      reverseOrder={false}
      gutter={10}
      containerStyle={{
        top: 'calc(var(--site-toast-top, 94px) + env(safe-area-inset-top))',
        zIndex: 10000,
      }}
      toastOptions={{
        duration: 3000,
        style: {
          maxWidth: 'min(92vw, 28rem)',
          padding: '13px 16px',
          border: '1px solid #dbe5f0',
          borderRadius: '8px',
          color: '#172033',
          background: '#ffffff',
          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.14)',
          fontSize: '14px',
          fontWeight: 650,
          lineHeight: 1.4,
        },
        success: { iconTheme: { primary: '#22c55e', secondary: '#ffffff' } },
        error: { iconTheme: { primary: '#dc2626', secondary: '#ffffff' } },
      }}
    />
  </React.StrictMode>
);
