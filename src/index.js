import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import App from './App';
import { installGlobalImageFallbacks } from './utils/media';

const scheduleImageSafetyNet = () => {
  if (typeof window === "undefined") return;
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(installGlobalImageFallbacks, { timeout: 1800 });
    return;
  }
  window.setTimeout(installGlobalImageFallbacks, 1200);
};

scheduleImageSafetyNet();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
