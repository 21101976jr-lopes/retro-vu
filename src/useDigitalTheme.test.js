import { renderHook, act } from '@testing-library/react';
import useDigitalTheme from './useDigitalTheme';
beforeEach(() => localStorage.clear());
test('mounted displays share changes and preserve the color across navigation', () => {
 const { result: radio } = renderHook(useDigitalTheme);
 const { result: stream, unmount } = renderHook(useDigitalTheme);
 for (let i=0;i<4;i++) act(() => stream.current.cycleTheme());
 expect(radio.current.theme.id).toBe('orange');
 expect(radio.current.theme.color).toBe('#ff6600');
 unmount();
 const { result: reopened } = renderHook(useDigitalTheme);
 expect(reopened.current.theme.id).toBe('orange');
});
test('invalid stored color safely defaults to green', () => {
 localStorage.setItem('retro-vu.stream-theme','invalid');
 expect(renderHook(useDigitalTheme).result.current.theme.id).toBe('green');
});

