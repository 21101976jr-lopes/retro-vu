# Retro VU 1.0 — entrega local e publicação pendente

> Registro da etapa anterior. O REC WebM e a validação abaixo foram substituídos pela entrega WAV descrita em [REC-WAV-1.0.md](REC-WAV-1.0.md). Consulte esse documento para o formato, limites e testes atuais. As pendências de publicação continuam válidas.

## Estado da entrega

STREAM PCM e modo noturno já aprovados fisicamente pelo usuário com Numark/Motorola e dois receptores. As adições desta entrega ainda precisam do teste físico final. Nenhum deploy, commit, push, criação de serviço ou configuração de credenciais foi executado.

## Auditoria dos seis botões

| Botão | Antes | Entrega |
| --- | --- | --- |
| TRANSMITIR | Liga/desliga USB e transporte | Preservado; ao desligar, solicita antes a finalização do REC local |
| RECEBER | Liga/desliga recepção; troca de papel encerra USB | Preservado; trocar de papel finaliza REC USB |
| PLAY / STOP | Apenas reprodução local no receptor, mantendo conexão | Preservado; no transmissor não controla o disco |
| MONITOR | Conecta/desconecta a fonte USB existente à saída normal do contexto | Preservado, independente do REC/rede; saída física escolhida no Android |
| REC | Sem handler; gravação existente somente no AudioDiagnostic | Agora grava a mesma MediaStream USB antes da rede |
| VOLTAR | Apenas navegação | Preservado, incluindo REC em andamento |

Captura, rede e REC são hooks de App, fora das telas condicionais. RADIO → VU → STROBE → STREAM não desmonta suas sessões. O modo noturno existente não foi alterado. Bloquear fisicamente a tela, matar o aplicativo ou trocar para outro aplicativo continua sem garantia de execução contínua.

## REC: formato, salvamento e limites reais

- Nesta versão, REC é **local no transmissor**. No receptor sem USB, informa que é necessário ativar a entrada USB; não grava o stream recebido nem abre microfone.
- MediaRecorder recebe diretamente `session.stream`. Não cria getUserMedia, AudioContext, segunda cadeia de captura ou rota de saída. Não depende do PCM transmitido nem do buffer receptor.
- Seleção de formato nativo suportado: WebM/Opus, WebM, Ogg/Opus, MP4 ou padrão do navegador. A extensão e MIME apresentados são os efetivamente produzidos. No Chrome real do ensaio: `audio/webm;codecs=opus`, `.webm`.
- **O arquivo local utiliza codec nativo, normalmente Opus com perdas. Não é WAV/PCM nem arquivo bit a bit do ADC.** Isso não altera o transporte, que continua PCM16 sem compressão perceptual.
- REC → grava; segundo REC → FINALIZANDO; somente após último `dataavailable`, `stop`, Blob não vazio e object URL criado aparece ARQUIVO DISPONÍVEL.
- ARQUIVO DISPONÍVEL abre reprodução de conferência, tamanho, duração aproximada de sessão, MIME e SALVAR ARQUIVO. O navegador decide a pasta/diálogo de download. Conferir o arquivo em Downloads/Arquivos e abri-lo depois.
- O aplicativo não declara que o arquivo foi salvo em disco; apenas que existe e pode ser baixado.
- Um arquivo de cada vez. Salve antes de REMOVER DA MEMÓRIA → CONFIRMAR REMOÇÃO para começar outro. Navegar entre as telas preserva o arquivo e a gravação.
- Chunks solicitados a cada 1 segundo. Limite de 128 MiB acumulados: finaliza REC e avisa; a última entrega pode ultrapassar um pouco o limite, pois `timeslice` não garante tamanho/periodicidade rígidos. Não limita a duração do STREAM.
- Os chunks/arquivo ficam em memória. Fechar/recarregar o aplicativo perde o que não foi baixado. Há aviso `beforeunload` quando suportado, mas ele não garante proteção contra fechamento forçado no Android. Sempre parar e salvar antes de fechar.
- Encerrar USB ou desconectar a track finaliza o REC; erro do gravador mantém eventual arquivo parcial com aviso para conferência. Arquivo vazio é falha, nunca sucesso.

## Visor e ponteiro RADIO

