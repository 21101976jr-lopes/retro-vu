import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import StreamSession from './StreamSession';
import useStreamNetwork from './useStreamNetwork';
import {StreamTransport} from './stream/transport';
jest.mock('./stream/transport',()=>({StreamTransport:jest.fn()}));
const invite='a'.repeat(64);
function Harness(){const network=useStreamNetwork(null);return <><button onClick={()=>network.requestTransmit(()=>{})}>Start</button><button onClick={network.toggleReceive}>Receive</button><StreamSession network={network}/></>;}
beforeEach(()=>{global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({sessions:[{invite,name:'JUNIOR'}]})});StreamTransport.mockImplementation(()=>({start:jest.fn(),close:jest.fn()}));});
afterEach(()=>{delete global.fetch;jest.clearAllMocks();});
test('open discovery connects in the app without a link',async()=>{
 render(<Harness/>);fireEvent.click(screen.getByText('Receive'));
 expect(await screen.findByText(/JUNIOR/)).toBeInTheDocument();
 fireEvent.click(screen.getByText('CONECTAR'));
 expect(StreamTransport).toHaveBeenCalledWith('receive',null,expect.any(Function),{invite});
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test('transmit dialog offers open primary action and optional private mode',()=>{
 const confirmTransmit=jest.fn();render(<StreamSession network={{dialog:'send',confirmTransmit}}/>);
 fireEvent.click(screen.getByRole('button',{name:'TRANSMITIR',exact:true}));expect(confirmTransmit).toHaveBeenCalledWith('open');
 fireEvent.click(screen.getByText('MODO PRIVADO'));expect(confirmTransmit).toHaveBeenCalledWith('private');
});
test('private receive retains validation and uses same transport',async()=>{
 render(<Harness/>);fireEvent.click(screen.getByText('Receive'));fireEvent.click(screen.getByText('ENTRAR EM MODO PRIVADO'));
 fireEvent.click(screen.getByText('CONECTAR'));expect(screen.getByRole('alert')).toHaveTextContent('convite válido');
 fireEvent.change(screen.getByLabelText('Convite'),{target:{value:invite}});fireEvent.click(screen.getByText('CONECTAR'));
 expect(StreamTransport).toHaveBeenCalledWith('receive',null,expect.any(Function),{invite});
});
test('share uses native sharing and clipboard fallback',async()=>{
 Object.defineProperty(navigator,'share',{configurable:true,value:jest.fn().mockResolvedValue()});
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:jest.fn().mockResolvedValue()}});
 render(<StreamSession network={{dialog:'share',share:'https://example.test/#stream='+invite}}/>);
 fireEvent.click(screen.getByText('COMPARTILHAR'));await waitFor(()=>expect(navigator.share).toHaveBeenCalled());
 fireEvent.click(screen.getByText('COPIAR CONVITE'));await waitFor(()=>expect(navigator.clipboard.writeText).toHaveBeenCalled());
 delete navigator.share;delete navigator.clipboard;
});
