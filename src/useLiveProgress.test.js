import { act, renderHook } from '@testing-library/react';
import useLiveProgress, { liveProgress } from './useLiveProgress';
test.each([[0,0],[150000,0.5],[300000,1],[450000,0.5],[600000,0],[750000,0.5],[3600000,0]])('elapsed %i gives %f', (ms, value) => {
  expect(liveProgress(ms)).toBe(value);
});
test('turnaround is continuous', () => {
  expect(liveProgress(299999)).toBeCloseTo(liveProgress(300001), 8);
  expect(liveProgress(599999)).toBeCloseTo(liveProgress(600001), 8);
});
test('elapsed clock, not frame count, drives position; stop/restart resets independently of player', () => {
  let now = 100, frame;
  jest.spyOn(performance, 'now').mockImplementation(() => now);
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 10; });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const { result, rerender, unmount } = renderHook(({ active }) => useLiveProgress(active), { initialProps: { active: true } });
  now += 450000; act(() => frame()); expect(result.current).toBe(0.5);
  rerender({ active: false }); expect(result.current).toBe(0); expect(cancelAnimationFrame).toHaveBeenCalledWith(10);
  rerender({ active: true }); expect(result.current).toBe(0); unmount(); jest.restoreAllMocks();
});
