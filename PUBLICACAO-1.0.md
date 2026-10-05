# Retro VU 1.0 — preparação para produção

Data: 03/10/2026. Nenhum commit, merge, push, deploy ou serviço foi criado. Fetch do GitHub foi somente para comparação. Este relatório substitui as orientações antigas de sessão global e ausência de Service Worker.

## 1. O que já estava pronto

React 19/CRA 5, USB compartilhado, PCM16/WebRTC confiável/ordenado, buffer de 5 s, três receptores, MONITOR, REC WAV progressivo em OPFS, recuperação das gravações, LOAD, quatro temas, VU/STROBE, modo noturno, agulhas/hotspots/artes. Manifesto Retro VU com id/scope/start_url `/`, standalone, fundo e tema #000000; ícones existentes 192/512 confirmados. Nada disso foi redesenhado.

O runtime Node foi fixado em 24.x, correspondente ao ambiente local validado (24.14.1). A função utiliza APIs nativas e Redis REST; não precisa de SDK Redis. CRA continua responsável pelo build; Express é usado apenas no servidor de desenvolvimento, fornecido pela árvore atual de react-scripts.

## 2. Privacidade implementada

Antes havia uma chave global Redis por namespace. Agora cada transmissão gera uma credencial aleatória de 256 bits em memória. SHA-256 dessa credencial é o convite de ouvinte; outro SHA-256 é o identificador usado na chave Redis. O servidor verifica a prova de posse do transmissor em cada requisição send. O convite compartilhado não revela a credencial de transmissor.

TRANSMITIR inicia sozinho e disponibiliza CONVITE PRIVADO no display. Copiar e enviar esse link é uma ação manual do usuário. O destinatário abre o link, entra em STREAM, toca RECEBER e confirma ENTRAR NA SESSÃO. Também pode colar o link no PWA já instalado. Nenhuma listagem pública ou descoberta entre salas diferentes. O convite via fragmento #stream não vai na URL HTTP; é enviado no corpo da sinalização por HTTPS. Após confirmar a entrada, o fragmento é removido do endereço.

Cada sala aceita um transmissor e até três receptores, inclusive quando receptores chegam antes do transmissor. Desligar e religar TRANSMITIR gera outro convite; uma interrupção/reconexão na mesma sessão mantém a credencial. Quem recebe o convite pode encaminhá-lo: é autorização por posse, não identificação pessoal nem DRM. Para revogar todos os ouvintes, desligar/religar TRANSMITIR e enviar o novo convite apenas aos autorizados.

Redis usa TTL de 120 s; presença de 30 s. Temporizadores existentes foram preservados. Foi acrescentada geração de sala: após expiração/recriação do estado Redis, a confirmação antiga das mensagens é reiniciada para não descartar novas ofertas. PCM, buffer, backpressure e limite de receptores não mudaram.

Sem contas, a API continua permitindo criar salas privadas; isso não é controle contra abuso de consumo. Antes de divulgação ampla, configurar limites/orçamento e proteção de tráfego na Vercel/Upstash conforme uso. Não há token de serviço no frontend.

## 3. PWA e atualizações

O build gera `/sw.js` com versão derivada do conteúdo real dos arquivos. Precache de 18 arquivos essenciais: HTML, JS/CSS, artes, ícones, manifesto e worklets/workers. API, convites no corpo HTTP, PCM, WAVs e URLs externas não são cacheados pelo Service Worker.

O shell abre offline depois da instalação bem-sucedida do cache. STREAM entre aparelhos exige rede e sinalização; offline não significa transmissão disponível.

A versão nova fica esperando. Não há skipWaiting automático durante áudio. Ao retornar ao app, verifica atualização; ATUALIZAÇÃO DISPONÍVEL aparece em STREAM. Para aplicar, parar captura/recepção/REC/player/MIC, fechar outras abas desse mesmo aplicativo e tocar o botão. Com áudio ativo, recusa a atualização. Com mais de uma janela do mesmo perfil/origem, pede fechamento das outras. O Service Worker só limpa caches de versões do shell; nunca toca OPFS ou localStorage. Se todas as janelas forem fechadas, a ativação natural também pode ocorrer.

