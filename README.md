# Quem Sou Eu?

Jogo web multiplayer em tempo real: cada jogador tem o nome de um personagem colado na testa, vê o personagem de todos **menos o próprio** e precisa descobrir quem é.

Stack: React 18 + Three.js (React Three Fiber) + Tailwind no cliente; Node + Express + Socket.io no servidor. Sons sintetizados com a Web Audio API (nenhum arquivo de áudio).

## Como jogar

1. Na tela inicial só existem **Criar Sala** e **Juntar à Sala** (ambas pedem nickname).
2. O **Host** é um jogador comum (tem boneco, personagem, vidas e turnos). Ele cadastra, edita e remove personagens e vê quantos já tem.
2b. O Host pode **adicionar e remover bots** no lobby (jogadores controlados pelo servidor, até 10 no total). Bots não enviam sugestão: recebem personagem da lista do host e jogam pelas mesmas regras. Se só houver bots na sala, o personagem do Host também sai da lista (por isso ela precisa de um nome a mais).
2d. **Modos de partida** (escolhidos ao criar a sala; o host pode trocar no lobby): **HOST ESCOLHE** (o fluxo original: lista do host + 1 sugestão por jogador, aceita bots) e **CADA UM ESCOLHE** (todos, inclusive o host, escolhem 1 personagem; as escolhas são embaralhadas de modo que ninguém recebe a própria; não há bots; personagem repetido é recusado). Trocar de modo descarta as escolhas já enviadas.
2e. **CADA UM ESCOLHE VÁRIOS** (terceiro modo): cada jogador escolhe de 1 a 3 personagens diferentes. Ao iniciar, o servidor faz o 1º sorteio (exatamente 1 de cada seleção, sem repetir personagem entre jogadores) e o 2º (distribui os sorteados entre os jogadores; ninguém recebe o sorteado da própria seleção, nem nome que esteja na própria lista quando isso for possível). Se não houver combinação válida (ex.: todos só listaram o mesmo nome), o host é avisado antes de iniciar. Sem bots. A tela mostra uma animação dos dois sorteios sem revelar nenhum personagem.
2f. **MODO EM TIMES** (quarto modo, identificador `teams`): veja a seção "Modo em times" abaixo.
2c. **Correção de nome tolerante**: aceita erros de digitação, letras trocadas e grafias parecidas (ex.: "Epstein" ≈ "Episten"), sempre com o nome completo. **Caderneta**: é limpa automaticamente a cada nova partida (e preservada ao recarregar a página).
3. Cada outro jogador envia **uma** sugestão de personagem antes do início. Ninguém vê as sugestões dos outros nem a lista do host.
4. Ao iniciar, o servidor sorteia uma sugestão para o Host e distribui a lista do host entre os demais, sem repetição.
5. Em cada turno de 30 s o jogador tem só duas ações: **Chutar** (nome completo; tolera acento, maiúscula, pontuação e pequenos erros de digitação) ou **Passar a Vez** (encerra na hora e passa para a direita). Esgotar o tempo passa a vez sem perder vida. Chute errado custa uma vida; sem vidas, o jogador é eliminado e pulado. Vence quem acertar primeiro.

### Modo em times (`teams`)
Escolhido ao criar a sala (ou no lobby pelo host). Funciona com 2 ou de 4 a 10 jogadores (desabilitado com 1 ou 3). Sem bots.

