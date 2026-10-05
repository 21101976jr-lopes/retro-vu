# Retro VU — primeiro transporte PCM

Atualização funcional 1.0: consulte [RELEASE-1.0.md](RELEASE-1.0.md). As seções abaixo registram a implementação inicial; REC local no transmissor agora está implementado.

Implementação local e caminho para Vercel. Nenhum deploy, commit ou push foi executado.

Atualização de transporte: veja [STREAM-BACKPRESSURE.md](STREAM-BACKPRESSURE.md) para a política corrigida, diagnóstico e validação mais recente (92 testes). Os resultados ao final deste documento registram a etapa inicial.

## Arquitetura e propriedade dos recursos

- `useStreamInput(true)` mantém uma única captura USB global. A estratégia de seleção e as constraints físicas anteriores foram preservadas.
- A mesma fonte alimenta o SIGNAL, o MONITOR e um AudioWorklet de captura PCM. O worklet tem saída silenciosa para manter o processamento ativo; não cria monitoramento nem ganho.
- `useStreamNetwork` possui a sessão de rede, separada da sessão USB. Navegação não desmonta nenhuma delas. Desligar TRANSMITIR encerra as duas; falha da rede preserva USB/SIGNAL/MONITOR.
- RECEBER alterna uma sessão receptora; nesta primeira versão um aparelho é transmissor OU receptor. Trocar de papel encerra o papel anterior.
- Cada receptor tem RTCPeerConnection, DataChannel, fila e recuperação independentes. Limite atual: um transmissor e três receptores.
- REC continua sem função. A fonte USB e a saída do worklet receptor continuam disponíveis para uma futura ramificação de gravação.

## PCM e qualidade

AudioWorklet obtém PCM real sem ScriptProcessor. Blocos de aproximadamente 20 ms: 960 frames em 48 kHz; 882 em 44,1 kHz.
Payload PCM16 intercalado little-endian. Cabeçalho binário de 32 bytes: magic, versão, canais, epoch, sequência uint32, sample rate, frames e posição lógica float64 (inteiro seguro).
Em 48 kHz mono: 1.920 bytes de áudio + 32 de cabeçalho por bloco, 97.600 bytes/s, antes de SCTP/DTLS/UDP.
DataChannel ordered/reliable, sem maxRetransmits/maxPacketLifeTime. Nenhuma track de áudio é adicionada ao PeerConnection; não há codec perceptual.

A taxa PCM é a taxa REAL do AudioContext. A entrada mantém getSettings original. Se as taxas forem diferentes, Web Audio faz a conversão da entrada para o contexto; os logs distinguem inputRate e sampleRate. Não se promete identidade bit a bit com o ADC.
O receptor solicita AudioContext com a taxa recebida. Se o navegador não puder executar esse formato, informa erro; não toca amostras com velocidade errada. Caso uma nova ativação seja exigida, PLAY / STOP retoma o contexto.
Suporte estrutural a 1 ou 2 canais, sem inventar estéreo. A captura física atual continua mono.

## Buffer, STOP e interrupções

- Handshake de formato/ready: somente envia PCM depois que o worklet receptor está preparado e o contexto está running.
- Início: acumular 5 segundos reais antes de tocar.
- Buffer circular no AudioWorklet: capacidade máxima 15 segundos.
- Underflow: preencher saída com zeros, registrar RECOVERING e aguardar novamente 5 segundos.
- Rampas de 5 ms nas bordas de início/esgotamento reduzem estalos. Ganho unitário durante reprodução contínua; MONITOR permanece intocado.
- Não acelera reprodução nem descarta áudio para tentar voltar à baixa latência depois de um atraso recuperável.
- STOP silencia a reprodução local, mantém a conexão e conserva só os 5 segundos mais recentes. PLAY retoma com margem.
- Limite por receptor no transmissor: 1 MiB de fila da aplicação, mais aproximadamente 256 KiB no DataChannel. Retoma envio pelo bufferedamountlow (64 KiB).
- Créditos limitam mensagens em trânsito entre thread principal e worklets. O produtor não acumula indefinidamente mensagens quando a thread principal trava.
- Saturação da fila de envio deixa de aceitar novos blocos somente para o peer afetado, escoa a fila e envia resync ordenado, sem fechar a conexão. Há descontinuidade explícita; memória permanece limitada. Falhas fatais de protocolo ou dos worklets ainda encerram a sessão afetada. Consulte o relatório de backpressure para limites e motivos exatos.
- Sequência, posição, formato e epoch são validados. Dados inválidos não chegam à reprodução.
- Relógios físicos podem divergir em sessões muito longas; não há correção adaptativa de clock drift nesta versão. Os limites/underflow continuam protegendo a reprodução.