Instalar uma vez no endereço definitivo e manter esse endereço. Mudança de domínio, de perfil do navegador, limpeza de dados e modo privado não preservam automaticamente acervo. Arquivos de Quick Tunnel não migram para a origem definitiva. Exportar WAVs importantes antes de abandonar o domínio antigo. Atualizações normais no mesmo domínio preservam acervo e preferência de cor.

## 4. Arquivos desta etapa

Criados: `.env.example`, `public/sw.js`, `scripts/build-pwa.cjs`, `src/pwa.js`, `src/PwaUpdate.js`, `src/pwa.test.js`, `src/StreamSession.js`, `src/stream/invitation.js`, `src/stream/invitation.test.js`, `src/stream/privateSessions.test.js`, este relatório.

Alterados: `package.json`, `package-lock.json`, `vercel.json`, `src/index.js`, `src/App.js` (somente indicação de áudio ocupado para atualização), `src/StreamDisplay.js`, `src/StreamDisplay.css`, `src/useStreamNetwork.js`, `src/stream/signaling.js`, `src/stream/transport.js` (somente passagem das credenciais), `server/signaling.cjs`, `src/StreamNavigation.test.js`, `src/StreamRecordingNavigation.test.js`.

25 arquivos protegidos comparados por SHA-256 permaneceram idênticos, incluindo artes, captura USB, REC, LOAD, worklet PCM, filas, modo noturno e agulha RADIO. Manifesto/ícones não precisaram mudar nesta rodada.

## 5. Validação feita e o que ainda não está validado

- 147 testes, 24 suítes, todos aprovados. Incluem isolamento, ausência de convite, tentativa de assumir transmissor, salas simultâneas, limite de três receptores, reconexão/expiração de estado e adapter Redis com resposta simulada compartilhada entre instâncias.
- ESLint sem erros/avisos, incluindo servidor, worker PWA e script de build.
- Build de produção aprovado; aviso de depreciação fs.F_OK do CRA/Node, sem falha. Precache gerado sem placeholders.
- Browser real no build local isolado: convite confirmado por outro navegador, PCM mono 48 kHz/16 bit chegando e BUFFER 5,0 s. A fonte USB desse ensaio era sintética, injetada só no navegador.
- PWA real: cache instalado, atualização impedida com STREAM ativo, atualização aplicada após parar, cache antigo removido e arquivo de teste OPFS preservado. Shell RADIO abriu com rede simulada offline.
- Rotas locais e estrutura Vercel verificadas: `/`, manifesto, `/sw.js`, assets e `/api/stream-signal`; sem rewrite genérico que intercepte API. Função inclui `server/**`, com cache no-store; worklets/worker/HTML/manifesto recebem revalidação.
- NÃO foi feito deploy nem teste real Vercel/Upstash, pois não há credenciais/configuração vinculada localmente. Simulação Redis e servidor local não comprovam produção.
- NÃO houve teste físico entre residências, rede móvel ou instalação Android nesta rodada. Esses testes continuam obrigatórios.
- npm audit: 80 alertas (3 baixos, 9 moderados, 68 altos, 0 críticos) na árvore atual; dependência direta sinalizada: react-scripts. Não aplicado audit fix --force (sugestão incompatível). É pendência de manutenção/avaliação antes de divulgação ampla; build e testes aprovados não equivalem a auditoria de segurança sem pendências. Não publicar o servidor de desenvolvimento na internet.

## 6. Conectividade externa e TURN: decisão pendente

ICE atual usa STUN stun.l.google.com:19302. Não há TURN contratado/configurado. Em CGNAT, NAT restritivo ou bloqueio de UDP, peers podem não conectar. O código conserva tentativa de conexão por 25 s, tratamento de desconexão de 10 s, fechamento/recriação do peer e recuperação do buffer; não existe relay alternativo automático sem TURN.

