import {render,screen,fireEvent} from '@testing-library/react';
import StreamRecording from './StreamRecording';
test('optional archive exports and closes without playback or destructive controls',()=>{
 const exportFile=jest.fn(),onClose=jest.fn(),select=jest.fn();
 render(<StreamRecording onClose={onClose} recording={{file:{id:'one',name:'one.wav'},files:[{id:'one',name:'one.wav'},{id:'two',name:'two.wav'}],select,exportFile}}/>);
 expect(screen.queryByLabelText('Ouvir gravação')).not.toBeInTheDocument();
 expect(screen.queryByText('DESCARTAR')).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Gravações preservadas'),{target:{value:'two'}});expect(select).toHaveBeenCalledWith('two');
 fireEvent.click(screen.getByText('EXPORTAR WAV'));expect(exportFile).toHaveBeenCalled();
 fireEvent.click(screen.getByText('VOLTAR'));expect(onClose).toHaveBeenCalled();
});