## Sinalização

POST JSON `/api/stream-signal`, com presença, SDP, ICE e reset. Poll normal 750 ms; retentativas até 8 s; timeout de requisição 8 s.
Uma sessão automática por instalação/namespace. Usuário não informa IP, SDP, sala ou portas.
Mensagens têm IDs, deduplicação e confirmação. Presença expira após 30 s sem atualização. Dados temporários no Redis expiram após 120 s.
O áudio nunca passa pelo endpoint, Redis, Vercel ou Quick Tunnel como servidor de streaming. STUN auxilia descoberta de candidatos, não transporta PCM.

**Local:** `src/setupProxy.js` registra o mesmo handler no servidor CRA, com estado em memória. Basta `npm start`; reiniciar o servidor limpa presença e negociações antigas.

**Vercel:** `api/stream-signal.js` usa Redis REST com compare-and-set Lua para consistência entre instâncias. Sem credenciais, responde 503; não usa memória de processo como falsa persistência em produção.
Foi escolhido HTTP polling para não depender de conexões WebSocket longas. A Vercel atualmente oferece WebSockets beta, mas isso também exige estado compartilhado e reconexão na duração máxima da função.

Configuração externa necessária ANTES de autorizar publicação:

1. Redis REST compatível com Upstash e EVAL.
2. Variáveis somente no servidor: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `STREAM_ENABLED=true`.
3. Opcional: `STREAM_NAMESPACE` exclusivo para separar instalações/ambientes que compartilham Redis.
4. Manter acesso ao aplicativo pessoal restrito aos aparelhos autorizados, usando a proteção/autenticação do ambiente. Esta versão não implementa contas ou autorização de ouvintes: quem acessa a mesma instalação acessível pode procurar sua sessão. A restrição de Origin evita uso normal entre sites, mas não é autenticação.
5. Testar o endpoint publicado e o fluxo em dois dispositivos somente após deploy autorizado. Redis/Vercel de produção ainda não foram exercitados com credenciais reais.

ICE usa STUN público `stun:stun.l.google.com:19302`. Na mesma rede doméstica, candidatos locais podem bastar.
Redes com isolamento de clientes, VPN, NAT/firewall restritivo podem exigir TURN. Não há TURN provisionado nem promessa de conexão universal pela internet.
Opção técnica de build: `REACT_APP_STREAM_ICE_SERVERS`, JSON RTCIceServer[]. Credenciais estáticas incluídas no build ficam visíveis; para produção, usar emissão de credenciais TURN temporárias antes de ativar essa opção.
TURN, se necessário e configurado, retransmite DataChannel criptografado; não muda o formato PCM nem utiliza Vercel para áudio.

## Primeiro teste físico — sem deploy

