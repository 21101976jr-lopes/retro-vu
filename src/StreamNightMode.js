import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// EXPERIMENTAL: visual layer only. Never owns or restarts audio/network resources.
export default function StreamNightMode() {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('');
  const control = useRef({ wanted: false, mounted: true, lock: null, pending: false, revision: 0 });
  const button = useRef(null);
  function release() {
    const c = control.current;
    const lock = c.lock; c.lock = null;
    if (lock && !lock.released) lock.release().catch(() => {});
  }
  async function acquire() {
    const c = control.current;
    if (!c.mounted || !c.wanted || c.pending || c.lock || document.visibilityState !== 'visible') return;
    if (!navigator.wakeLock?.request) {
      c.wanted = false; setStatus('WAKE LOCK INDISPONÍVEL'); return;
    }
    const revision = c.revision;
    c.pending = true; setStatus('ATIVANDO MODO NOTURNO');
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!c.mounted || !c.wanted || c.revision !== revision || document.visibilityState !== 'visible') {
        await lock.release(); return;
      }
      if (lock.released) throw new Error('Bloqueio liberado pelo sistema');
      c.lock = lock;
      lock.addEventListener('release', () => {
        if (c.lock !== lock) return;
        c.lock = null;
        if (c.mounted && c.wanted) setStatus('BLOQUEIO PERDIDO · TOQUE PARA VOLTAR');
      });
      setActive(true); setStatus('MODO NOTURNO · TELA ATIVA');
    } catch (error) {
      if (c.mounted && c.wanted && c.revision === revision)
        setStatus(`WAKE LOCK NÃO OBTIDO: ${error.name || 'Error'}`);
    } finally {
      c.pending = false;
      if (c.mounted && c.wanted && c.revision !== revision && document.visibilityState === 'visible') acquire();
    }
  }
  function exit() {
    const c = control.current;
    c.wanted = false; c.revision++; release(); setActive(false); setStatus('');
    button.current?.focus();
  }
  useEffect(() => {
    const c = control.current; c.mounted = true;
    const visible = () => {
      if (document.visibilityState === 'visible') acquire();
      else { c.revision++; release(); if (c.wanted) setStatus('BLOQUEIO LIBERADO · AGUARDANDO RETORNO'); }
    };
    const key = event => { if (event.key === 'Escape' && c.wanted) exit(); };
    document.addEventListener('visibilitychange', visible);
    document.addEventListener('keydown', key);
    return () => {
      c.mounted = false; c.wanted = false; c.revision++; release();
      document.removeEventListener('visibilitychange', visible);
      document.removeEventListener('keydown', key);
    };
    // Stable ref owns the lock; no audio/network callbacks are captured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>
    <button ref={button} type="button" onClick={() => { control.current.wanted = true; acquire(); }}
      style={{ color: 'inherit', background: 'transparent', border: '1px solid currentColor', font: 'inherit', padding: '0.35em 0.6em' }}>
      MODO NOTURNO
    </button>
    {!active && status && <p role="status" style={{ fontSize: '0.7em' }}>{status}</p>}
    {active && createPortal(<button type="button" aria-label="Sair do modo noturno" onClick={exit}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 10000,
        background: '#000', color: '#737b73', border: 0, borderRadius: 0, padding: 24,
        font: '12px monospace', cursor: 'pointer' }}>
      <span role="status">{status}<br />TOQUE PARA RESTAURAR</span>
    </button>, document.body)}
  </>;
}