1. **Escolha:** cada jogador, inclusive o host, escolhe 1 personagem (não pode repetir).
2. **Times:** ao iniciar, o servidor divide os jogadores ao acaso em Time 1 e Time 2, de forma equilibrada; com número ímpar, sorteia qual time fica com 1 a mais.
3. **Distribuição:** as escolhas de um time vão para jogadores do time adversário, ao acaso. Ninguém recebe o próprio personagem nem o de um colega de time. Se o time de origem tem mais escolhas que o adversário tem jogadores, o excedente é descartado.
4. **Seleção adicional (times desiguais):** sobra 1 vaga no time maior. A tela mostra "ESCOLHA UM PERSONAGEM PARA O JOGADOR N DO TIME X": cada integrante do time menor sugere 1 personagem, o servidor sorteia uma sugestão válida (que não repita um personagem já em jogo) e descarta as outras. A partida começa sozinha em seguida. Sair da sala cancela o sorteio; o host também pode cancelá-lo. Durante essa etapa ninguém novo entra.
5. **Rodadas:** começa pelo Time 1 e os turnos alternam entre os times; quem já acertou ou foi eliminado é pulado. Ações: Passar a vez e Chutar (como nos outros modos). Vidas, tempo de 30 s e chute errado continuam iguais.
6. **Acertou:** o jogador fica "concluído" (selo ✓ ACERTOU na mesa e na lista), sai das rodadas e a partida **não** acaba. Vence o primeiro time em que **todos** acertarem. Se um integrante de cada time for eliminado (vidas ou saída), nenhum time pode vencer e a partida termina empatada.
7. Os personagens secretos continuam sem chegar ao cliente do dono (só depois de acertar, ser eliminado ou no fim).

## Rodar

```bash
npm run install:all
npm run dev          # servidor :3001 + cliente Vite
npm test             # 163 testes do servidor
npm run build && npm start   # produção: o servidor serve client/dist
```

Há `Dockerfile` pronto para deploy. Para testar vários jogadores no mesmo navegador, use abas diferentes (a sessão fica em `sessionStorage`).

## Arquitetura

- `server/game/Room.js`: regras do jogo, sem dependência de socket. Tudo é decidido no servidor (sorteio, distribuição, ordem, tempo, chutes, vidas, eliminações, vitória). `viewFor(jogador)` monta a visão personalizada: o próprio personagem **nunca** é enviado (só após eliminação ou fim da partida).
- `server/game/fuzzy.js`: normalização + distância de Levenshtein.
- `server/net/gameServer.js`: eventos Socket.io. `server/server.js`: HTTP + estáticos.
- Prazo do turno é um horário absoluto do servidor (`deadline`), então recarregar ou reconectar não reinicia o relógio. Cada turno tem um `turnId`: cliques duplicados ou atrasados são rejeitados.
- Se o Host desconecta, a sala espera (60 s no lobby, 5 min em jogo) e fecha; **não há transferência de autoridade**.
- `client/src`: `game/GameContext` (estado e ações), `screens/`, `hud/` (ações, caderneta), `three/` (ambiente, bonecos animados, câmera), `audio/` (efeitos sintetizados).

## Testes

`server/test/room.test.js` (regras) e `server/test/network.test.js` (4 jogadores simulados sobre sockets falsos: criar/entrar/reconectar, sorteio, turnos, visibilidade). O cliente 3D não tem testes automatizados.

### Tema dos menus
Botão ☾/☀ no canto superior direito de Home e Lobby (ao lado do som) alterna claro/escuro. A escolha fica salva no navegador (`qse-theme`); sem escolha, segue o tema do sistema. Só afeta os menus (`client/src/theme.js`, `components/ThemeToggle.jsx`, bloco `html.dark [data-menu]` em `index.css`); a partida mantém o visual atual. Verificado apenas por checagem de sintaxe; o resultado visual no cliente real não foi renderizado aqui.