Alternativas, a decidir antes de implementar:

1. TURN gerenciado, por exemplo Cloudflare Realtime TURN: tarifa publicada de US$ 0,05/GB de saída para o cliente, com primeiros 1.000 GB/mês gratuitos compartilhados com SFU; conferir elegibilidade/condições na conta antes de habilitar. É serviço distinto de Quick Tunnel e não exige voltar a URLs temporárias. Integração deve emitir credenciais temporárias pelo servidor, sem token administrativo no frontend.
2. Coturn em VPS próprio: software livre; custos de VPS, transferência, IP/portas, certificados e manutenção. Mais trabalho operacional; valores dependem do provedor.

PCM mono 48 kHz/16 bits gera 0,3456 GB por hora por receptor, antes de overhead. Três receptores triplicam a transferência. Orçamento final depende da contabilização de ingress/egress e da parcela de conexões que usa relay. Não foi implementado nem contratado TURN. Sem ele, não declarar compatibilidade geral entre residências. Mesmo com TURN, teste físico continua necessário.

Fontes: https://developers.cloudflare.com/realtime/turn/faq/ e https://github.com/coturn/coturn .

## 7. Configuração externa manual

### Upstash

1. Entrar no painel Upstash e verificar se já existe banco Redis apropriado. Reutilizar somente se autorizado e com namespace separado.
2. Se precisar criar, revisar plano/franquia/preço antes de confirmar. Não foi criado banco nesta etapa.
3. Selecionar região próxima da função Vercel e copiar REST URL e token com escrita para os campos secretos da Vercel. Não colar token no chat, frontend ou GitHub.
4. Guardar produção e preview separados por banco ou, no mínimo, namespace; preview nunca deve usar o mesmo namespace da produção.
5. Verificar GET, EVAL e SET permitidos e acompanhar consumo. Polling atual tem intervalo base de 750 ms: quatro aparelhos equivalem aproximadamente a até 19.200 chamadas HTTP/h em regime normal, com pelo menos GET + EVAL por chamada e mais em concorrência. A cobrança dos comandos internos do script depende do provedor. Não prometer franquia gratuita suficiente para uso prolongado.

Preço consultado: https://upstash.com/pricing/redis — Pay as You Go US$ 0,20/100 mil comandos. O plano Free consultado informa 500 mil comandos/mês e 256 MB; não assumir custo zero para todo uso.

### Vercel

1. Confirmar conta/projeto e escolher um domínio estável de produção antes da instalação. Pode ser o alias estável `nome-do-projeto.vercel.app`; não usar URL identificadora de cada deployment ou preview. Domínio próprio é opcional.
2. **Vincular/importar GitHub ou fazer push pode iniciar deploy. Só realizar depois da autorização expressa.** Não há evidência local de qual projeto já está vinculado na conta.
3. Configuração: repositório 21101976jr-lopes/retro-vu; raiz do repositório; preset Create React App; Node 24.x; install `npm ci`; build `npm run build`; saída `build`. O segundo comando do build gera o Service Worker final; não substituir o build por react-scripts isoladamente.
4. Em Settings → Environment Variables, adicionar para Production:
   - UPSTASH_REDIS_REST_URL = URL real do banco.
   - UPSTASH_REDIS_REST_TOKEN = token REST real com escrita.
   - STREAM_ENABLED = true.
   - STREAM_NAMESPACE = retro-vu-production (ou outro identificador estável exclusivo).
5. Preview: STREAM_ENABLED=false até haver ambiente de teste separado; se habilitar, usar namespace diferente. Variáveis sem prefixo REACT_APP_. Nunca usar REACT_APP_STREAM_ICE_SERVERS para segredo TURN permanente.
6. Verificar HTTPS/certificado e políticas de acesso do projeto. Avaliar alertas de consumo e proteção de tráfego antes de compartilhar amplamente.
7. Após deploy autorizado, verificar logs da função, acesso Redis e teste em dois aparelhos. Sem variáveis, POST responde 503 de forma explícita, sem armazenamento local fictício. GET nessa rota retorna 405 por ser uma API POST.

