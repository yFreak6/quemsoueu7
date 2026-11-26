// Lógica de uma sala. Não conhece sockets: quem usa (net/gameServer.js) recebe os
// callbacks onChange/onEvent/onClose e entrega a visão personalizada a cada jogador.
//
// O Host é um jogador como os outros (boneco, personagem, vidas e turnos). A diferença
// é só de autoridade: configura a lista de personagens, as vidas e inicia a partida.

import { randomBytes, randomUUID } from 'node:crypto';
import { pickScenery } from './scenery.js';
import { canDrawOnePerPlayer, distribute, drawOnePerPlayer, keysOf } from './draw.js';
import { isGuessCorrect, nameKey } from './fuzzy.js';
import { DEFAULT_LOOK, parseLook } from './look.js';
import { distributeTeams, splitTeams, teamsAvailable } from './teams.js';
import { DEFAULT_JUDGMENT, isJudgmentMode } from './judgment.js';
import { installJudgment } from './judgmentRoom.js';
import { DEFAULT_IMPOSTOR, IMPOSTOR_WORD, MAX_ROUNDS, aiPick, isImpostorMode, maxImpostors, tally, validateConfig, winner } from './impostor.js';

export class GameError extends Error {
  constructor(message, code = 'INVALID') {
    super(message);
    this.code = code;
  }
}

export const LIMITS = {
  minPlayers: 2, // incluindo o host
  maxPlayers: 10,
  nickname: 16,
  character: 40,
  characters: 100,
  maxLives: 10,
  maxPicks: 3, // modo CADA UM ESCOLHE VÁRIOS
};

const DEFAULT_TIMINGS = {
  turnMs: 30_000, // duração de cada turno
  resultMs: 2_500, // pausa curta depois de um chute errado, para todos verem a reação
  lobbyGraceMs: 15_000, // tempo para recarregar a página no lobby sem perder o lugar
  hostGraceLobbyMs: 60_000, // host desconectado no lobby: a sala espera e depois fecha
  hostGraceGameMs: 300_000, // host desconectado durante a partida
  botThinkMs: [2_500, 6_000], // tempo que um bot "pensa" antes de jogar (min, max)
  revealMs: 15_000, // modos de impostor: tempo máximo para cada um ler a própria folha secreta
  voteMs: 45_000, // modos de impostor: tempo da votação (quem não votou até lá se abstém)
  voteResultMs: 6_000, // modos de impostor: o resultado fica na folha antes da próxima rodada / do fim
  judgeThemeMs: 90_000, // julgamento: tempo do Julgador humano para escrever o tema
  judgeThemeAiMs: 45_000, // julgamento (IA): tempo máximo para a IA criar o tema
  judgeAnswerMs: 60_000, // julgamento: tempo para cada jogador enviar a resposta
  judgeReadMs: 6_000, // julgamento: leitura das respostas anônimas antes de o Julgador poder escolher
  judgeChooseMs: 60_000, // julgamento: tempo do Julgador humano para escolher o vencedor
  judgeAiMs: 90_000, // julgamento (IA): tempo máximo da análise (inclui busca na web)
  judgeRevealMs: 8_000, // julgamento: revelação do vencedor e dos autores
  judgeRevealPerAnswerMs: 1_200, // julgamento: tempo extra por resposta revelada
  judgeAnnulMs: 4_000, // julgamento: aviso de rodada anulada antes de recomeçar
};

const BOT_NAMES = ['Bot Ana', 'Bot Beto', 'Bot Carla', 'Bot Davi', 'Bot Eva', 'Bot Fábio', 'Bot Gabi', 'Bot Hugo', 'Bot Iris'];

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const tidy = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const newToken = () => randomBytes(16).toString('hex');
const unref = (t) => {
  t.unref?.();
  return t;
};

export class Room {
  static cleanNickname(raw) {
    const nick = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (nick.length < 2) throw new GameError('O nickname precisa de pelo menos 2 caracteres.', 'NICK_INVALID');
    if (nick.length > LIMITS.nickname) throw new GameError(`O nickname pode ter no máximo ${LIMITS.nickname} caracteres.`, 'NICK_INVALID');
    if (!/[\p{L}\p{N}]/u.test(nick) || /[\u0000-\u001f<>]/.test(nick)) {
      throw new GameError('Nickname inválido. Use letras ou números.', 'NICK_INVALID');
    }
    return nick;
  }

  constructor(code, { onChange, onEvent, onClose, timings, judgeAI, log, random } = {}) {
    this.code = code;
    this.onChange = onChange ?? (() => {});
    this.onEvent = onEvent ?? (() => {});
    this.onClose = onClose ?? (() => {});
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.judgeAI = judgeAI ?? { available: false }; // provedor de IA do modo O JULGADOR (IA); injetado pelo servidor
    this.log = log ?? ((...a) => console.error(...a));
    this.random = random ?? Math.random; // só para sortear o cenário (injetável nos testes)
    this.scenery = null; // id do cenário 3D da partida (ver scenery.js): sorteado em start(), fixo até voltar ao lobby

    this.phase = 'lobby'; // lobby | playing | finished | closed
    this.settings = { lives: 3, mode: 'host', endRule: 'first', impostor: { ...DEFAULT_IMPOSTOR }, judgment: { ...DEFAULT_JUDGMENT } }; // mode: 'host' (HOST ESCOLHE) | 'players' (CADA UM ESCOLHE) | 'multi' (CADA UM ESCOLHE VÁRIOS) | 'teams' (EM TIMES)
    this.characters = []; // lista do host, destinada aos jogadores comuns
    this.players = []; // inclui o host (isHost) no assento 0
    this.turn = null; // { id, playerId, step:'action'|'result', deadline, duration }
    this.turnSeq = 0;
    this.eventSeq = 0;
    this.gameNo = 0; // sobe a cada partida iniciada (o cliente usa para zerar a caderneta)
    this.solvedOrder = []; // ids na ordem em que acertaram (regra 'last')
    this.result = null; // { winnerId|null, winnerTeam|null }
    this.teams = null; // modo teams: { 1: [ids], 2: [ids] } (a ordem define os turnos dentro do time)
    this.teamPtr = { 1: 0, 2: 0 }; // próximo integrante de cada time a jogar
    this.teamSetup = null; // modo teams: etapa de seleção adicional (antes da partida)
    this.impSecret = { innocentChar: '', impostorChar: '', impostorId: null }; // escolhas do host (só ele as vê)
    this.imp = null; // modos de impostor: { stage:'reveal'|'turns'|'vote'|'result', round, queue, vote, ... }
    this.impMeta = null; // { innocentChar, impostorChar, sheet } — nunca sai do servidor antes do fim
    this.voteSeq = 0;
    this.jg = null; // modo JULGAMENTO: estado da partida (ver judgmentRoom.js)
    this.jgSetup = { judgeId: null }; // escolha do host para o Julgador humano (só ele a vê)
    this.timer = null;
    this.hostTimer = null;
    this.botTimer = null;
    this.lastActive = Date.now();
  }

