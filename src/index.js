import { registerPwa } from './pwa';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Diagnóstico temporário: só acessível no servidor de desenvolvimento.
const Diagnostic = process.env.NODE_ENV === 'development' &&
  new URLSearchParams(window.location.search).get('audio-diagnostic') === '1'
  ? React.lazy(() => import('./AudioDiagnostic')) : null;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {Diagnostic ? <React.Suspense fallback={<p>Carregando diagnóstico…</p>}><Diagnostic /></React.Suspense> : <App />}
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

registerPwa();