Cinco SVGs dentro da geometria existente (ondas, download, play, alto-falante, círculo REC), na ordem dos botões. Usam `currentColor` do tema. Baixa luminosidade=desligado; pulso suave=preparando; forte estável=ativo. Respeitam prefers-reduced-motion. REC só acende forte após o evento real `start`; finalização pulsa.

TRANSMITIR aguarda/pulsa durante negociação, fica forte em CONNECTED. RECEBER fica forte quando a sessão receptora está preparada (inclusive bufferizando/pausada); PLAY só fica forte em PLAYING. MONITOR reflete a conexão local confirmada. São estados da aplicação, não prova de entrega física de áudio numa caixa.

Ponteiro FM/progresso do RADIO: `useLiveProgress` usa `performance.now()`; 0→1 em 300.000 ms, 1→0 nos próximos 300.000 ms, módulo 600.000 ms. Começa na ativação de TRANSMITIR. Ao desativar, volta a usar a variável original `progress` do player. Não modifica arquivos musicais, posição de reprodução ou calibração dos VUs.

## PWA

- Manifest corrigido: Retro VU, id/start_url/scope `/`, standalone, pt-BR, fundo preto.
- Ícones existentes 192/512 e favicon preservados. Metadados HTML corrigidos.
- Instalação prevista pelo menu do Chrome Android e Chrome/Edge desktop em HTTPS estável; localhost serve somente para validação local. Outros navegadores podem ter opções diferentes.
- Sem service worker/cache offline nesta entrega. O Chromium atual pode instalar PWA sem service worker; não se promete abertura offline. Evita introduzir mistura de versões do protocolo/worklet e cache da sinalização nesta etapa.
- Não usar Quick Tunnel como instalação definitiva: o domínio muda. Instalar a partir do domínio HTTPS final após validar produção.
- `vercel.json`: preset CRA, build `npm run build`, saída `build`, revalidação de HTML/manifest/worklet. Sem rewrite genérico interceptando `/api/stream-signal`.

## Configuração manual — Upstash

1. Escolher/criar Redis REST compatível com comandos GET/EVAL/SET e script Lua CAS. Nada foi provisionado automaticamente.
2. Copiar REST URL e token com permissão de escrita para os segredos de servidor da Vercel. Token somente de leitura não serve.
3. Conferir limites/custos do plano e região antes de contratar. Polling já existente é de 750 ms por aparelho, cada ciclo usa pelo menos GET+EVAL (com possíveis repetições por concorrência). Três aparelhos ativos representam aproximadamente 14.400 requisições de sinalização/h e pelo menos 28.800 chamadas Redis/h; verificar como o plano contabiliza comandos Lua. Não presumir que quota gratuita suporta reprodução prolongada.
4. Nenhum áudio é armazenado no Redis: apenas presença/negociação. Namespace de produção deve ser diferente do preview para evitar encontros entre ambientes.

## Configuração manual — Vercel

1. Confirmar projeto/repositório corretos e diretório raiz, preset Create React App, `npm ci`, `npm run build`, pasta `build` e versão Node LTS suportada pelo ambiente. Nenhuma migração do CRA nesta rodada.
2. Configurar somente no servidor, para o ambiente apropriado:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `STREAM_ENABLED=true`
   - `STREAM_NAMESPACE` único (recomendado, diferente por ambiente).
3. **Não usar prefixo REACT_APP_ nesses segredos.** Não colocar valores no JSON de publicação, frontend ou repositório. `.env*` e `.vercel/` ignorados; dependências não mudaram.
4. Confirmar a função `/api/stream-signal` e inclusão de `server/signaling.cjs` no pacote. Sem configuração, a função recusa com 503; não usa memória de processo como produção fictícia.
5. Definir domínio HTTPS estável e acesso para os aparelhos. A versão pessoal não tem login/autorização por ouvinte: quem acessa a instalação pode entrar na sessão automática. Configurar a proteção de acesso do ambiente conforme uso pretendido; validação de Origin não autentica usuários.
6. Após autorização de deploy, validar função/Redis com dois aparelhos, renovação de presença, offer/answer/ICE e tráfego PCM. Build local não comprova Vercel/Upstash funcionando.
7. STUN existente preservado; sem TURN provisionado. Redes isoladas ou NAT restritivo podem impedir P2P. Não há garantia universal pela internet. Não trocar transporte sem diagnóstico.