### Otimizações de desempenho
- **NPCs:** geometrias e materiais compartilhados entre todos (antes ~450 geometrias e ~200 materiais por NPC/malha).
- **Sombras:** mapa redesenhado a cada 3 quadros (uma única luz com sombra, cena quase estática).
- **Resolução:** limite de 1,5x (antes 2x); o PerformanceGuard desce em etapas se o FPS ficar abaixo de 45: 1x, depois 0,75x, depois sem sombras.
- **React:** ambiente (cadeiras/mesa/bar) e bonecos só re-renderizam quando algo que usam muda; antes refaziam tudo a cada evento do servidor.
- **Build/servidor:** chunks separados (three, r3f, react) com cache longo, gzip em memória para JS/CSS e `index.html` sem cache.
- **Não medido:** não consegui rodar o 3D nem o build neste ambiente (sem npm/GPU), então os ganhos de FPS NÃO foram medidos. As mudanças foram checadas por sintaxe (esbuild) e os 116 testes do servidor passam; o gzip do servidor não foi executado (Express não está instalado aqui).

### Regra de fim da partida (modos padrão)
No lobby o host escolhe (`settings.endRule`, evento `room:settings`), em HOST ESCOLHE, CADA UM ESCOLHE e CADA UM ESCOLHE VÁRIOS (não vale para o modo em times, que tem regra própria):
- **`first` (padrão):** a partida acaba quando alguém acerta (comportamento anterior).
- **`last`:** quem acerta sai das rodadas (`done`, vê o próprio personagem, nunca recebe turno). Acaba quando só resta 1 jogador sem acertar (o "último a descobrir"). Quem é eliminado por vidas continua contando como "sem acertar"; se todos os que faltavam forem eliminados, a partida acaba sem último definido. `result` traz `endRule`, `loserId` e `order` (ordem dos acertos).

**Último com vida:** nos modos de chute (não em times nem impostor), se só um jogador continuar sem ser eliminado (os outros perderam todas as vidas ou saíram da sala), a partida acaba e ele vence. Com chute errado, a pausa do resultado é exibida antes do fim. `result` traz `lastStanding: true`; no fim `last` mantém `endRule` e `order`.
Testes: 8 novos em `server/test/room.test.js` (111 no total, 3 execuções seguidas sem falhas). A interface do cliente real foi checada só por sintaxe; a prévia foi exercitada no Chromium (sem o 3D).


### Cores dos times
Time 1 = vermelho, Time 2 = azul (`client/src/game/teams.jsx`). O papel do personagem na testa de cada boneco usa vermelho claro (Time 1) ou azul claro (Time 2); fora do modo em times continua amarelo. Cor verificada apenas no código/prévia (3D real não renderizado aqui).

### Personalização do boneco
Botão "Personalizar meu boneco" no lobby abre o menu (`client/src/components/LookMenu.jsx`, com pré-visualização 2D): 10 cores, 6 chapéus (nenhum, boné, gorro, cartola, coroa, festa) e 3 opções de pescoço (nenhum, cachecol, gravata-borboleta). Cada escolha vai ao servidor (`player:look`), que só aceita ids da lista (`server/game/look.js`); todos veem o boneco dos outros no lobby e na mesa 3D (`three/Accessories.jsx`). Só é possível mudar no lobby; o visual permanece em "nova partida" e fica salvo no navegador (`qse-look`) para ser reaplicado ao entrar em outra sala. 4 testes novos (3 de sala + 1 de rede).
Verificação: servidor testado de verdade; cliente só por sintaxe; os acessórios 3D não foram renderizados aqui (posição de chapéu/cachecol em relação ao papel na testa pode precisar de ajuste fino ao ver na tela).

### Chute por parte do nome
"Remy" para o personagem "Remy Ratatouille" agora acerta. Regra (`server/game/fuzzy.js`, `isGuessCorrect(chute, resposta, { others })`): vale um trecho contínuo do nome (mantendo a tolerância a erros de digitação) se NÃO servir também para outro personagem em jogo (ex.: "Homem" não vale se há Homem-Aranha e Homem de Ferro na partida) e se não for só palavra de ligação ("de", "da"...) nem tiver menos de 3 letras. Sem a lista `others` a função continua exigindo o nome completo. 4 testes novos (116 no total, 3 execuções seguidas sem falha).