1. No PC, em `C:\Users\USER\retro-vu`, executar `npm start` se o servidor não estiver ativo.
2. Usar o MESMO endereço HTTPS do Quick Tunnel atual nos dois aparelhos. Não usar HTTP de IP local no Android.
3. Manter ambos os aparelhos na mesma rede Wi-Fi, sem isolamento de clientes. Deixar as páginas em primeiro plano para este primeiro teste.
4. Aparelho A: conectar Numark via USB/OTG, colocar disco, abrir STREAM, tocar TRANSMITIR, autorizar áudio. Conferir SIGNAL e AGUARDANDO RECEPTOR.
5. Aparelho B (PC ou celular): abrir STREAM e tocar RECEBER. Aguardar negociação e BUFFERIZANDO até aproximadamente 5 s. Deve aparecer RECEBENDO e sair áudio.
6. Se aparecer ATIVE O ÁUDIO, tocar PLAY / STOP. No Android, escolher manualmente a saída de mídia/Bluetooth no sistema se necessário.
7. No receptor: VOLTAR, depois POWER para entrar no VU. Áudio deve continuar e VU deve reagir. Voltar ao STREAM preserva sessão, cor e buffer.
8. PLAY / STOP pausa a saída; aguardar pelo menos 30 s confirma que buffer não cresce indefinidamente. Tocar novamente para ouvir os últimos segundos.
9. MONITOR no transmissor continua independente. Não é necessário ligá-lo para transmitir.
10. Para encerrar: RECEBER no receptor e TRANSMITIR no transmissor. Fechar/desmontar o aplicativo também libera os recursos.

O Quick Tunnel encaminha apenas interface/sinalização para o PC. O PC/servidor deve permanecer ligado. O link pode expirar.
Não houve implementação nativa/background garantido; fechar o aplicativo não equivale ao funcionamento de um player nativo.

## Diagnóstico técnico

Em desenvolvimento, `window.retroStreamDebug()` retorna JSON dos últimos 300 eventos. Sem painel permanente ou logs infinitos.
Registra formato, estados ICE/peer/DataChannel, sequência/epoch, blocos/bytes, bufferedAmount/queuedBytes por peer, buffer real, estados de playout, underflows, erros e reconstruções.
Sem gravação do conteúdo musical nos logs. No smartphone em desenvolvimento, toque RETRO STREAM · DIAG para consultar/copiar o relatório; window.retroStreamDiagnostic() também está disponível.

## Validação

Suíte Jest cobre regressões de AudioDiagnostic/captura/MONITOR/temas/Image.decode, protocolo, sequência, fila, buffer, underflow, recuperação, STOP, cleanup, multi-peer e navegação.
Ensaio Chromium real com fonte sintética INJETADA APENAS NO NAVEGADOR DE TESTE (não existe modo de sinal simulado no código do aplicativo):
- dois receptores simultâneos; desligar um preservou o outro;
- negociação WebRTC/DataChannel real, PCM/worklets reais, mais de 8.700 blocos recebidos;
- buffer estável ~5 s, nenhum underflow antes da falha induzida;
- STOP mantém janela 5 s; PLAY retoma;
- VOLTAR → RADIO → VU mantém áudio processado e agulha responde;
- atraso ordenado induzido de 350 blocos (~7 s): buffer esgota, um underflow, sequência preservada, retomada com ~7,1 s.
Isso não substitui validação auditiva/estabilidade prolongada no Motorola/Numark/Bluetooth.

Fontes técnicas:
- https://vercel.com/docs/functions/websockets
- https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel
- https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmount
- https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletGlobalScope/sampleRate

## Resultado final e arquivos

- Jest: 8 suítes, 83 testes aprovados (incluindo AudioDiagnostic).
- ESLint: zero erros e zero avisos em src, api, server e public/stream.
- Build de produção: compilado com sucesso. Há somente aviso de depreciação fs.F_OK da ferramenta CRA/Node, sem falha de build.
- Ensaio final após handshake ready: mais de 1.200 blocos, buffer ~5 s, zero underflows; sem erros de página; layout em retrato e paisagem dentro do display.
- AudioDiagnostic.js, AudioDiagnostic.test.js, index.js, index.css, stream.png e radio-panel.png conferidos por SHA-256 contra o snapshot anterior: preservados.

Alterados nesta etapa: src/App.js, src/App.test.js, src/useStreamInput.js, src/StreamDisplay.js.
Criados: src/useStreamNetwork.js; src/StreamNavigation.test.js; src/setupProxy.js; src/stream/pcm.js, flow.js, debug.js, signaling.js, transport.js; src/stream/pcm.test.js, worklet.test.js, signaling.test.js, transport.test.js; public/stream/pcm-worklet.js; server/signaling.cjs; api/stream-signal.js; STREAM.md.
A pasta build foi gerada localmente pela validação. Não houve mudança de dependências/package-lock nem publicação.
