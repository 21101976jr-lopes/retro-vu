# Investigação de backpressure — Retro VU

## Evidência e limite da conclusão

O código continha uma causa reproduzível de queda prematura: o fim dos quatro créditos entre AudioWorklet e thread principal era tratado como falha fatal de rede. Quatro blocos de 20 ms representam apenas 80 ms. Reproduzimos 106,7 ms de atraso local: saíram quatro blocos e um evento overrun, sem envolver DataChannel ou Wi-Fi.

Isso é compatível com as duas falhas físicas relatadas, mas não demonstra qual ramo executou no Motorola: o registro físico anterior não foi fornecido. Também existia um segundo defeito concreto: qualquer exceção de send(), inclusive OperationError transitório, fechava imediatamente o peer. A nova instrumentação separa essas causas.

## Condições anteriores que fechavam/recriavam peers

| Condição | Ação anterior | Tempo/limite |
| --- | --- | --- |
| CapturePCM.process: credit === 0 | overrun → onCapture → drop de todos → CONGESTED/REDE LENTA | Só 4 × 20 ms, ~80 ms |
| Canais do worklet diferentes do formato | erro → mesmo caminho que overrun | Imediato |
| SenderQueue.bytes + packet.byteLength > limit | callback onOverflow → drop peer → REDE LENTA | 1.048.576 bytes |
| Qualquer exceção em channel.send(packet) | mesmo onOverflow, descartando tipo/mensagem da exceção | Imediato |
| pendingPCM > 64 no receptor | drop peer | 64 mensagens aguardando confirmação do worklet; NÃO é buffer de reprodução |
| Buffer circular excedido | overflow → drop peer | 15 s de PCM |
| Protocolo/sequência/formato inválido | receive-pcm-error → drop peer | Imediato |
| Falha de negociação SDP/ICE | drop peer | Imediato |
| connectionState failed/closed | drop peer | Imediato |
| connectionState disconnected persistente | drop peer | 10 s |
| Peer não connected após criação | drop peer | 25 s |
| DataChannel close/error | drop peer | Imediato |
| Peer ausente na presença / reset remoto | drop peer | Lease de presença 30 s ou mensagem explícita |
| Erro de processador/falha fatal / desligamento explícito | cleanup de rede | Imediato |

O watermark de 256 KiB NÃO fechava sozinho o peer. Ele suspendia flush até bufferedamountlow (64 KiB), mas a fila continuava crescendo e uma exceção transitória ou o guard de créditos podiam derrubar a sessão. Não havia tolerância temporal na condição de créditos nem no catch de send().

## Correção

- Mantidos 4 créditos para limitar mensagens em trânsito.
- Separada uma FIFO dentro do worklet de no máximo 2 s: 100 blocos, 192.000 bytes PCM em 48 kHz mono, além dos quatro blocos em trânsito e um parcial.
- Créditos retornados drenam os blocos em ordem. Uma pausa de 1 s foi testada preservando todos os 50 blocos/96.000 bytes. A FIFO não cresce além do limite; ultrapassá-lo continua sendo falha local explícita capture-ring-cap, sem chamá-la de rede lenta.
- Mantidos DataChannel high=262.144 B, low=65.536 B e fila por receptor=1.048.576 B.
- Histerese no high/low; envio espera bufferedamountlow. Retry de 250 ms cobre OperationError e casos sem cruzamento do low watermark.
- OperationError preserva o mesmo pacote para tentar novamente, sem close. Exceções fatais preservam name/message e tamanho da mensagem.
- Fila cheia suspende aceitação de novos blocos somente para aquele peer. Mantém fila limitada e escoa o que já aceitou.
- Depois de escoar, envia marcador resync ordenado antes de novos blocos: receptor reinicia sequência e buffer sem renegociação ICE.
- Há perda explícita de trecho quando a saturação ultrapassa a capacidade. Ressincronização também limpa o buffer de reprodução anterior. Não se promete conservar indefinidamente áudio de uma fonte física contínua com memória finita.
- Captura USB/getUserMedia, MONITOR, SIGNAL, VU, sinalização e buffer inicial de 5 s não foram alterados.
- PCM16, DataChannel confiável/ordenado e independência por receptor preservados.

## Taxas e distinção das filas

48.000 frames/s × 1 canal × 2 bytes = 96.000 B/s PCM.
Bloco de 960 frames = 1.920 B PCM + cabeçalho de 32 B = 1.952 B.
50 blocos/s = 97.600 B/s de mensagens binárias, antes de overhead SCTP/DTLS/IP.