## 8. GitHub e publicação — executar apenas após autorização

A branch local é main; base local ccbd34b. origin/main consultada em 35e3adf, com seis commits adicionais. Alterações funcionais remotas de microfone/fade/ícones já estão presentes na cópia local. Há também cópias de ícones na raiz do remoto. Não foi feita integração de histórico.

Procedimento seguro, a executar com revisão:

1. Fazer backup da cópia completa atual e revisar diff/arquivos não rastreados. Não usar git add . sem revisar: existe arquivo vazio `x.label))` e uma imagem avulsa antiga em public que não são parte desta preparação.
2. Após autorização de commit, selecionar código/configurações/assets/documentação necessários; conferir `git diff --cached --stat` e ausência de segredos. Incluir todos os módulos de STREAM/REC ainda não rastreados, além dos arquivos desta etapa. Não incluir node_modules, build, .env com valores ou .vercel.
3. Commit da entrega local. Buscar novamente origin/main e integrar por merge normal, preservando os seis commits remotos e a implementação local. Se houver conflito, revisar e rodar novamente testes, ESLint e build; não usar force push ou reset destrutivo.
4. Após autorização de push/publicação e confirmação do comportamento de deploy automático, push normal de main. Se Vercel já estiver vinculada, esse push pode publicar imediatamente; por isso variáveis, domínio e política de publicação devem estar prontos antes.
5. Se ainda não houver projeto Vercel, importar o repositório já atualizado, aplicar a configuração acima e autorizar o primeiro deploy. Não clicar Deploy antes dessa aprovação.
6. Confirmar produção READY, HTTPS, manifesto/ícones/worker, sinalização Redis e STREAM por convite. Só então compartilhar o endereço definitivo para instalação.

## 9. Instalação no Motorola e teste externo

1. Exportar gravações importantes do endereço antigo antes de abandoná-lo, quando ainda acessível. OPFS não migra entre domínios.
2. Abrir o endereço HTTPS estável de produção no Chrome atualizado.
3. Menu ⋮ → Instalar aplicativo / Adicionar à tela inicial → Instalar, conforme a interface do Chrome. Confirmar nome Retro VU, ícone original e abertura standalone com fundo preto.
4. Não reinstalar a cada versão. Para atualizar: parar áudio/REC/STREAM, fechar outras abas do Retro VU, abrir STREAM e tocar ATUALIZAÇÃO DISPONÍVEL quando surgir. Não limpar dados do site para atualizar.
5. Teste doméstico inicial: Numark → TRANSMITIR → CONVITE PRIVADO. Em outro aparelho, abrir/copiar convite, RECEBER → ENTRAR NA SESSÃO → aguardar buffer. Confirmar VU e navegação sem interrupção.
6. Isolamento físico: outro transmissor gera outro convite; cada receptor só deve ouvir sua sessão. Testar três receptores e recusa do quarto.
7. Teste externo real: receptor fora do Wi-Fi doméstico (outra residência/rede móvel), com convite. Registrar conexão e comportamento após queda/reconexão. Se ICE não conectar, avaliar TURN antes de declarar funcionamento pela internet.
8. REC → finalizar → conferir arquivo; atualizar normalmente o PWA; confirmar gravação recuperada e tema preservado no mesmo domínio.

## Decisão de prontidão

Preparação local funcional concluída e testada. Ainda NÃO é publicação definitiva validada: faltam configuração/validação real Vercel+Redis, integração do histórico Git, decisão sobre dependências sinalizadas, autorização para publicar e teste físico externo. TURN depende da decisão de compatibilidade/custo. Nenhum custo foi contratado; não é obrigatório comprar domínio ou licença do aplicativo, mas uso de infraestrutura pode gerar cobrança conforme plano/volume.
