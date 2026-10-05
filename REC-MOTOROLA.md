# REC e LOAD no Motorola — 03/10/2026

## Resultado

REC mantém captura, PCM16, AudioWorklet e escrita progressiva anteriores. Após finalizar e validar WAV, grava metadados no OPFS e mantém o arquivo, sem apagá-lo ao navegar, desmontar ou recarregar. Cada arquivo recebe identificador UUID próprio; novas gravações não sobrescrevem antigas. A aplicação recupera os registros finalizados e oferece última gravação e um seletor simples das anteriores.

A confirmação abre automaticamente dentro do display aprovado: finalizando/aguarde; depois nome, duração, tamanho, SALVAR WAV, DESCARTAR com confirmação e player do próprio WAV. O botão VOLTAR avisa sobre exportação pendente, sem parar funções ativas. REC em andamento continua permitindo navegação normalmente.

## Exportação

Depois da finalização assíncrona, a ativação transitória do usuário pode ter expirado. Quando existe showSaveFilePicker, a confirmação já apresenta SALVAR WAV em destaque, para o toque necessário; usa startIn music e nome padronizado. Só informa escrita concluída depois que pipeTo fecha o writer com sucesso. Cancelamento/erro mantém WAV no aplicativo.

Sem essa API, solicita automaticamente download por link download; SALVAR WAV permite repetir. O navegador não fornece confirmação de conclusão desse download: a interface informa explicitamente essa limitação, sem alegar que o arquivo foi salvo externamente.

Não é possível impor silenciosamente Music/Retro VU. Quando o seletor permite, o usuário escolhe/cria essa pasta; no fallback o Chrome usa Downloads ou seu destino configurado. OPFS não é uma pasta pública do Android.

Solicita navigator.storage.persist, mas o navegador pode negar. Limpar dados do site, modo privado, remover dados do navegador e pressão de armazenamento podem afetar a retenção. O acervo pertence à origem: um novo domínio Quick Tunnel não vê arquivos do domínio anterior. Exportar é a cópia independente. Não há promessa de recuperação de gravação interrompida antes da finalização.

## LOAD

Histórico git (HEAD ccbd34b): accept=.mp3,.m4a,.wav,.flac,.aac; alteração anterior adicionou .webm. Não existia capture. .webm também é associado a vídeo no Android; isso é uma explicação compatível com o sintoma, não uma causa comprovada no Motorola por automação.

Agora detecta showOpenFilePicker: sugere Música, filtro explícito MIME de áudio com MP3/M4A/WAV/FLAC/AAC/WebM, sem captura. Isso abre documentos de áudio, não captura de câmera. Sem suporte, usa input accept=audio/*, sem capture. O navegador/provedor ainda decide a apresentação, a pasta inicial e o MIME dos arquivos; WebM classificado como vídeo pode não aparecer no fallback. No seletor moderno, a opção Todos os arquivos permite localizar um WebM com MIME incorreto mantendo a primeira abertura filtrada para áudio. O PLAYER e seus decodificadores não foram alterados.

Referências consultadas:
- https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker (gesto do usuário e startIn).
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Window.json (Chrome Android 132 para os seletores; implementação também detecta suporte real).
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file (accept/capture).

## Arquivos desta rodada

Alterados: src/App.js, src/useStreamRecorder.js, src/StreamRecording.js, src/StreamDisplay.css, src/recording/WavRecorder.js; testes src/useStreamRecorder.test.js, src/StreamRecording.test.js, src/recording/WavRecorder.test.js; documentação REC-WAV-1.0.md.

Criados: src/recording/archive.js e archive.test.js; src/recording/filePicker.js e filePicker.test.js; este relatório.

## Validação e limites

137 testes / 21 suítes passaram; ESLint sem erros/avisos; build de produção concluído (aviso fs.F_OK do CRA/Node). Cobertura de commit OPFS, recuperação, múltiplos arquivos, descarte isolado, exportação cancelada, escrita externa concluída, seleção WAV/WebM e fluxo REC/navegação existente.

Chrome desktop real, fonte sintética apenas no navegador: uma captura, WAV de 25,072 s; confirmação automática, arquivo e metadados no OPFS, reprodução imediata e novamente após recarga. Cancelamento de exportação simulado manteve arquivo. Interface conferida em viewport 390×844; confirmação rola dentro do display para acesso a todos os controles.

Não há Motorola disponível para automação. Chrome desktop não comprova o seletor Android nem o destino real do download. Prints mencionados não estavam acessíveis nesta mensagem.

## Roteiro físico

1. Abrir a versão atual no mesmo endereço HTTPS. Numark → TRANSMITIR → REC.
2. Após 30 s, REC novamente. Verificar FINALIZANDO e GRAVAÇÃO CONCLUÍDA, nome/duração/tamanho e indicador apagado.
3. SALVAR WAV: cancelar o seletor. Conferir mensagem de preservação e reproduzir o WAV no player (rolar a janela interna se necessário).
4. Recarregar o mesmo endereço, entrar STREAM e ouvir a última gravação recuperada.
5. Gravar outro trecho: ambas devem aparecer em Gravações preservadas. Conferir a anterior.
6. SALVAR WAV novamente: escolher destino, se oferecido. Caso use download, conferir manualmente sua conclusão em Downloads. Não descartar o original para esse teste.
7. VOLTAR: confirmar aviso. LOAD/ABRIR: verificar que aparecem documentos de áudio, selecionar WAV e PLAY. Repetir com WebM antigo. Se classificado incorretamente, usar Todos os arquivos no seletor moderno.
8. DESCARTAR: cancelar primeiro, depois confirmar somente em uma gravação de teste; a outra deve permanecer.

Sem deploy, commit, push ou serviços novos.
