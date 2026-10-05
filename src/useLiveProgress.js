import { useEffect, useState } from 'react';
export function liveProgress(elapsedMs) {
  const phase = Math.max(0, elapsedMs) % 600000;
  return phase <= 300000 ? phase / 300000 : (600000 - phase) / 300000;
}
// Only the RADIO tuning/progress needle. Existing player progress and VU are untouched.
export default function useLiveProgress(active) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) { setValue(0); return; }
    const started = performance.now(); let frame;
    const tick = () => { setValue(liveProgress(performance.now() - started)); frame = requestAnimationFrame(tick); };
    setValue(0); frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return value;
}
