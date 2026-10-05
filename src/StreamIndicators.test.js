import { render, screen } from '@testing-library/react';
import StreamIndicators, { indicatorStates } from './StreamIndicators';
test('all five symbols stay visible and off initially', () => {
  render(<StreamIndicators capture={{}} network={{}} recording={{}} />);
  expect(screen.getAllByRole('img')).toHaveLength(5);
  screen.getAllByRole('img').forEach(icon => expect(icon).toHaveAttribute('data-state', 'off'));
});
test('state reflects readiness and playback, not just button intent', () => {
  expect(indicatorStates({ status:'OPENING' }, {}, {})).toEqual(['pending','off','off','off','off']);
  expect(indicatorStates({ status:'READY',monitor:true }, { role:'send', status:'CONNECTED' }, { status:'recording' }))
    .toEqual(['on','off','off','on','on']);
  expect(indicatorStates({}, { role:'receive', status:'BUFFERING',playing:true }, {})).toEqual(['off','on','pending','off','off']);
  expect(indicatorStates({}, { role:'receive', status:'PLAYING',playing:true }, {})).toEqual(['off','on','on','off','off']);
  expect(indicatorStates({}, { role:'receive', status:'STOPPED',playing:false }, {})).toEqual(['off','on','off','off','off']);
  expect(indicatorStates({}, { role:'receive', status:'DISCONNECTED',playing:true }, {})).toEqual(['off','pending','off','off','off']);
});