A instrumentação diferencia:
- pcmProducedBps: frames produzidos no worklet × canais × 2 / intervalo de parede.
- pcmSentBps: payload PCM aceito por send(), por receptor.
- packetSentBps: payload + cabeçalho aceitos por send(), por receptor.
- pcmReceivedBps: PCM realmente recebido/validado no outro aparelho.
- RTC getStats: bytes/messages DataChannel e RTT quando disponíveis, com instante da leitura.
- bufferedAmount: fila nativa de envio, atual/máxima, separada da FIFO da aplicação.
- queuedBytes/queuedBlocks: fila da aplicação antes do DataChannel.
- bufferSeconds: PCM no buffer de reprodução receptor, intencionalmente ~5 s.
- generatedFrames, framesPerBlock, creditStalls e maior fila local do worklet.

Durante recuperação a taxa de envio/recebimento pode superar 96.000 B/s para escoar atraso. Isso não é duplicação. Totais e sequência permitem distinguir os casos.

## Diagnóstico físico sem comandos

Na versão de desenvolvimento, toque em **RETRO STREAM · DIAG** no transmissor e depois no receptor. A tela temporária mostra as taxas e filas separadas, estados e último evento crítico.
Use **ATUALIZAR → COPIAR**. Caso Clipboard API seja recusada, o JSON continua selecionável.
O relatório também está disponível por window.retroStreamDiagnostic(); o histórico simples anterior window.retroStreamDebug() foi mantido.
Eventos críticos preservam cópia em localStorage, chave retro-vu.stream-diagnostic. Não escreve no armazenamento a cada bloco.

Todos os drop() possuem razão explícita e snapshot ANTES de close(): ICE, connectionState, readyState, bufferedAmount, fila, backlog do receptor e erro. Reset remoto carrega sua razão de origem.
Logs e relatório são limitados; não contêm áudio, SDP nem candidatos/IPs.
Recarregue os DOIS aparelhos antes de testar; o worklet novo usa URL versionada ?v=2.

## Ensaio agressivo

Dois navegadores Chromium independentes, WebRTC e AudioWorklets reais, fonte sintética injetada SOMENTE no navegador de ensaio. Nenhum gerador artificial foi incorporado ao aplicativo.

Plano:
- transmissão contínua por no mínimo 5 minutos;
- bloqueio da thread principal do transmissor por 120 ms a cada 3,7 s;
- em t=30 s, bufferedAmount simulado elevado a 300.000 B por 7 s;
- em t=70 s, send() gera OperationError por 500 ms;
- em t=120 s, saturação simulada de 300.000 B por 20 s, atingindo o limite da fila;
- monitorar estados, memória lógica limitada, retomada e fechamento de peers.

300.000 B é valor INJETADO, não medição do Motorola nem prova de congestionamento de Wi-Fi. O teste também registra o getter nativo separadamente.
Resultado final: 413,6 segundos (6 min 54 s), uma única chamada getUserMedia, 82 bloqueios locais de 120 ms, duas exceções OperationError e zero fechamentos de peer durante o ensaio.

- bufferedAmount nativo máximo: 261.992 B; máximo injetado: 300.000 B.
- Taxa normal: aproximadamente 96.000 B/s PCM e 97.600 B/s com cabeçalhos por receptor; mensagens de 1.952 B.
- Pausa de 7 s: fila atingiu 683.200 B, recuperou sem descartar blocos ou renegociar.
- Pausa de 20 s: fila máxima 1.048.224 B, abaixo do limite de 1.048.576 B; 923.296 bytes de pacotes novos recusados explicitamente (908.160 B PCM). Ressincronização limpa também o playout anterior.
- Espera máxima observada: 20.184 ms. Fila voltou a zero, ICE connected e canal open no mesmo peer.
- Dois underflows nas interrupções induzidas; ambos recuperaram após bufferização. Não há avaliação auditiva de Numark neste ensaio sintético.
- Contabilidade final: zero bytes PCM inexplicados entre produção, envio e descarte explícito.
- Jest: 92 testes aprovados em 10 suítes. ESLint: zero erros e avisos.
- Testes automáticos incluem cinco minutos de tempo virtual de produção/fluxo, FIFO real do worklet, preservação de ordem e resync.

Arquivos alterados: public/stream/pcm-worklet.js; src/stream/flow.js, transport.js, debug.js; src/StreamDisplay.js; src/stream/pcm.test.js, worklet.test.js, transport.test.js; STREAM.md.
Arquivos criados: src/StreamDiagnostic.js; src/StreamDiagnostic.test.js; src/stream/flow.test.js; STREAM-BACKPRESSURE.md.
Não houve deploy, commit ou push. Não foram alterados App.js, useStreamInput.js, artes, coordenadas, captura USB, MONITOR, SIGNAL ou sinalização.

Referências para a semântica dos erros e evento:
- https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/send
- https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedamountlow_event