  // ---------- infraestrutura ----------
  changed() {
    this.lastActive = Date.now();
    this.onChange(this);
  }
  emit(evt) {
    this.onEvent({ id: ++this.eventSeq, ...evt });
  }
  setTimer(ms, fn) {
    this.clearTimer();
    this.timer = unref(
      setTimeout(() => {
        this.timer = null;
        fn();
      }, ms),
    );
  }
  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  clearBotTimer() {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
  }
  destroy() {
    this.clearTimer();
    this.clearBotTimer();
    if (this.hostTimer) clearTimeout(this.hostTimer);
    this.hostTimer = null;
    this.players.forEach((p) => p.dropTimer && clearTimeout(p.dropTimer));
  }
  get host() {
    return this.players.find((p) => p.isHost);
  }
  byId(id) {
    return this.players.find((p) => p.id === id);
  }
  bySocket(socketId) {
    return socketId ? this.players.find((p) => p.socketId === socketId) : undefined;
  }
  isAbandoned() {
    const humans = this.players.filter((p) => !p.bot);
    return humans.every((p) => !p.connected) && Date.now() - this.lastActive > 10 * 60_000;
  }

  assertHost(id) {
    if (this.host?.id !== id) throw new GameError('Apenas o host pode fazer isso.', 'NOT_HOST');
  }
  assertLobby() {
    if (this.phase !== 'lobby') throw new GameError('Isso só pode ser feito antes da partida começar.', 'NOT_LOBBY');
  }
  /** Valida uma ação de turno (chutar/passar). turnId evita que um clique atrasado atinja o turno seguinte. */
  assertAction(id, turnId) {
    if (this.phase !== 'playing' || !this.turn) throw new GameError('Não há partida em andamento.', 'NO_GAME');
    if (this.turn.playerId !== id) throw new GameError('Não é a sua vez.', 'NOT_YOUR_TURN');
    if (turnId !== undefined && turnId !== this.turn.id) throw new GameError('Essa vez já passou.', 'STALE_TURN');
    if (this.turn.step !== 'action') throw new GameError('Essa ação não está disponível agora.', 'STALE_TURN');
    if (this.byId(id)?.done) throw new GameError('Você já acertou seu personagem.', 'NOT_ALLOWED');
    return this.turn;
  }