### Correção: tela toda branca ao entrar na partida
Causa: na otimização dos NPCs, `Npcs.jsx` passou a criar geometrias por `geo('plane', …)`, mas o tipo `plane` não estava registrado, o que gerava um erro ao desenhar a mesa e derrubava o app inteiro (tela branca). Corrigido, com mensagem de erro explícita para tipo não registrado e um `SceneBoundary` que mostra o erro da cena 3D em vez de uma tela branca. Verificado: todos os tipos usados (box, capsule, cone, cylinder, plane, sphere, torus) estão registrados e uma análise estática (tsc) não achou identificadores indefinidos nos 32 arquivos do cliente. Não renderizei o 3D aqui, então a confirmação visual é sua.


### Mais opções de visual + bilhete sempre acima do chapéu
O menu "Personalizar meu boneco" agora também tem **Roupa** (camiseta, moletom, terno, avental), **Cor da roupa** (12 cores) e **Rosto** (óculos, óculos escuros, bigode), além de cor, chapéu e pescoço. O servidor valida todos os ids (`server/game/look.js`); 1 teste novo (116 no total, 3 execuções seguidas sem falha).
O **bilhete** com o personagem fica na testa e NA FRENTE do chapéu (`paperPose` em `three/Accessories.jsx`: afastado para z 0,235, além da aba/cúpula, que chegam a 0,19), então nenhum chapéu cobre o papel; com óculos o papel sobe um pouco para não cobrir os olhos. A etiqueta de nome do peito e a gravata-borboleta são afastadas quando há roupa. 
Verificação: desenho 2D (SVG) das combinações conferido por captura de tela; a cena 3D (roupas, mangas, rosto e a nova posição do bilhete) NÃO foi renderizada aqui. O teste com um 3D simulado achou e eu corrigi um erro de ordem de variáveis na prévia, mas só a tela real mostra se as proporções ficaram boas.

### Tema escuro na página inteira
`html.dark` agora também pinta `html`, `body` e `#root` (as laterais fora do cartão central ficavam bege). Continua só nos menus; a partida mantém seu visual. Verificado por leitura de CSS/captura da prévia; o cliente real não foi renderizado aqui.

## Seletor de modos (cartões ilustrados)

O seletor (`client/src/components/ModePicker.jsx`) mostra 3 cartões de categoria (MODOS PADRÃO, MODOS DE TIME, MODOS DE IMPOSTOR). Clicar em uma categoria abre uma nova "aba" só com os cartões dos modos dela e sem botão extra: na criação de sala, o **Voltar** padrão do formulário volta da aba de modos para a lista de categorias e, na lista, para a tela criar/entrar; no lobby o seletor mostra um botão branco "← Voltar" só dentro da aba de modos (volta para as categorias) e nenhum na lista de categorias; clicar num cartão seleciona o modo (o mesmo `onChange`/`settings.mode` de antes — regras, configurações e servidor não mudaram). A arte dos cartões são as imagens criadas pelo autor do projeto, recortadas em `client/src/assets/modes/*.png` (todas 820×361, com borda preta uniforme e cantos arredondados refeitos) (o texto de cada cartão faz parte da imagem; os botões têm `aria-label`). "Modo em times" continua desabilitado com 1 ou 3 jogadores.

## Modos de impostor

O seletor de modos tem 3 categorias: **MODOS PADRÃO** (host escolhe, cada um escolhe, cada um escolhe vários), **MODOS DE TIME** (em times) e **MODOS DE IMPOSTOR** (os três abaixo). Os modos antigos não mudaram.