## Teste físico final

1. Recarregar ambos os receptores e o Motorola no MESMO endereço de teste. Não usar instalação antiga de outro domínio.
2. Numark conectado e disco tocando: STREAM → TRANSMITIR. PC e segundo Android → RECEBER. Esperar buffer de 5 s e conferir áudio/ícones.
3. PLAY/STOP em um receptor: silencia somente ele; outro continua. MONITOR no Motorola: entrada/REC/rede seguem independentes; selecionar JBL no Android se necessário.
4. REC no Motorola: círculo REC forte e contador. Navegar VOLTAR → RADIO → VU → STROBE → VU → RADIO → STREAM. Verificar que gravação, monitor e receptores continuam.
5. No RADIO, verificar ponteiro inicial, meio aos 2,5 min, extremidade aos 5 min e retorno aos 10 min; VUs seguem reagindo ao áudio.
6. Ativar MODO NOTURNO com REC/rede ativos; esperar e tocar para retornar. Não bloquear fisicamente a tela.
7. REC novamente: aguardar ARQUIVO DISPONÍVEL → SALVAR ARQUIVO. Conferir Downloads/Arquivos e ouvir início/meio/fim. O teste de desconexão/reconexão de um receptor durante REC deve não contaminar o arquivo local.
8. Confirmar fim de captura finaliza eventual REC. Salvar antes de remover o arquivo/fechar. Desligar RECEBER nos receptores e TRANSMITIR no Motorola.
9. Após configuração e deploy autorizados, repetir no domínio definitivo, instalar pelo menu do navegador e repetir abertura/STREAM/REC em standalone. Essa fase ainda está pendente.

## Arquivos desta etapa

Alterados: src/App.js, src/App.test.js, src/StreamDisplay.js, src/StreamDisplay.css, public/manifest.json, public/index.html, package.json, package-lock.json (somente versão), .gitignore, STREAM.md.
Criados: src/useStreamRecorder.js, src/useStreamRecorder.test.js, src/useLiveProgress.js, src/useLiveProgress.test.js, src/StreamIndicators.js, src/StreamIndicators.test.js, src/StreamRecording.js, src/StreamRecording.test.js, src/StreamRecordingNavigation.test.js, vercel.json, RELEASE-1.0.md.
Build gerado localmente e ignorado pelo Git.

## Validação

- Jest: **115 testes aprovados em 16 suítes**, incluindo navegação completa com REC/MONITOR/USB/rede ativos.
- ESLint: **zero erros e zero avisos** (src, api, server, public/stream).
- Build de produção: **compilado com sucesso**. Aviso de depreciação fs.F_OK do CRA/Node, sem falha de build.
- Build servido em porta local isolada, RADIO/STREAM/VU/STROBE verificados, nenhum erro de página. Layout conferido a 390×844 e 844×390.
- Segundo ensaio real no build: **194,28 s**, 3.131.235 bytes WebM/Opus, mono, uma captura; gravação permaneceu ativa durante RADIO → VU → STROBE → VU → RADIO → STREAM e arquivo final decodificou corretamente.
- SHA-256: **28 arquivos protegidos idênticos** ao início desta etapa, incluindo captura, rede, sinalização, worklet, modo noturno, AudioDiagnostic e artes. Ícones existentes confirmados 192×192 e 512×512.
- Sem credenciais de produção verificadas/provisionadas; Vercel/Upstash e instalação no domínio final continuam pendentes.

 Ensaio de MediaRecorder real: 1.091.833 bytes, 67,74 s decodificáveis, mono, 48 kHz na decodificação, WebM/Opus, uma chamada getUserMedia com fonte sintética injetada somente no navegador de teste. Não substitui gravação física do Numark.

## Referências oficiais

- Instalação PWA: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- MediaRecorder e entrega final: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event
- Configuração Vercel: https://vercel.com/docs/project-configuration/vercel-json
- Variáveis de servidor: https://vercel.com/docs/environment-variables
- Upstash/Vercel: https://upstash.com/docs/redis/howto/vercelintegration
