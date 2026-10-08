import { render, screen, fireEvent } from '@testing-library/react';
import StreamDisplay from './StreamDisplay';
const idle = { settings: {}, status: 'STANDBY', input: '--', signal: 0, monitor: false, message: 'AWAITING COMMAND' };
function display(capture = idle) {
  return <StreamDisplay geometry={{ x: 234, y: 280, width: 1812, height: 1440 }} baseWidth={3070} baseHeight={2048} capture={capture} />;
}
beforeEach(() => localStorage.clear());
test('initial display prioritizes PRONTO and omits laboratory controls', () => {
  render(display());
  expect(screen.getByRole('heading', { name: 'PRONTO' })).toBeInTheDocument();
  expect(screen.getByText('Toque em TRANSMITIR para escolher a fonte.')).toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.queryByText(/COPIAR DIAGNÓSTICO|BUFFER|NETWORK/)).not.toBeInTheDocument();
});
test('context follows opening, capture, monitor, monitor off and standby', () => {
  const view = render(display({ ...idle, status: 'OPENING', message: 'OPENING USB AUDIO' }));
  expect(screen.getByRole('heading', { name: 'ABRINDO USB' })).toBeInTheDocument();
  const ready = { ...idle, status: 'READY', message: 'USB AUDIO READY', signal: 7,
    settings: { channelCount: 1, sampleRate: 48000, sampleSize: 16 } };
  view.rerender(display(ready));
  expect(screen.getByRole('heading', { name: 'TRANSMITIR ATIVO' })).toBeInTheDocument();
  expect(screen.getByText('MONO')).toBeInTheDocument();
  expect(screen.getByText('48 kHz / 16 BIT')).toBeInTheDocument();
  expect(screen.getByRole('meter', { name: 'SIGNAL' })).toHaveAttribute('aria-valuenow', '7');
  view.rerender(display({ ...ready, monitor: true, message: 'MONITOR ON' }));
  expect(screen.getByRole('heading', { name: 'MONITOR ATIVO' })).toBeInTheDocument();
  expect(screen.getByText('Sem áudio? Selecione a saída de mídia no Android.')).toBeInTheDocument();
  expect(screen.queryByText('48 kHz / 16 BIT')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Alterar cor/ }));
  expect(screen.getByRole('region')).toHaveAttribute('data-theme', 'warm');
  view.rerender(display({ ...ready, message: 'MONITOR OFF' }));
  expect(screen.getByRole('heading', { name: 'TRANSMITIR ATIVO' })).toBeInTheDocument();
  view.rerender(display());
  expect(screen.getByRole('heading', { name: 'PRONTO' })).toBeInTheDocument();
  expect(screen.queryByRole('meter')).not.toBeInTheDocument();
});
test.each([
  ['USB AUDIO NOT FOUND', 'USB NÃO ENCONTRADO'],
  ['USB AUDIO DISCONNECTED', 'USB DESCONECTADO'],
  ['AUDIO PERMISSION REQUIRED', 'PERMITA O ÁUDIO'],
  ['MONITOR AUDIO ERROR', 'MONITOR INDISPONÍVEL'],
  ['Unexpected failure', 'FALHA NO ÁUDIO'],
])('error %s becomes the main message', (message, title) => {
  render(display({ ...idle, status: 'ERROR', message }));
  expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
  expect(screen.getByRole('region')).toHaveAttribute('data-state', 'error');
});

test.each([['green','#91e5a1'],['warm','#eee0b9'],['red','#D91A00'],['cyan','#00A6B5'],['orange','#ff6600']])('saved palette %s survives remount', (id,color)=>{
 localStorage.setItem('retro-vu.stream-theme',id);
 const view=render(display());expect(screen.getByRole('region')).toHaveAttribute('data-theme',id);
 expect(screen.getByRole('region').style.getPropertyValue('--stream-phosphor')).toBe(color);
 view.unmount();render(display());expect(screen.getByRole('region')).toHaveAttribute('data-theme',id);
});

test('COLOR cycles all five colors and persists the selection', () => {
 render(display());
 expect(screen.getByText('COLOR')).toBeInTheDocument();
 for (const id of ['warm','red','cyan','orange','green']) {
  fireEvent.click(screen.getByRole('button', { name: /Alterar cor/ }));
  expect(screen.getByRole('region')).toHaveAttribute('data-theme', id);
  expect(localStorage.getItem('retro-vu.stream-theme')).toBe(id);
 }
});

test('USB error replaces auxiliary REC and update messages; receiving removes stale USB error',()=>{
 const capture={...idle,status:'ERROR',message:'USB AUDIO NOT FOUND'};
 const props={geometry:{x:234,y:280,width:1812,height:1440},baseWidth:3070,baseHeight:2048,capture,recording:{status:'error',message:'REC: ative USB'}};
 const view=render(<StreamDisplay {...props}/>);
 expect(screen.getByText('USB NÃO ENCONTRADO')).toBeInTheDocument();
 expect(screen.queryByText('REC: ative USB')).not.toBeInTheDocument();
 expect(screen.queryByText('CAPTURA LOCAL')).not.toBeInTheDocument();
 expect(screen.queryByText('ATUALIZAÇÃO DISPONÍVEL')).not.toBeInTheDocument();
 view.rerender(<StreamDisplay {...props} network={{role:'receive',status:'PLAYING',seconds:5}}/>);
 expect(screen.getByText('RECEBENDO')).toBeInTheDocument();
 expect(screen.queryByText('USB NÃO ENCONTRADO')).not.toBeInTheDocument();
});
test('session and recording panels unmount previous main content',()=>{
 const props={geometry:{x:234,y:280,width:1812,height:1440},baseWidth:3070,baseHeight:2048,capture:idle};
 const view=render(<StreamDisplay {...props}/>);
 view.rerender(<StreamDisplay {...props} network={{dialog:'send'}}/>);
 expect(screen.getByText('TRANSMITIR ÁUDIO?')).toBeInTheDocument();expect(screen.queryByText('PRONTO')).not.toBeInTheDocument();
 view.rerender(<StreamDisplay {...props} recording={{status:'finalizing'}}/>);
 expect(screen.getByText('FINALIZANDO WAV')).toBeInTheDocument();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByText('PRONTO')).toBeInTheDocument();
});

test('completed REC is nonblocking; archive opens only on demand and closes independently',()=>{
 const exportFile=jest.fn(),file={id:'one',name:'vinil.wav'};
 render(<StreamDisplay geometry={{x:234,y:280,width:1812,height:1440}} baseWidth={3070} baseHeight={2048} capture={idle} recording={{status:'available',file,exportFile}} network={{role:'receive',status:'PLAYING',sourceKind:'voice'}}/>);
 expect(screen.getByText('RECEBENDO')).toBeInTheDocument();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.queryByText(/BUFFER/)).not.toBeInTheDocument();
 fireEvent.click(screen.getByText('EXPORTAR WAV'));expect(screen.getByRole('dialog')).toBeInTheDocument();
 fireEvent.click(screen.getByText('EXPORTAR WAV'));expect(exportFile).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByText('VOLTAR'));expect(screen.getByText('RECEBENDO')).toBeInTheDocument();
});