**Configuração (host, no lobby; só aparece o que vale para o modo):**
- *Quem escolhe o personagem dos inocentes?* **IA escolhe** (o servidor sorteia de uma lista interna de ~65 personagens; não há IA generativa; o host joga e pode ser impostor) ou **Host escolhe** (o host digita o personagem e vira **espectador**: sem papel, sem turnos, sem voto, não pode ser eliminado nem impostor, fora de todas as contagens).
- *O que o impostor recebe?* a palavra **IMPOSTOR** (ele sabe) ou **outro personagem** (ele não sabe que é impostor; sorteado pela IA, ou digitado pelo host espectador, e precisa ser diferente do dos inocentes).
- *Quem é o impostor* (modos de 1 impostor): sorteio automático ou o host escolhe um jogador.
- *Rodadas de turnos antes de cada votação* (1 a 5, padrão 1): cada jogador ativo joga esse número de vezes antes de CADA votação, inclusive depois de empate ou eliminação.
- *Quantidade de impostores* (múltiplos) e *"Impostores sabem quem são seus aliados?"* (só com folha de personagem; com a palavra IMPOSTOR fica desabilitado e o servidor ignora o pedido).
- Validação (o início é bloqueado com mensagem clara): mínimo de **3 participantes** (espectador não conta); inocentes sempre em maioria estrita sobre os impostores (vale também para a palavra IMPOSTOR, senão a partida nasceria decidida); personagens obrigatórios quando o host escolhe; impostor escolhido precisa estar na partida. Modos de impostor não aceitam bots.

**Fluxo:** folha secreta (cada um vê só a sua, escondida até pedir "Ver minha folha"; "Entendi" de todos ou 15 s) → rodada de turnos de 30 s (ordem aleatória no começo, depois no sentido dos assentos; só **Passar a Vez**, sem chute; quem está offline é pulado) → votação (45 s; quem não vota se abstém) → resultado na folha por 6 s → fim ou nova rodada.

**Votação:** um voto por jogador ativo, em outro jogador ativo (sem voto em si mesmo, em eliminado ou do espectador; duplicado recusado pelo servidor). Elimina quem tem **mais votos que qualquer outro**. **Empate (ou ninguém votou): ninguém sai, a partida não termina, vai direto para mais uma rodada de turnos e depois nova votação com todos os ativos** (nunca desempate restrito).

| Modo | Inocentes vencem | Impostor(es) vencem |
|---|---|---|
| IMPOSTOR — ELIMINAÇÃO | impostor eliminado | restam 2 (impostor + 1 inocente) |
| IMPOSTOR — VOTAÇÃO ÚNICA | impostor eliminado | inocente eliminado |
| IMPOSTORES — MÚLTIPLOS | todos os impostores eliminados | impostores restantes = inocentes restantes |

Quem sai da sala no meio da partida deixa de contar; se isso decidir a partida (regra genérica: sem impostores → inocentes; impostores ≥ inocentes → impostores), ela termina.

**Privacidade:** `viewFor` nunca manda papel nem personagem de ninguém durante a partida (`players[].character/role` são `null`); cada jogador recebe só `you.sheet` (a própria folha e, se permitido, os aliados). O espectador não recebe folha; no lobby o host vê apenas o que ele mesmo configurou. Papéis só aparecem no fim (`result.impostor`). Eventos do Socket.io não carregam segredos.

**Folha de votação 3D** (`client/src/three/VoteSheet*.js*`): segue a imagem de referência (fundo cinza, retrato com moldura preta, "JOGADOR" embaixo — o apelido vem logo abaixo —, caixa de voto menor ao lado e "IMPOSTOR"). Retratos são desenhados em 2D a partir do visual escolhido no menu de personalização. O **X vermelho** é uma textura própria (dois traços curvos de marcador), num plano maior que a caixa e em camada acima dela, sem recorte: as pontas passam das bordas. Durante a votação a câmera faz uma transição suave para uma visão de cima que enquadra a folha (e volta depois). Dá para votar clicando no registro na folha ou na lista do painel e confirmando.

**Testes novos:** `server/test/impostor.test.js` (43 testes: distribuição, validação, privacidade, turnos, votação, empates, vitórias dos 3 modos com host jogando/espectador, saída no meio, e 2 partidas por handlers de rede com vários clientes) e `server/test/votesheet.test.js` (geometria: pontas do X fora da caixa e dentro do quadro da textura; registros sem sobreposição de 3 a 10 jogadores).