  // ---------- entrada e saída ----------
  makePlayer(socketId, rawNickname, isHost) {
    const nickname = Room.cleanNickname(rawNickname);
    if (this.players.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())) {
      throw new GameError('Esse nickname já está em uso na sala.', 'NICK_TAKEN');
    }
    const player = {
      id: randomUUID().slice(0, 8),
      token: newToken(),
      socketId,
      nickname,
      isHost,
      connected: true,
      character: null,
      suggestion: null,
      lives: 0,
      eliminated: false,
      seat: this.players.length,
      dropTimer: null,
      bot: false,
      botTurns: 0,
      look: { ...DEFAULT_LOOK },
    };
    this.players.push(player);
    return player;
  }

  createHost(socketId, nickname) {
    if (this.players.length) throw new GameError('A sala já tem host.', 'INVALID');
    return this.makePlayer(socketId, nickname, true);
  }

  addPlayer(socketId, nickname) {
    if (this.phase === 'closed') throw new GameError('Esta sala foi encerrada.', 'ROOM_CLOSED');
    if (this.phase !== 'lobby') throw new GameError('Sala indisponível: a partida já começou.', 'ROOM_STARTED');
    if (this.teamSetup) throw new GameError('Sala indisponível: o sorteio dos times está em andamento.', 'ROOM_STARTED');
    if (this.players.length >= LIMITS.maxPlayers) {
      throw new GameError(`Sala indisponível: ela já está cheia (${LIMITS.maxPlayers} jogadores).`, 'ROOM_FULL');
    }
    return this.makePlayer(socketId, nickname, false);
  }

  rejoin(token, socketId) {
    const who = token ? this.players.find((p) => p.token === token) : null;
    if (!who) throw new GameError('Sessão expirada. Entre na sala novamente.', 'SESSION_EXPIRED');
    if (who.dropTimer) clearTimeout(who.dropTimer);
    who.dropTimer = null;
    if (who.isHost && this.hostTimer) {
      clearTimeout(this.hostTimer);
      this.hostTimer = null;
    }
    who.connected = true;
    who.socketId = socketId;
    this.changed();
    return who;
  }

  disconnect(socketId) {
    const who = this.bySocket(socketId);
    if (!who) return;
    who.connected = false;
    who.socketId = null;
    if (who.isHost) {
      // Sem transferência de autoridade: a sala espera o host voltar e, se ele não voltar, fecha.
      if (this.hostTimer) clearTimeout(this.hostTimer);
      const ms = this.phase === 'lobby' ? this.timings.hostGraceLobbyMs : this.timings.hostGraceGameMs;
      this.hostTimer = unref(setTimeout(() => this.close('host-timeout'), ms));
    } else if (this.phase === 'lobby') {
      who.dropTimer = unref(
        setTimeout(() => {
          if (!who.connected && this.phase === 'lobby') this.removePlayer(who.id);
        }, this.timings.lobbyGraceMs),
      );
    }
    this.jgOnDisconnect();
    this.changed();
  }

  removePlayer(id) {
    if (this.teamSetup) this.dropTeams(); // alguém saiu: os times sorteados deixam de valer
    this.players = this.players.filter((p) => p.id !== id);
    this.players.forEach((p, i) => (p.seat = i));
    this.changed();
  }

  /** Saída voluntária. Se o host sai, a sala fecha (a autoridade nunca muda de mãos). */
  leave(id) {
    const p = this.byId(id);
    if (!p) return;
    if (p.isHost) return this.close('host-left', { except: p.socketId });
    if (this.phase === 'lobby') return this.removePlayer(id);

    p.connected = false;
    p.socketId = null;
    const wasActive = !p.eliminated;
    if (!p.eliminated) {
      p.eliminated = true;
      p.lives = 0;
    }
    if (this.phase === 'playing' && isJudgmentMode(this.settings.mode)) return this.jgOnLeave(p);
    if (this.phase === 'playing' && isImpostorMode(this.settings.mode)) return this.impOnLeave(p, wasActive);
    if (this.phase === 'playing') {
      if (this.settings.mode === 'teams' && this.teamsOver()) return;
      if (this.checkLastStanding()) return;
      if (this.players.every((x) => x.eliminated || x.done)) return this.finishNoWinner();
      if (this.turn?.playerId === id) return this.passTurn();
    }
    this.changed();
  }

  close(reason, opts = {}) {
    if (this.phase === 'closed') return;
    this.destroy();
    this.phase = 'closed';
    this.turn = null;
    this.onClose(this, reason, opts);
  }

  // ---------- bots ----------
  /** O host completa a sala com um jogador controlado pelo servidor (só no lobby). */
  addBot(by) {
    this.assertHost(by);
    this.assertLobby();
    if (this.settings.mode !== 'host') throw new GameError('Neste modo não há bots: eles não escolhem personagem.', 'NOT_ALLOWED');
    if (this.players.length >= LIMITS.maxPlayers) {
      throw new GameError(`A sala já está cheia (${LIMITS.maxPlayers} jogadores).`, 'ROOM_FULL');
    }
    const taken = new Set(this.players.map((p) => p.nickname.toLowerCase()));
    let nickname = BOT_NAMES.find((n) => !taken.has(n.toLowerCase()));
    for (let i = 2; !nickname; i++) if (!taken.has(`bot ${i}`)) nickname = `Bot ${i}`;
    const bot = {
      id: randomUUID().slice(0, 8),
      token: null,
      socketId: null,
      nickname,
      isHost: false,
      connected: true, // bots nunca "caem"
      character: null,
      suggestion: null,
      lives: 0,
      eliminated: false,
      seat: this.players.length,
      dropTimer: null,
      bot: true,
      botTurns: 0,
    };
    this.players.push(bot);
    this.changed();
    return bot;
  }

  removeBot(by, botId) {
    this.assertHost(by);
    this.assertLobby();
    const bot = this.byId(botId);
    if (!bot?.bot) throw new GameError('Bot não encontrado.', 'INVALID');
    this.removePlayer(botId);
  }

  /**
   * Jogada de um bot. Passa pelas mesmas funções dos humanos (guess/pass), então toda regra
   * (turno, vidas, eliminação, vitória) vale igual. A "chance de acertar" cresce a cada turno,
   * simulando que ele vai deduzindo quem é.
   */
  scheduleBot() {
    this.clearBotTimer();
    const turn = this.turn;
    const bot = this.byId(turn?.playerId);
    if (!bot?.bot || this.phase !== 'playing' || turn.step !== 'action') return;
    const [lo, hi] = this.timings.botThinkMs;
    const ms = lo + Math.random() * Math.max(0, hi - lo);
    this.botTimer = unref(
      setTimeout(() => {
        this.botTimer = null;
        if (this.phase !== 'playing' || this.turn?.id !== turn.id || this.turn.step !== 'action' || bot.eliminated) return;
        bot.botTurns += 1;
        try {
          const knows = Math.random() < Math.min(0.6, 0.07 * bot.botTurns);
          if (knows) return void this.guess(bot.id, bot.character, turn.id);
          if (Math.random() < 0.25) {
            const wrong = shuffle(this.characters.concat(['Fulano de Tal'])).find((c) => nameKey(c) !== nameKey(bot.character));
            return void this.guess(bot.id, wrong, turn.id);
          }
          this.pass(bot.id, turn.id);
        } catch {
          /* o turno mudou no meio: nada a fazer */
        }
      }, ms),
    );
  }

  /** Personalização do próprio boneco. Só no lobby (o visual não muda durante a partida). */
  setLook(id, raw) {
    this.assertLobby();
    const p = this.byId(id);
    if (!p) throw new GameError('Jogador não encontrado.', 'NOT_FOUND');
    try {
      p.look = parseLook(raw);
    } catch (e) {
      throw new GameError(e.message, 'INVALID');
    }
    this.changed();
  }

  // ---------- configuração do lobby ----------
  setSettings(by, { lives, mode, endRule, impostor, judgment } = {}) {
    this.assertHost(by);
    this.assertLobby();
    if (this.teamSetup) throw new GameError('O sorteio dos times está em andamento. Cancele-o para mudar a configuração.', 'NOT_ALLOWED');
    if (mode !== undefined) this.setMode(mode);
    if (impostor !== undefined) this.setImpostorCfg(impostor);
    if (judgment !== undefined) this.setJudgmentCfg(judgment);
    // 'first': a partida acaba quando alguém acerta. 'last': quem acerta sai das rodadas e a partida
    // acaba quando só resta 1 jogador sem acertar. Não se aplica ao modo em times (regra própria).
    if (endRule !== undefined) {
      if (endRule !== 'first' && endRule !== 'last') throw new GameError('Regra de fim de partida inválida.', 'INVALID');
      this.settings.endRule = endRule;
    }
    if (lives !== undefined) {
      const n = Math.round(Number(lives));
      if (!Number.isFinite(n)) throw new GameError('Número de vidas inválido.');
      this.settings.lives = Math.min(LIMITS.maxLives, Math.max(1, n));
    }
    this.changed();
  }

  /**
   * Modo de partida. 'host': o host cadastra a lista e os outros sugerem (HOST ESCOLHE).
   * 'players': cada jogador escolhe 1 personagem e ele é sorteado para outro jogador (CADA UM ESCOLHE).
   * Trocar de modo descarta as escolhas já enviadas, pois elas têm significados diferentes.
   */
  setMode(mode) {
    if (mode !== 'host' && mode !== 'players' && mode !== 'multi' && mode !== 'teams' && !isImpostorMode(mode) && !isJudgmentMode(mode)) throw new GameError('Modo de partida inválido.', 'INVALID');
    if (mode === this.settings.mode) return;
    if (mode !== 'host' && this.players.some((p) => p.bot)) {
      throw new GameError('Neste modo não há bots (eles não escolhem personagem). Remova os bots primeiro.', 'NOT_ALLOWED');
    }
    if (mode === 'teams' && (this.players.length === 1 || this.players.length === 3)) {
      throw new GameError('O modo em times não está disponível com 1 ou 3 jogadores.', 'NOT_ALLOWED');
    }
    this.settings.mode = mode;
    this.players.forEach((p) => {
      p.suggestion = null;
      p.picks = [];
    });
  }

  /** Substitui a lista de personagens do host (adicionar, remover e corrigir passam por aqui). */
  setCharacters(by, list) {
    this.assertHost(by);
    this.assertLobby();
    if (this.settings.mode !== 'host') throw new GameError('A lista do host só existe no modo HOST ESCOLHE.', 'NOT_ALLOWED');
    if (!Array.isArray(list)) throw new GameError('Lista de personagens inválida.');
    const seen = new Set();
    const out = [];
    for (const raw of list) {
      const name = tidy(raw, LIMITS.character);
      const key = nameKey(name);
      if (!key || seen.has(key)) continue; // vazio, só símbolos ou repetido
      seen.add(key);
      out.push(name);
      if (out.length >= LIMITS.characters) break;
    }
    this.characters = out;
    this.changed();
  }

  /** Cada jogador comum envia um personagem para o sorteio do host. Pode trocar até a partida começar. */
  suggest(id, text) {
    this.assertLobby();
    const p = this.byId(id);
    if (!p) throw new GameError('Jogador não encontrado.');
    if (this.settings.mode === 'multi') throw new GameError('Neste modo você escolhe até 3 personagens.', 'NOT_ALLOWED');
    if (isImpostorMode(this.settings.mode)) throw new GameError('Neste modo ninguém sugere personagem.', 'NOT_ALLOWED');
    if (this.settings.mode === 'teams' && this.teamSetup) return this.suggestExtra(p, text);
    const picks = this.settings.mode === 'players' || this.settings.mode === 'teams';
    if (p.isHost && !picks) throw new GameError('O host cadastra a lista de personagens; quem sugere são os outros jogadores.', 'NOT_ALLOWED');
    const name = tidy(text, LIMITS.character);
    if (!nameKey(name)) throw new GameError('Digite um nome válido (use letras ou números).', 'INVALID');
    if (picks) {
      // um personagem só pode aparecer uma vez na mesa (a mensagem não revela quem o escolheu)
      const key = nameKey(name);
      if (this.players.some((o) => o.id !== p.id && o.suggestion && nameKey(o.suggestion) === key)) {
        throw new GameError('Esse personagem já foi escolhido por outro jogador. Escolha outro.', 'DUPLICATE');
      }
    }
    p.suggestion = name;
    this.changed();
  }

  // ---------- modo EM TIMES ----------
  /** Cancela o sorteio dos times (alguém saiu ou o host desistiu): as escolhas de cada um continuam valendo. */
  dropTeams() {
    this.teamSetup = null;
    this.teams = null;
    this.players.forEach((p) => {
      p.team = null;
      p.character = null;
    });
  }

  cancelTeams(by) {
    this.assertHost(by);
    this.assertLobby();
    if (!this.teamSetup) throw new GameError('Não há sorteio de times em andamento.', 'NOT_ALLOWED');
    this.dropTeams();
    this.changed();
  }

  /**
   * Seleção adicional: só o time MENOR sugere (1 sugestão por integrante) para a vaga que sobrou no time maior.
   * A sugestão não é comparada com nada na hora (comparar revelaria se o nome já está em jogo);
   * ao final, sorteia-se uma das válidas.
   */
  suggestExtra(p, text) {
    const setup = this.teamSetup;
    if (!setup.suggesters.includes(p.id)) throw new GameError('Somente o time adversário escolhe o personagem para essa vaga.', 'NOT_ALLOWED');
    const name = tidy(text, LIMITS.character);
    if (!nameKey(name)) throw new GameError('Digite um nome válido (use letras ou números).', 'INVALID');
    setup.suggestions[p.id] = name;
    setup.rejected = false;
    if (setup.suggesters.every((id) => setup.suggestions[id])) return this.finishExtra();
    this.changed();
  }

  finishExtra() {
    const setup = this.teamSetup;
    const inPlay = new Set(this.players.filter((p) => p.character).map((p) => nameKey(p.character)));
    const valid = Object.values(setup.suggestions).filter((c) => !inPlay.has(nameKey(c)));
    if (!valid.length) {
      // todas repetiam personagens já em jogo: pede novas sugestões (sem dizer quais repetiram)
      setup.suggestions = {};
      setup.rejected = true;
      this.emit({ type: 'extra-rejected' });
      this.changed();
      return;
    }
    const chosen = shuffle(valid)[0];
    this.byId(setup.receiverId).character = chosen;
    this.teamSetup = null;
    this.beginGame();
  }

  /** Início no modo EM TIMES: sorteia os times, distribui as escolhas entre adversários e, se sobrar vaga, abre a seleção adicional. */
  startTeams() {
    if (this.teamSetup) throw new GameError('O sorteio dos times já foi feito.', 'ALREADY_STARTED');
    const ids = this.players.map((p) => p.id);
    const teams = splitTeams(ids);
    if (!teams) throw new GameError('Este modo precisa de 2 ou de 4 a 10 jogadores.', 'NOT_READY');
    const byId = new Map(this.players.map((p) => [p.id, p]));
    const { assigned, missing } = distributeTeams(teams, (id) => byId.get(id).suggestion);
    this.teams = teams;
    for (const t of [1, 2]) teams[t].forEach((id) => (byId.get(id).team = t));
    this.players.forEach((p) => (p.character = assigned.get(p.id) ?? null));
    this.teamPtr = { 1: 0, 2: 0 };
    this.emit({ type: 'teams-formed' });
    if (!missing.length) return this.beginGame();
    const [receiverId] = missing;
    const receiverTeam = byId.get(receiverId).team;
    const small = receiverTeam === 1 ? 2 : 1;
    this.teamSetup = { receiverId, smallTeam: small, suggesters: [...teams[small]], suggestions: {}, rejected: false };
    this.changed();
  }

  /** Alguém venceu, ou nenhum time pode mais vencer? Encerra a partida e devolve true. */
  teamsOver() {
    const members = (t) => this.teams[t].map((id) => this.byId(id)).filter(Boolean);
    for (const t of [1, 2]) {
      if (members(t).every((p) => p.done)) {
        this.finish(null, t);
        return true;
      }
    }
    const canWin = (t) => members(t).every((p) => p.done || !p.eliminated);
    if (!canWin(1) && !canWin(2)) {
      this.finish(null, null);
      return true;
    }
    return false;
  }

  /** Próximo turno no modo EM TIMES: alterna entre os times; quem já acertou ou foi eliminado é pulado. */
  passTurnTeams() {
    if (this.teamsOver()) return;
    const cur = this.byId(this.turn?.playerId);
    const order = cur ? [cur.team === 1 ? 2 : 1, cur.team] : [1, 2];
    const candidates = [];
    for (const t of order) {
      const list = this.teams[t];
      for (let k = 0; k < list.length; k++) {
        const idx = (this.teamPtr[t] + k) % list.length;
        const p = this.byId(list[idx]);
        if (p && !p.done && !p.eliminated) candidates.push({ p, t, idx });
      }
    }
    // prefere o time adversário e, dentro dele, quem está conectado; só cai para desconectado se não houver outro
    const pick = candidates.find((c) => c.p.connected) ?? candidates[0];
    if (!pick) return this.finish(null, null);
    this.teamPtr[pick.t] = (pick.idx + 1) % this.teams[pick.t].length;
    this.beginTurn(pick.p.id);
  }

  /** Modo CADA UM ESCOLHE VÁRIOS: o jogador define (substitui) sua seleção de 1 a 3 personagens diferentes. */
  setPicks(id, list) {
    this.assertLobby();
    if (this.settings.mode !== 'multi') throw new GameError('Este modo de partida não usa seleção múltipla.', 'NOT_ALLOWED');
    const p = this.byId(id);
    if (!p || p.bot) throw new GameError('Jogador não encontrado.');
    if (!Array.isArray(list)) throw new GameError('Seleção inválida.', 'INVALID');
    const seen = new Set();
    const out = [];
    for (const raw of list) {
      const name = tidy(raw, LIMITS.character);
      const key = nameKey(name);
      if (!key || seen.has(key)) continue; // vazio ou repetido na própria lista
      seen.add(key);
      out.push(name);
    }
    if (out.length > LIMITS.maxPicks) throw new GameError(`Escolha no máximo ${LIMITS.maxPicks} personagens.`, 'INVALID');
    p.picks = out; // lista vazia = desfaz a confirmação
    this.changed();
  }

  readiness() {
    const missing = [];
    const commons = this.players.filter((p) => !p.isHost);
    if (this.players.length < LIMITS.minPlayers) missing.push('Aguarde pelo menos mais um jogador entrar na sala.');
    const offline = this.players.filter((p) => !p.connected).map((p) => p.nickname);
    if (offline.length) missing.push(`Sem conexão: ${offline.join(', ')}.`);
    if (isImpostorMode(this.settings.mode)) {
      const parts = this.impParticipants();
      missing.push(
        ...validateConfig(this.settings.mode, this.settings.impostor, {
          n: parts.length,
          ids: parts.map((p) => p.id),
          innocentChar: this.impSecret.innocentChar,
          impostorChar: this.impSecret.impostorChar,
          impostorId: this.impSecret.impostorId,
        }),
      );
      return { ok: missing.length === 0, missing, needed: parts.length };
    }
    if (isJudgmentMode(this.settings.mode)) {
      missing.push(...this.judgmentReadiness());
      return { ok: missing.length === 0, missing, needed: this.players.length };
    }
    if (this.settings.mode === 'teams') {
      if (this.teamSetup) missing.push('O sorteio dos times já foi feito: falta a seleção adicional.');
      if (!teamsAvailable(this.players.length) && this.players.length >= LIMITS.minPlayers) {
        missing.push(`O modo em times precisa de 2 ou de 4 a 10 jogadores (agora há ${this.players.length}).`);
      }
      const waiting = this.players.filter((p) => !p.suggestion).map((p) => p.nickname);
      if (waiting.length) missing.push(`Faltam escolhas de: ${waiting.join(', ')}.`);
      return { ok: missing.length === 0, missing, needed: this.players.length };
    }
    if (this.settings.mode === 'multi') {
      const waiting = this.players.filter((p) => !(p.picks?.length)).map((p) => p.nickname);
      if (waiting.length) missing.push(`Faltam escolhas de: ${waiting.join(', ')}.`);
      else if (!canDrawOnePerPlayer(this.players.map((p) => p.picks))) {
        missing.push('Há personagens repetidos entre as escolhas e não dá para sortear um diferente para cada jogador. Alguém precisa acrescentar outro personagem.');
      }
      return { ok: missing.length === 0, missing, needed: this.players.length };
    }
    if (this.settings.mode === 'players') {
      const waiting = this.players.filter((p) => !p.suggestion).map((p) => p.nickname);
      if (waiting.length) missing.push(`Faltam escolhas de: ${waiting.join(', ')}.`);
      return { ok: missing.length === 0, missing, needed: this.players.length };
    }
    const humans = commons.filter((p) => !p.bot);
    const pending = humans.filter((p) => !p.suggestion).map((p) => p.nickname);
    if (pending.length) missing.push(`Faltam sugestões de: ${pending.join(', ')}.`);
    // sem nenhum jogador humano comum, não há sugestão para o host: o personagem dele sai da própria lista
    const needed = commons.length + (commons.length > 0 && humans.length === 0 ? 1 : 0);
    if (commons.length && this.characters.length < needed) {
      missing.push(`Cadastre pelo menos ${needed} personagem(ns) (você tem ${this.characters.length}).`);
    }
    return { ok: missing.length === 0, missing, needed };
  }

  // ---------- partida ----------
  /**
   * Sorteio feito aqui, de uma vez só (síncrono): não há como dois cliques ou duas
   * reconexões produzirem resultados diferentes. Todos recebem o mesmo estado.
   */
  start(by) {
    this.assertHost(by);
    if (this.phase !== 'lobby' || this.teamSetup) throw new GameError('A partida já começou.', 'ALREADY_STARTED');
    const ready = this.readiness();
    if (!ready.ok) throw new GameError(ready.missing.join(' '), 'NOT_READY');

    // Cenário da partida: sorteado UMA vez aqui, no servidor. Vai no estado enviado a todos e só muda na próxima partida.
    this.scenery = pickScenery({ random: this.random });

    if (this.settings.mode === 'teams') return this.startTeams();
    if (isImpostorMode(this.settings.mode)) return this.startImpostor();
    if (isJudgmentMode(this.settings.mode)) return this.startJudgment();
    if (this.settings.mode === 'multi') this.drawMulti();
    else if (this.settings.mode === 'players') this.drawPicks();
    else this.drawFromHost();
    this.beginGame();
  }

  /**
   * CADA UM ESCOLHE: embaralha as escolhas até ninguém ficar com a própria (derangement).
   * Todos escolheram exatamente 1 e todas as escolhas são usadas, uma vez cada.
   */
  drawPicks() {
    const ps = this.players;
    const picks = ps.map((p) => p.suggestion);
    let order;
    do {
      order = shuffle(picks.map((_, i) => i));
    } while (order.some((src, i) => src === i));
    ps.forEach((p, i) => (p.character = picks[order[i]]));
  }

  /**
   * CADA UM ESCOLHE VÁRIOS: 1) sorteia 1 personagem da seleção de cada jogador (sem repetir personagem);
   * 2) distribui os sorteados entre os jogadores, ninguém recebendo o sorteado da própria seleção.
   */
  drawMulti() {
    const ps = this.players;
    const lists = ps.map((p) => p.picks ?? []);
    const idx = drawOnePerPlayer(lists);
    if (!idx) throw new GameError('Não deu para sortear: há personagens repetidos entre as escolhas. Alguém precisa acrescentar outro.', 'DRAW_FAILED');
    const drawn = ps.map((_, i) => lists[i][idx[i]]);
    const assign = distribute(drawn.map(nameKey), lists.map(keysOf));
    if (!assign) throw new GameError('Não deu para distribuir os personagens.', 'DRAW_FAILED');
    ps.forEach((p, i) => (p.character = drawn[assign[i]]));
  }

  drawFromHost() {
    const host = this.host;
    const commons = this.players.filter((p) => !p.isHost);

    // 1-3. sorteia uma sugestão para o host (se ela coincidir com um nome da lista,
    // tenta outra, para nunca haver o mesmo personagem em dois bonecos)
    let chosen = null;
    let pool = null;
    const humans = commons.filter((p) => !p.bot);
    for (const s of shuffle(humans.map((p) => p.suggestion))) {
      const key = nameKey(s);
      const available = this.characters.filter((c) => nameKey(c) !== key);
      if (available.length >= commons.length) {
        chosen = s;
        pool = available;
        break;
      }
    }
    if (!chosen && humans.length === 0 && this.characters.length > commons.length) {
      // só bots: o host recebe um nome da própria lista
      const all = shuffle(this.characters);
      chosen = all[0];
      pool = all.slice(1);
    }
    if (!chosen) {
      throw new GameError('Não deu para sortear: as sugestões coincidem com nomes da sua lista. Cadastre mais personagens.', 'DRAW_FAILED');
    }

    // 4-6. distribui os personagens do host entre os jogadores comuns, sem reposição
    const picked = shuffle(pool).slice(0, commons.length);
    commons.forEach((p, i) => (p.character = picked[i]));
    host.character = chosen;
  }

  beginGame() {
    this.players.forEach((p) => {
      p.picks = [];
      p.suggestion = null; // sugestões consumidas: a sorteada saiu do conjunto e as demais não têm mais uso
      p.lives = this.settings.lives;
      p.eliminated = false;
      p.botTurns = 0;
      p.done = false;
    });

    this.gameNo += 1;
    this.phase = 'playing';
    this.result = null;
    this.solvedOrder = [];
    let first = this.players[Math.floor(Math.random() * this.players.length)];
    if (this.settings.mode === 'teams') {
      first = this.byId(this.teams[1][0]); // a partida começa pelo Time 1
      this.teamPtr = { 1: 1 % this.teams[1].length, 2: 0 };
    }
    this.emit({ type: 'game-start', playerId: first.id, mode: this.settings.mode });
    this.beginTurn(first.id);
  }

  beginTurn(playerId) {
    const ms = this.timings.turnMs;
    this.turn = { id: ++this.turnSeq, playerId, step: 'action', deadline: Date.now() + ms, duration: ms };
    this.setTimer(ms, () => this.passTurn()); // tempo esgotado: passa a vez, sem perder vida
    this.scheduleBot();
    this.changed();
  }

  guess(id, text, turnId) {
    if (isImpostorMode(this.settings.mode)) throw new GameError('Neste modo não há chute: você só pode passar a vez.', 'NOT_ALLOWED');
    const turn = this.assertAction(id, turnId);
    const attempt = tidy(text, 80);
    if (!nameKey(attempt)) throw new GameError('Digite o nome do seu personagem.', 'INVALID');
    const player = this.byId(id);

    // parte do nome também vale ('Remy' para 'Remy Ratatouille') se não servir para outro personagem em jogo
    const others = this.players.filter((p) => p.id !== id && p.character).map((p) => p.character);
    if (isGuessCorrect(attempt, player.character, { others })) {
      if (this.settings.mode === 'teams') {
        // acerto individual: o jogador sai das rodadas, mas a partida só acaba quando um time inteiro acertar
        player.done = true;
        this.emit({ type: 'player-solved', playerId: id, team: player.team });
        if (!this.teamsOver()) this.passTurn();
        return { correct: true, solved: true };
      }
      if (this.settings.endRule === 'last') {
        // acerto individual: sai das rodadas; a partida acaba quando só resta 1 jogador sem acertar
        player.done = true;
        this.solvedOrder.push(id);
        this.emit({ type: 'player-solved', playerId: id });
        const left = this.players.filter((p) => !p.done);
        if (left.length <= 1) this.finish(null, null, { endRule: 'last', loserId: left[0]?.id ?? null });
        else this.passTurn();
        return { correct: true, solved: true };
      }
      this.finish(id);
      return { correct: true };
    }

    player.lives = Math.max(0, player.lives - 1);
    const eliminated = player.lives === 0;
    if (eliminated) player.eliminated = true;

    const ms = this.timings.resultMs;
    turn.step = 'result';
    turn.deadline = Date.now() + ms;
    turn.duration = ms;
    this.emit({ type: 'wrong-guess', playerId: id, text: attempt, eliminated, livesLeft: player.lives });
    this.setTimer(ms, () => this.passTurn());
    this.changed();
    return { correct: false, eliminated, livesLeft: player.lives };
  }

  pass(id, turnId) {
    this.assertAction(id, turnId);
    this.passTurn();
  }

  /** Próximo jogador ativo à direita (assento seguinte). Eliminados nunca recebem turno. */
  passTurn() {
    if (this.phase !== 'playing') return;
    if (isImpostorMode(this.settings.mode)) return this.impNext();
    if (this.settings.mode === 'teams') return this.passTurnTeams();
    if (this.checkLastStanding()) return;
    if (this.players.every((p) => p.eliminated || p.done)) return this.finishNoWinner();

    const n = this.players.length;
    const current = this.byId(this.turn?.playerId);
    const start = current ? current.seat : -1;

    let next = null;
    let fallback = null;
    for (let k = 1; k <= n; k++) {
      const p = this.players[(start + k + n) % n];
      if (p.eliminated || p.done) continue;
      fallback ??= p;
      if (p.connected) {
        next = p;
        break;
      }
    }
    this.beginTurn((next ?? fallback).id);
  }

  /**
   * Só um jogador ainda tem vida (os outros foram eliminados ou saíram): a partida acaba e ele vence.
   * Vale para os modos de chute (não para times nem impostor) (a sala já exige 2+ jogadores para iniciar),
   * a checagem de 2+ é só uma salvaguarda.
   */
  checkLastStanding() {
    if (this.phase !== 'playing' || this.settings.mode === 'teams' || isImpostorMode(this.settings.mode) || isJudgmentMode(this.settings.mode)) return false;
    if (this.players.length < 2) return false;
    const alive = this.players.filter((p) => !p.eliminated);
    if (alive.length !== 1) return false;
    const extra = { lastStanding: true };
    if (this.settings.endRule === 'last') Object.assign(extra, { endRule: 'last', loserId: null });
    this.finish(alive[0].id, null, extra);
    return true;
  }

  /** Ninguém sobrou para jogar. No fim 'last' ainda registra a ordem de acertos. */
  finishNoWinner() {
    return this.finish(null, null, this.settings.endRule === 'last' && this.settings.mode !== 'teams' ? { endRule: 'last', loserId: null } : {});
  }

  finish(winnerId, winnerTeam = null, extra = {}) {
    this.clearTimer();
    this.clearBotTimer();
    this.phase = 'finished';
    this.turn = null;
    this.result = { winnerId, winnerTeam, ...extra, ...(extra.endRule === 'last' ? { order: [...this.solvedOrder] } : {}) };
    this.emit({ type: 'game-end', playerId: winnerId, winnerTeam, loserId: extra.loserId ?? null, endRule: extra.endRule ?? 'first', side: extra.impostor?.winner ?? null });
    this.changed();
  }

  /** Volta ao lobby (nova partida ou partida abortada pelo host). Cada jogador sugere de novo. */
  reset(by) {
    this.assertHost(by);
    if (this.phase === 'lobby') throw new GameError('A sala já está no lobby.', 'NOT_STARTED');
    this.clearTimer();
    this.clearBotTimer();
    this.phase = 'lobby';
    this.turn = null;
    this.result = null;
    this.teams = null;
    this.teamSetup = null;
    this.teamPtr = { 1: 0, 2: 0 };
    this.imp = null;
    this.impMeta = null;
    this.jg = null;
    this.scenery = null;
    this.players = this.players.filter((p) => p.connected);
    this.players.forEach((p, i) => {
      p.seat = i;
      p.character = null;
      p.suggestion = null;
      p.picks = [];
      p.lives = 0;
      p.eliminated = false;
      p.team = null;
      p.done = false;
      p.role = null;
      p.allies = null;
      p.score = 0;
    });
    if (!this.players.some((p) => p.id === this.jgSetup.judgeId)) this.jgSetup.judgeId = null;
    this.impSecret.impostorId = this.players.some((p) => p.id === this.impSecret.impostorId) ? this.impSecret.impostorId : null;
    this.changed();
  }

  // ---------- MODOS DE IMPOSTOR ----------
  /** O host é espectador quando ele mesmo escolhe o personagem dos inocentes. */
  impSpectator(p) {
    return isImpostorMode(this.settings.mode) && !!p.isHost && this.settings.impostor.innocents === 'host';
  }
  impParticipants() {
    return this.players.filter((p) => !this.impSpectator(p));
  }
  /** Participantes ainda na partida, na ordem dos assentos. */
  impActive() {
    return this.impParticipants()
      .filter((p) => !p.eliminated)
      .sort((a, b) => a.seat - b.seat);
  }
  impAlive() {
    const act = this.impActive();
    return { impostors: act.filter((p) => p.role === 'impostor').length, innocents: act.filter((p) => p.role !== 'impostor').length };
  }

  /** Configuração dos modos de impostor (só o host, só no lobby). Valores inválidos são recusados. */
  setImpostorCfg(raw) {
    if (!raw || typeof raw !== 'object') throw new GameError('Configuração de impostor inválida.', 'INVALID');
    const cfg = this.settings.impostor;
    const pickEnum = (key, allowed) => {
      if (raw[key] === undefined) return;
      if (!allowed.includes(raw[key])) throw new GameError('Configuração de impostor inválida.', 'INVALID');
      cfg[key] = raw[key];
    };
    pickEnum('innocents', ['ai', 'host']);
    pickEnum('sheet', ['word', 'character']);
    pickEnum('pick', ['random', 'host']);
    if (raw.count !== undefined) {
      const n = Math.round(Number(raw.count));
      if (!Number.isFinite(n) || n < 1) throw new GameError('Quantidade de impostores inválida.', 'INVALID');
      cfg.count = Math.min(maxImpostors(LIMITS.maxPlayers), n);
    }
    if (raw.rounds !== undefined) {
      const n = Math.round(Number(raw.rounds));
      if (!Number.isFinite(n) || n < 1 || n > MAX_ROUNDS) throw new GameError(`Escolha de 1 a ${MAX_ROUNDS} rodadas antes da votação.`, 'INVALID');
      cfg.rounds = n;
    }
    if (raw.alliesKnow !== undefined) cfg.alliesKnow = raw.alliesKnow === true;
    if (raw.innocentChar !== undefined) this.impSecret.innocentChar = tidy(raw.innocentChar, LIMITS.character);
    if (raw.impostorChar !== undefined) this.impSecret.impostorChar = tidy(raw.impostorChar, LIMITS.character);
    if (raw.impostorId !== undefined) {
      const id = raw.impostorId === null ? null : String(raw.impostorId);
      if (id !== null && !this.byId(id)) throw new GameError('Jogador não encontrado.', 'INVALID');
      this.impSecret.impostorId = id;
    }
    // combinações que não fazem sentido são desfeitas aqui, não só escondidas na tela
    if (cfg.sheet === 'word') cfg.alliesKnow = false; // com a palavra IMPOSTOR não há conhecimento de aliados
    if (this.impSecret.impostorId && this.impSpectator(this.byId(this.impSecret.impostorId) ?? {})) this.impSecret.impostorId = null; // espectador não pode ser impostor
  }

  /** Sorteio e distribuição dos papéis. Tudo no servidor, de uma vez só. */
  startImpostor() {
    const mode = this.settings.mode;
    const cfg = this.settings.impostor;
    const parts = this.impParticipants();
    const sec = this.impSecret;

    const innocentChar = cfg.innocents === 'host' ? tidy(sec.innocentChar, LIMITS.character) : aiPick();
    let impostorChar = null;
    if (cfg.sheet === 'character') impostorChar = cfg.innocents === 'host' ? tidy(sec.impostorChar, LIMITS.character) : aiPick([innocentChar]);

    const k = mode === 'imp_multi' ? cfg.count : 1;
    const impIds = mode !== 'imp_multi' && cfg.pick === 'host' ? [sec.impostorId] : shuffle(parts.map((p) => p.id)).slice(0, k);
    const allies = mode === 'imp_multi' && cfg.sheet === 'character' && cfg.alliesKnow;

    this.players.forEach((p) => {
      p.role = null;
      p.allies = null;
      p.character = null; // o espectador não recebe nada
    });
    for (const p of parts) {
      const isImp = impIds.includes(p.id);
      p.role = isImp ? 'impostor' : 'innocent';
      p.character = isImp ? (cfg.sheet === 'word' ? IMPOSTOR_WORD : impostorChar) : innocentChar;
      p.allies = isImp && allies ? impIds.filter((i) => i !== p.id) : null;
    }
    this.impMeta = { innocentChar, impostorChar, sheet: cfg.sheet, impostorIds: [...impIds] };

    this.players.forEach((p) => {
      p.picks = [];
      p.suggestion = null;
      p.lives = 1;
      p.eliminated = false;
      p.botTurns = 0;
      p.done = false;
      p.ready = false;
    });
    this.gameNo += 1;
    this.phase = 'playing';
    this.result = null;
    this.solvedOrder = [];
    this.turn = null;
    const first = parts[Math.floor(Math.random() * parts.length)];
    const ms = this.timings.revealMs;
    this.imp = { stage: 'reveal', round: 0, queue: [], vote: null, lastVote: null, lastSeat: first.seat - 1, startId: first.id, revealDeadline: Date.now() + ms, revealDuration: ms };
    this.emit({ type: 'game-start', playerId: first.id, mode });
    this.setTimer(ms, () => this.impBeginRound({ startId: first.id }));
    this.changed();
  }

  /** "Entendi": cada participante confirma que leu a folha. Quando todos os conectados confirmam, os turnos começam. */
  impReady(id) {
    const p = this.byId(id);
    if (this.phase !== 'playing' || this.imp?.stage !== 'reveal') throw new GameError('Não há folhas para ler agora.', 'NOT_ALLOWED');
    if (!p || this.impSpectator(p)) throw new GameError('Você não recebeu uma folha.', 'NOT_ALLOWED');
    p.ready = true;
    if (this.impParticipants().every((x) => x.ready || !x.connected)) return this.impBeginRound({ startId: this.imp.startId });
    this.changed();
  }

  /** Abre uma rodada de turnos com os participantes ativos. Na 1ª, começa pelo sorteado; depois, a partir do assento seguinte ao último que jogou. */
  impBeginRound({ startId } = {}) {
    if (this.phase !== 'playing') return;
    const imp = this.imp;
    const act = this.impActive();
    if (!act.length) return this.impFinish('impostors');
    let i = startId ? act.findIndex((p) => p.id === startId) : act.findIndex((p) => p.seat > imp.lastSeat);
    if (i < 0) i = 0;
    const order = [...act.slice(i), ...act.slice(0, i)].map((p) => p.id);
    const total = this.settings.impostor.rounds ?? 1;
    imp.queue = Array.from({ length: total }, () => order).flat(); // `total` rodadas completas antes da votação
    imp.cycle = { total, size: order.length };
    imp.round += 1;
    imp.stage = 'turns';
    imp.vote = null;
    this.impNext();
  }

  /** Próximo turno da rodada; quando todos os ativos jogaram, abre a votação. Quem está offline é pulado. */
  impNext() {
    const imp = this.imp;
    if (this.phase !== 'playing' || !imp || imp.stage !== 'turns') return;
    for (;;) {
      const id = imp.queue.shift();
      if (id === undefined) return this.impStartVote();
      const p = this.byId(id);
      if (!p || p.eliminated || this.impSpectator(p)) continue;
      imp.lastSeat = p.seat;
      if (!p.connected) continue;
      return this.beginTurn(id);
    }
  }

  impStartVote() {
    const imp = this.imp;
    this.clearTimer();
    this.turn = null;
    const ms = this.timings.voteMs;
    imp.stage = 'vote';
    imp.vote = { id: ++this.voteSeq, eligible: this.impActive().map((p) => p.id), votes: {}, step: 'voting', deadline: Date.now() + ms, duration: ms, result: null };
    this.emit({ type: 'vote-start', voteId: imp.vote.id });
    this.setTimer(ms, () => this.impResolveVote());
    this.changed();
  }

  /** Um voto por jogador ativo, em outro jogador ativo. O servidor valida tudo; nada vem pronto do cliente. */
  castVote(id, targetId, voteId) {
    const imp = this.imp;
    const vote = imp?.vote;
    if (this.phase !== 'playing' || imp?.stage !== 'vote' || vote?.step !== 'voting') throw new GameError('Não há votação em andamento.', 'NO_VOTE');
    if (voteId !== undefined && voteId !== vote.id) throw new GameError('Essa votação já terminou.', 'STALE_VOTE');
    if (!vote.eligible.includes(id) || this.byId(id)?.eliminated) throw new GameError('Você não pode votar nesta partida.', 'NOT_ALLOWED');
    if (id in vote.votes) throw new GameError('Você já votou.', 'DUPLICATE');
    if (typeof targetId !== 'string' || !vote.eligible.includes(targetId) || this.byId(targetId)?.eliminated) throw new GameError('Voto inválido: escolha um jogador ainda na partida.', 'INVALID');
    if (targetId === id) throw new GameError('Você não pode votar em si mesmo.', 'INVALID');
    vote.votes[id] = targetId;
    const waiting = vote.eligible.filter((x) => !(x in vote.votes) && this.byId(x)?.connected && !this.byId(x)?.eliminated);
    if (!waiting.length) return this.impResolveVote();
    this.changed();
  }

  impResolveVote() {
    const imp = this.imp;
    const vote = imp?.vote;
    if (this.phase !== 'playing' || imp?.stage !== 'vote' || vote?.step !== 'voting') return;
    this.clearTimer();
    const alive = vote.eligible.filter((id) => !this.byId(id)?.eliminated);
    const votes = Object.fromEntries(Object.entries(vote.votes).filter(([, t]) => alive.includes(t)));
    const t = tally(votes, alive);
    const ms = this.timings.voteResultMs;
    vote.step = 'result';
    vote.deadline = Date.now() + ms;
    vote.duration = ms;
    vote.result = { eliminatedId: t.eliminated, tie: t.tie, counts: t.counts, votes: { ...vote.votes } };
    imp.lastVote = vote.result;
    imp.stage = 'result';
    if (t.eliminated) {
      const p = this.byId(t.eliminated);
      p.eliminated = true;
      p.lives = 0;
    }
    this.emit({ type: 'vote-result', eliminatedId: t.eliminated, tie: t.tie });
    this.setTimer(ms, () => this.impAfterVote(t.eliminated));
    this.changed();
  }

  /** Fim da pausa do resultado: alguém venceu? Senão, nova rodada de turnos (inclusive após empate, sem eliminar ninguém). */
  impAfterVote(eliminatedId) {
    if (this.phase !== 'playing' || this.imp?.stage !== 'result') return;
    const gone = eliminatedId ? this.byId(eliminatedId)?.role ?? null : null;
    const w = winner(this.settings.mode, this.impAlive(), gone);
    if (w) return this.impFinish(w);
    this.impBeginRound({});
  }

  /** Alguém saiu no meio da partida: o jogador deixa de existir para turnos, votos e contagens. */
  impOnLeave(p, wasActive) {
    if (!wasActive || this.impSpectator(p)) return this.changed();
    const w = winner(this.settings.mode, this.impAlive(), p.role);
    if (w) return this.impFinish(w);
    const imp = this.imp;
    if (imp?.stage === 'turns' && this.turn?.playerId === p.id) return this.impNext();
    if (imp?.stage === 'vote' && imp.vote?.step === 'voting') {
      const vote = imp.vote;
      const waiting = vote.eligible.filter((x) => !(x in vote.votes) && this.byId(x)?.connected && !this.byId(x)?.eliminated);
      if (!waiting.length) return this.impResolveVote();
    }
    this.changed();
  }

  impFinish(side) {
    const m = this.impMeta;
    this.finish(null, null, {
      impostor: { winner: side, mode: this.settings.mode, impostorIds: m.impostorIds, innocentChar: m.innocentChar, impostorChar: m.impostorChar, sheet: m.sheet },
    });
  }

  /** Estado público dos modos de impostor. Nenhum papel aparece aqui. */
  impView(viewerId) {
    const imp = this.imp;
    if (!imp) return null;
    const v = imp.vote;
    return {
      stage: imp.stage,
      round: imp.round,
      turnRounds: this.settings.impostor.rounds ?? 1,
      // rodada atual dentro da fase de turnos (1..turnRounds), calculada pelo que ainda falta jogar
      cycle: imp.stage === 'turns' && imp.cycle ? Math.min(imp.cycle.total, Math.floor((imp.cycle.total * imp.cycle.size - imp.queue.length - 1) / imp.cycle.size) + 1) : null,
      reveal: imp.stage === 'reveal' ? { deadline: imp.revealDeadline, duration: imp.revealDuration, ready: this.impParticipants().filter((p) => p.ready).map((p) => p.id) } : null,
      vote: v
        ? { id: v.id, step: v.step, deadline: v.deadline, duration: v.duration, eligible: [...v.eligible], voted: Object.keys(v.votes), myVote: v.votes[viewerId] ?? null, result: v.result }
        : null,
    };
  }

  /** A folha secreta do próprio jogador (nunca a de outro). */
  sheetFor(p) {
    if (!p || !p.character || !isImpostorMode(this.settings.mode)) return null;
    const allies = p.allies ? p.allies.map((id) => ({ id, nickname: this.byId(id)?.nickname ?? '?' })) : null;
    return { kind: p.role === 'impostor' && this.settings.impostor.sheet === 'word' ? 'word' : 'character', text: p.character, allies };
  }

  // ---------- visão personalizada ----------
  /**
   * O que um jogador pode saber. REGRA CRÍTICA: o personagem de um jogador ativo
   * nunca é enviado a ele. Só os outros o veem; ele próprio só depois de eliminado
   * ou no fim da partida. As sugestões dos outros e a lista do host nunca saem do
   * servidor, exceto a própria sugestão (para quem a enviou) e a lista (para o host).
   */
  viewFor(viewerId) {
    const me = this.byId(viewerId);
    const isHost = !!me?.isHost;
    const inGame = this.phase === 'playing' || this.phase === 'finished';
    const reveal = this.phase === 'finished';
    const lobby = this.phase === 'lobby';
    const impMode = isImpostorMode(this.settings.mode);
    const jgMode = isJudgmentMode(this.settings.mode);
    const spectator = impMode && !!me && this.impSpectator(me);

    return {
      code: this.code,
      phase: this.phase,
      gameNo: this.gameNo,
      scenery: lobby ? null : this.scenery,
      serverTime: Date.now(),
      you: { id: viewerId, isHost, spectator, sheet: inGame && !spectator ? this.sheetFor(me) : null },
      features: { judgeAI: !!this.judgeAI?.available }, // a IA do julgamento só existe se o servidor tiver a chave configurada
      settings: { lives: this.settings.lives, mode: this.settings.mode, endRule: this.settings.endRule, impostor: { ...this.settings.impostor }, judgment: { ...this.settings.judgment } },
      lobby: lobby
        ? {
            characters: isHost && this.settings.mode === 'host' ? [...this.characters] : null,
            mySuggestion: this.settings.mode === 'multi' || (isHost && this.settings.mode === 'host') ? null : me?.suggestion ?? null,
            myPicks: this.settings.mode === 'multi' ? [...(me?.picks ?? [])] : null,
            ready: isHost ? this.readiness() : null,
            setup: this.teamSetup ? this.setupView(viewerId) : null,
            impostorSetup: isHost && impMode ? { ...this.impSecret } : null,
            judgmentSetup: isHost && jgMode ? { judgeId: this.jgSetup.judgeId } : null,
          }
        : null,
      players: this.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        seat: p.seat,
        isHost: p.isHost,
        connected: p.connected,
        lives: p.lives,
        eliminated: p.eliminated,
        bot: p.bot,
        team: p.team ?? null,
        look: this.jgLookOf(p, p.look ?? DEFAULT_LOOK), // o Julgador aparece com o visual fixo; p.look continua guardado
        judge: jgMode && !!this.jg && p.id === this.jg.judgeId,
        score: jgMode && this.jg ? p.score ?? 0 : null,
        done: !!p.done,
        spectator: impMode && this.impSpectator(p),
        submitted: lobby && !impMode && !jgMode && (!p.isHost || this.settings.mode !== 'host') && !p.bot ? (this.settings.mode === 'multi' ? !!p.picks?.length : !!p.suggestion) : null,
        character: impMode ? (reveal ? p.character : null) : inGame && (reveal || p.id !== viewerId || p.eliminated || p.done) ? p.character : null,
        role: impMode && reveal ? p.role : null,
      })),
      teams: this.teams
        ? [1, 2].map((t) => {
            const members = this.teams[t].filter((id) => this.byId(id));
            return { id: t, name: `Time ${t}`, members, size: members.length, solved: members.filter((id) => this.byId(id).done).length };
          })
        : null,
      turn: this.turn ? { ...this.turn } : null,
      imp: impMode ? this.impView(viewerId) : null,
      jg: jgMode ? this.jgView(viewerId) : null,
      result: this.result,
    };
  }

  /** Etapa de seleção adicional vista por um jogador (nenhum personagem aparece aqui). */
  setupView(viewerId) {
    const s = this.teamSetup;
    const r = this.byId(s.receiverId);
    return {
      receiver: { id: r.id, nickname: r.nickname, team: r.team, slot: this.teams[r.team].indexOf(r.id) + 1 },
      smallTeam: s.smallTeam,
      suggesters: s.suggesters,
      submitted: Object.fromEntries(s.suggesters.map((id) => [id, !!s.suggestions[id]])),
      mine: s.suggestions[viewerId] ?? null,
      rejected: s.rejected,
    };
  }
}

installJudgment(Room, { GameError, LIMITS });
