import { render, screen, fireEvent } from '@testing-library/react';
import StreamRecording from './StreamRecording';
test('finalization and automatic completion dialog, immediate playback and confirmed discard', async () => {
 const discard=jest.fn(),exportFile=jest.fn();
 const view=render(<StreamRecording recording={{status:'finalizing'}} />);
 expect(screen.getByText('FINALIZANDO GRAVAÇÃO')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'SALVAR WAV'})).not.toBeInTheDocument();
 view.rerender(<StreamRecording recording={{status:'available',discard,exportFile,file:{url:'blob:wav',name:'vinil.wav',size:100,seconds:60}}} />);
 expect(screen.getByText('GRAVAÇÃO CONCLUÍDA')).toBeInTheDocument();
 expect(screen.getByLabelText('Ouvir gravação')).toHaveAttribute('src','blob:wav');
 fireEvent.click(screen.getByRole('button',{name:'SALVAR WAV'}));expect(exportFile).toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'VOLTAR'}));
 fireEvent.click(screen.getByRole('button',{name:'DESCARTAR'}));expect(discard).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'CONFIRMAR DESCARTE'}));expect(discard).toHaveBeenCalledTimes(1);
});