## Modo JULGAMENTO

Categoria **JULGAMENTO** no seletor, com dois modos: **O JULGADOR** (humano) e **O JULGADOR (IA)**.

**Rodada:** tema → cada jogador responde uma vez → respostas anônimas e embaralhadas (A, B, C…) → o Julgador escolhe → revela-se a vencedora e depois os autores → 1 ponto. O host define o número de rodadas (1–10). Empate no 1º lugar: rodadas de desempate só entre os empatados, até sobrar um líder.

**O JULGADOR (humano):** mínimo 3 jogadores; escolhido por sorteio ou pelo host (a lista inclui o próprio host). Escreve o tema e não responde. Enquanto julga, todos o veem com o visual fixo (boneco amarelo-claro com coroa); o visual personalizado dele não é alterado nem apagado.

**O JULGADOR (IA):** mínimo 2 jogadores; um robô-TV fica no centro da mesa (parado / computando). A IA cria temas originais (não há lista), classifica o tema como subjetivo ou objetivo, pode buscar na web quando objetivo e dá uma justificativa curta. Ela só recebe o tema e os textos com letras — nunca nomes ou ids.

**Regras no servidor:** anonimato (autores só saem na revelação), pontuação sem duplicidade, desconexão/reconexão, rodada anulada se o Julgador sai (2 anuladas seguidas encerram a partida).

### Configuração da IA (somente no servidor)
| Variável | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | **obrigatória** para o modo IA (sem ela o lobby avisa e bloqueia o início) |
| `ANTHROPIC_BASE_URL` | opcional (padrão `https://api.anthropic.com`) |
| `JUDGE_AI_MODEL` | opcional (padrão `claude-sonnet-5-5`) |
| `JUDGE_AI_SEARCH` | `off` desliga a busca na web |
| `JUDGE_AI_SEARCH_TOOL` | versão da ferramenta de busca (padrão `web_search_20250305`) |
| `JUDGE_AI_TIMEOUT_MS` | tempo máximo por chamada (padrão 60000) |

Eventos de socket: `judg:theme`, `judg:answer`, `judg:choose`. Testes: `server/test/judgment.test.js` (39 testes; a IA é simulada nos testes).

**Não verificado de fato:** IA real (sem chave/rede), cena 3D (robô, coroa), servidor Socket.IO e build do Vite.

## Cenários 3D (sorteio por partida)

Cada partida usa **um** cenário, sorteado pelo **servidor** em `Room.start()` (`server/game/scenery.js`) e enviado a todos no estado da sala (`state.scenery`, `null` no lobby). Por isso todos veem o mesmo cenário, ele não muda com turnos/configurações/re-renderizações e continua o mesmo após recarregar a página ou reconectar. Só é sorteado de novo na próxima partida (depois de voltar ao lobby).

| id | cenário |
|---|---|
| `bar` | o bar original (inalterado) |
| `truck` | mesa na caçamba de uma caminhonete numa rodovia (rodovia = 1 trecho de 30 m em ciclo, instanciado) |

Para desenvolver um cenário específico: `QSE_SCENERY=truck npm start` (força o id; valor inválido é ignorado).

**Adicionar um cenário novo:** 1) acrescente o id em `SCENERIES` (`server/game/scenery.js`); 2) crie `client/src/three/scenery/<Nome>Scenery.jsx` e registre-o em `client/src/three/scenery/index.js` (o contrato de props está comentado lá). Mesa (`GameTable`), cadeiras (`Chair`), bonecos, câmera e HUD são compartilhados. No cliente, um id desconhecido (ou ausente) cai no bar.

Cores/medidas da caminhonete e da estrada: `client/src/three/scenery/truckLayout.js`.
