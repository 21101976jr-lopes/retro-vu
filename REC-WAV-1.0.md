# Atualização de salvamento e LOAD

Consulte [REC-MOTOROLA.md](REC-MOTOROLA.md): o WAV finalizado agora é preservado no acervo OPFS e recuperado após recarga. As referências abaixo à remoção automática na desmontagem descrevem a etapa anterior.

# REC WAV e paletas — 03/10/2026

## Implementação

REC compartilha `session.source` e o AudioContext da captura USB existente. Um AudioWorklet exclusivo do REC converte o PCM em inteiros assinados de 16 bits little-endian, sem codec perceptual. Não abre getUserMedia nem recebe o áudio de MONITOR, receptor ou rede. O transporte STREAM permaneceu inalterado.

O formato usa o sample rate efetivo do AudioContext e a quantidade real de canais da captura (mono ou estéreo). Se a frequência da entrada diferir da frequência do contexto, continua existindo a conversão já feita pelo Web Audio; não se promete cópia bit a bit do ADC. Não se duplica mono.

Blocos de 4096 frames são transferidos para um worker que escreve incrementalmente em arquivo OPFS com FileSystemSyncAccessHandle. Há quatro créditos de transferência e fila de aproximadamente dois segundos, sem acumular um LP inteiro em arrays JavaScript. A finalização drena a fila, atualiza RIFF/WAVE PCM formato 1, 16 bits, e fecha o arquivo. A validação confere cabeçalho, tamanho e duração, e decodifica amostras de até um segundo do início e do fim antes de anunciar ARQUIVO DISPONÍVEL. Não decodifica o LP completo na memória.

O arquivo é `audio/wav`, com nome `Retro-VU-AAAA-MM-DD-HHMMSS.wav`. A tela de arquivo existente permite ouvir e salvar. Desligar TRANSMITIR ou trocar para RECEBER aguarda a finalização antes de encerrar a fonte. Navegação interna não encerra REC.

## Limites reais

- PCM mono de 48 kHz: 96.000 bytes/s; 60 minutos ocupam cerca de 345,6 MB. Estéreo dobra esse valor.
- Limite: o menor entre espaço estimado disponível menos 16 MiB e 2 GiB por arquivo (menos cabeçalho). Com espaço suficiente, equivale a aproximadamente 6h12 em mono/48 kHz.
- A estimativa de quota não garante espaço físico. Falta de espaço ou escrita lenta encerra REC com aviso; quando possível, disponibiliza apenas o trecho contínuo corretamente escrito. Erro de validação não anuncia sucesso.
- Exige HTTPS/localhost, AudioWorklet e OPFS com escrita síncrona em worker. Não existe fallback para codec com perdas ou crescimento ilimitado de RAM.
- OPFS é armazenamento temporário privado da origem, não a pasta Downloads. É necessário SALVAR ARQUIVO para ter uma cópia independente. Remover o arquivo ou desmontar normalmente libera o temporário.
- Fechamento forçado, recarga ou encerramento do Android não possuem recuperação garantida; podem deixar arquivo temporário órfão consumindo quota. Pare e salve antes de fechar. O aviso de saída não é garantido no Android.
- A criação do File/Blob e o download dependem do navegador; não se promete consumo zero de memória pelo navegador.

Referências: [OPFS em worker](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle), [estimativa de quota](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate).

## Paletas e importação

Ciclo: verde → branco → vermelho #D91A00 → azul-ciano #00A6B5 → verde. Verde e branco mantêm os valores anteriores. A chave localStorage existente persiste as quatro escolhas. REC ativo/finalizando permanece vermelho em todos os temas. Não foram alteradas geometria, arte ou posição do COLOR.

LOAD aceita MP3, M4A, WAV, FLAC, AAC e WebM. A reprodução continua pelo decodificador nativo do navegador, incluindo WebM legado suportado no Chrome.

## Arquivos desta rodada

- Alterados: src/App.js, src/useStreamRecorder.js, src/StreamDisplay.js, src/StreamDisplay.css.
- Criados: public/recording/pcm-recorder.js, public/recording/wav-writer.js, src/recording/WavRecorder.js, src/recording/wav.js.
- Testes criados/atualizados: src/recording/{WavRecorder,wav,recorderWorklet}.test.js, src/useStreamRecorder.test.js, src/App.test.js, src/StreamDisplay.test.js, src/StreamRecording.test.js, src/StreamRecordingNavigation.test.js.
- Documentação: RELEASE-1.0.md e este arquivo. Build gerado localmente.

## Validação

130 testes aprovados em 19 suítes. ESLint sem erros/avisos em src, api, server e worklets/workers públicos. Build de produção compilado com sucesso; apenas aviso de depreciação fs.F_OK do ambiente CRA/Node.

Ensaio em Chrome com fonte sintética injetada somente no navegador: uma captura, WAV mono PCM16/48 kHz, 55,04 segundos, 5.283.884 bytes. Reprodução imediata funcionou. Arquivos WAV e WebM legado foram baixados, reimportados pelo LOAD e reproduzidos pelo PLAYER sem erro. As quatro cores foram verificadas, inclusive REC vermelho independente do tema.

Teste automatizado de 45 minutos de escrita simula o armazenamento; não equivale a um LP físico gravado. Os 26 arquivos protegidos conferidos por SHA-256 (captura, rede, sinalização, artes, modo noturno, indicadores e AudioDiagnostic) permaneceram idênticos. O Numark/Motorola ainda exige o teste físico abaixo.

## Teste físico no Motorola

1. Recarregar a versão atual pelo endereço HTTPS de teste. Conectar Numark e iniciar o disco.
2. STREAM → TRANSMITIR. Confirmar USB AUDIO e SIGNAL.
3. REC. Confirmar indicador vermelho e contador; gravar ao menos um minuto.
4. Navegar RADIO/VU/STROBE e voltar a STREAM. Verificar continuidade; testar os quatro temas.
5. REC novamente. Aguardar FINALIZANDO/VALIDANDO WAV e ARQUIVO DISPONÍVEL.
6. Abrir ARQUIVO DISPONÍVEL e reproduzir a gravação. Conferir começo e fim.
7. SALVAR ARQUIVO. No app Arquivos/Files, procurar Downloads e o nome Retro-VU-...wav.
8. RADIO → LOAD/ABRIR → Downloads → selecionar esse WAV → PLAY. Repetir importação com uma gravação WebM antiga.
9. Após esse ensaio, remover o arquivo da memória somente depois de salvá-lo; testar um lado de LP, com MODO NOTURNO e espaço livre suficiente. Conferir duração e início/meio/fim do WAV salvo.

Sem deploy, commit, push ou contratação/configuração de serviços.
