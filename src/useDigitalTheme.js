import { useEffect, useState } from 'react';
// Keep the existing preference key so installed PWAs retain their selected color.
const STORAGE_KEY = 'retro-vu.stream-theme';
const EVENT = 'retro-vu.digital-theme';
export const THEMES = [
  { id: 'green', name: 'VERDE FÓSFORO', color: '#91e5a1' },
  { id: 'warm', name: 'BRANCO QUENTE', color: '#eee0b9' },
  { id: 'red', name: 'VERMELHO', color: '#D91A00' },
  { id: 'cyan', name: 'AZUL-CIANO', color: '#00A6B5' },
  { id: 'orange', name: 'LARANJA', color: '#ff6600' },
];
function readTheme() {
  try { return THEMES.find(t => t.id === localStorage.getItem(STORAGE_KEY)) || THEMES[0]; }
  catch { return THEMES[0]; }
}
export default function useDigitalTheme() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const update = event => setTheme(event.detail || readTheme());
    const storage = event => { if (!event.key || event.key === STORAGE_KEY) setTheme(readTheme()); };
    window.addEventListener(EVENT, update);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(EVENT, update); window.removeEventListener('storage', storage); };
  }, []);
  function cycleTheme() {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    try { localStorage.setItem(STORAGE_KEY, next.id); } catch { /* Color remains usable without storage. */ }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }
  return { theme, cycleTheme };
}
