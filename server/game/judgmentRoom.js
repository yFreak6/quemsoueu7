// Orquestração do modo JULGAMENTO dentro de uma sala. Os métodos são instalados no protótipo de Room
// (installJudgment) para manter Room.js enxuto; toda regra é decidida AQUI, no servidor:
// quem é o Julgador, quem pode responder, ordem das etapas, anonimato, vencedor, pontos e fim da partida.
//
// Etapas de uma rodada (jg.stage):
//   theme     → o Julgador humano escreve o tema (ou a IA o gera)
//   answer    → cada jogador elegível envia UMA resposta (ninguém vê a dos outros)
//   judging   → respostas embaralhadas e anônimas (A, B, C…); o Julgador humano escolhe / a IA "computa"
//   reveal    → vencedor destacado, depois os autores; o vencedor ganha 1 ponto
//   annulled  → rodada sem resposta ou sem decisão a tempo: não conta, e a mesma rodada recomeça
//
// Depois da última rodada normal, empate no topo gera rodada de desempate só entre os empatados,
// repetida até haver um único líder.

import {
  ANSWER_MAX, JUDGE_LOOK, MAX_ROUNDS, MIN_ROUNDS, THEME_MAX, THEME_MIN,
  buildAnonymous, cleanText, leaders, pickJudge, repeatsTheme, validateJudgment,
} from './judgment.js';

/** Rodadas anuladas seguidas que encerram a partida (evita laço infinito com jogadores ausentes). */
export const IDLE_LIMIT = 2;

export function installJudgment(Room, { GameError }) {
  const proto = Room.prototype;

  /** Configuração (só o host, só no lobby). Valores inválidos são recusados, nunca "corrigidos" em silêncio. */
  proto.setJudgmentCfg = function setJudgmentCfg(raw) {
    if (!raw || typeof raw !== 'object') throw new GameError('Configuração do julgamento inválida.', 'INVALID');
    const cfg = this.settings.judgment;
    if (raw.pick !== undefined) {
      if (raw.pick !== 'random' && raw.pick !== 'host') throw new GameError('Escolha entre sorteio e escolher o Julgador.', 'INVALID');
      cfg.pick = raw.pick;
    }
    if (raw.rounds !== undefined) {
      const n = Math.round(Number(raw.rounds));
      if (!Number.isFinite(n) || n < MIN_ROUNDS || n > MAX_ROUNDS) throw new GameError(`Escolha de ${MIN_ROUNDS} a ${MAX_ROUNDS} rodadas.`, 'INVALID');
      cfg.rounds = n;
    }
    if (raw.judgeId !== undefined) {
      const id = raw.judgeId === null ? null : String(raw.judgeId);
      if (id !== null && !this.byId(id)) throw new GameError('Jogador não encontrado.', 'INVALID');
      this.jgSetup.judgeId = id;
    }
  };

  proto.judgmentReadiness = function judgmentReadiness() {
    return validateJudgment(this.settings.mode, this.settings.judgment, {
      n: this.players.length,
      judgeId: this.jgSetup.judgeId,
      ids: this.players.map((p) => p.id),
      aiAvailable: !!this.judgeAI?.available,
    });
  };

  /** Jogadores que ainda estão na partida (quem saiu fica `eliminated`). */
  proto.jgActive = function jgActive() {
    return this.players.filter((p) => !p.eliminated);
  };
  /** Quem pode responder: ativos, menos o Julgador humano. */
  proto.jgAnswerers = function jgAnswerers() {
    return this.jgActive().filter((p) => p.id !== this.jg?.judgeId);
  };
  proto.jgScores = function jgScores() {
    return Object.fromEntries(this.players.map((p) => [p.id, p.score ?? 0]));
  };

  // ---------- início ----------
  proto.startJudgment = function startJudgment() {
    const mode = this.settings.mode;
    const cfg = this.settings.judgment;
    let judgeId = null;
    if (mode === 'judge_human') {
      // SORTEIO: todos os jogadores da sala têm a mesma chance, inclusive o host. ESCOLHER: o host define (pode ser ele mesmo).
      judgeId = cfg.pick === 'host' ? this.jgSetup.judgeId : pickJudge(this.players.map((p) => p.id));
    }
    this.players.forEach((p) => {
      p.score = 0;
      p.lives = 0;
      p.eliminated = false;
      p.character = null;
      p.suggestion = null;
      p.picks = [];
      p.done = false;
      p.role = null;
      p.allies = null;
      p.botTurns = 0;
    });
    this.gameNo += 1;
    this.phase = 'playing';
    this.result = null;
    this.solvedOrder = [];
    this.turn = null;
    this.jg = {
      stage: 'theme', round: 0, played: 0, total: cfg.rounds, tiebreak: false, judgeId, theme: null, used: [], eligible: [], answers: {}, order: [],
      resolved: false, winnerId: null, winnerLabel: null, verdict: null, deadline: null, duration: null, canPickAt: null, idle: 0, annulReason: null,
      aiState: null, generating: false, seq: 0, history: [],
    };
    this.emit({ type: 'game-start', playerId: judgeId, mode });
    this.jgBeginRound({});
  };

  proto.jgSetStage = function jgSetStage(stage, ms) {
    const jg = this.jg;
    jg.stage = stage;
    jg.seq += 1;
    jg.deadline = ms ? Date.now() + ms : null;
    jg.duration = ms ?? null;
  };

  proto.jgBeginRound = function jgBeginRound({ tiebreak = false } = {}) {
    const jg = this.jg;
    if (this.phase !== 'playing' || !jg) return;
    const act = this.jgAnswerers().map((p) => p.id);
    const eligible = tiebreak ? leaders(this.jgScores(), act) : act;
    jg.round += 1;
    jg.tiebreak = tiebreak;
    jg.theme = null;
    jg.answers = {};
    jg.order = [];
    jg.resolved = false;
    jg.winnerId = null;
    jg.winnerLabel = null;
    jg.verdict = null;
    jg.eligible = eligible;
    jg.aiState = null;
    jg.annulReason = null;
    jg.canPickAt = null;
    const human = this.settings.mode === 'judge_human';
    this.jgSetStage('theme', human ? this.timings.judgeThemeMs : this.timings.judgeThemeAiMs);
    jg.generating = !human;
    this.emit({ type: 'judg-round', round: jg.round, tiebreak });
    if (human) this.setTimer(this.timings.judgeThemeMs, () => this.jgAnnul('theme-timeout'));
    else {
      this.setTimer(this.timings.judgeThemeAiMs, () => this.jgAiFail('theme', new Error('tempo esgotado')));
      this.jgGenerateTheme(jg.seq);
    }
    this.changed();
  };

  // ---------- tema ----------
  /** Julgador humano envia o tema. Depois disso ele não pode mais mudá-lo. */
  proto.submitTheme = function submitTheme(by, text) {
    const jg = this.jg;
    if (this.phase !== 'playing' || !jg || this.settings.mode !== 'judge_human') throw new GameError('Não há tema para escrever agora.', 'NOT_ALLOWED');
    if (by !== jg.judgeId) throw new GameError('Só o Julgador escreve o tema.', 'NOT_JUDGE');
    if (jg.stage !== 'theme' || jg.theme) throw new GameError('O tema desta rodada já foi enviado.', 'NOT_ALLOWED');
    const theme = cleanText(text, THEME_MAX);
    if (theme.length < THEME_MIN) throw new GameError(`Escreva um tema com pelo menos ${THEME_MIN} caracteres.`, 'INVALID');
    jg.theme = theme;
    jg.used.push(theme);
    this.jgOpenAnswers();
  };

  /** IA gera o tema (assíncrono). Uma resposta atrasada de uma etapa que já passou é descartada. */
  proto.jgGenerateTheme = async function jgGenerateTheme(seq) {
    const jg = this.jg;
    const stale = () => this.jg !== jg || jg.seq !== seq || jg.stage !== 'theme' || this.phase !== 'playing';
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const style = Math.random() < 0.5 ? 'geral' : 'específico';
        const raw = await this.judgeAI.generateTheme({ used: [...jg.used], style });
        if (stale()) return;
        const theme = cleanText(raw, THEME_MAX);
        if (theme.length < THEME_MIN || repeatsTheme(theme, jg.used)) {
          last = new Error('tema vazio ou repetido');
          continue;
        }
        jg.theme = theme;
        jg.used.push(theme);
        return this.jgOpenAnswers();
      } catch (e) {
        if (stale()) return;
        last = e;
      }
    }
    if (!stale()) this.jgAiFail('theme', last);
  };

  proto.jgOpenAnswers = function jgOpenAnswers() {
    const jg = this.jg;
    jg.generating = false;
    jg.eligible = jg.eligible.filter((id) => !this.byId(id)?.eliminated);
    this.jgSetStage('answer', this.timings.judgeAnswerMs);
    this.setTimer(this.timings.judgeAnswerMs, () => this.jgCloseAnswers());
    this.emit({ type: 'judg-theme', round: jg.round, theme: jg.theme });
    this.changed();
  };

  // ---------- respostas ----------
  /** Uma resposta por jogador elegível e por rodada; depois de enviada não muda. */
  proto.submitAnswer = function submitAnswer(by, text) {
    const jg = this.jg;
    if (this.phase !== 'playing' || !jg || jg.stage !== 'answer') throw new GameError('Não é hora de responder.', 'NOT_ALLOWED');
    if (!jg.eligible.includes(by) || this.byId(by)?.eliminated) throw new GameError('Você não participa desta rodada.', 'NOT_ALLOWED');
    if (by in jg.answers) throw new GameError('Você já enviou a sua resposta.', 'DUPLICATE');
    const answer = cleanText(text, ANSWER_MAX);
    if (!answer) throw new GameError('Escreva a sua resposta.', 'INVALID');
    jg.answers[by] = answer;
    this.emit({ type: 'judg-answered', playerId: by });
    if (this.jgCheckAnswersDone()) return;
    this.changed();
  };

  /** Fecha a etapa quando todos os elegíveis CONECTADOS responderam (quem caiu não trava a partida). */
  proto.jgCheckAnswersDone = function jgCheckAnswersDone() {
    const jg = this.jg;
    if (!jg || jg.stage !== 'answer' || !Object.keys(jg.answers).length) return false;
    const waiting = jg.eligible.filter((id) => !(id in jg.answers) && this.byId(id)?.connected && !this.byId(id)?.eliminated);
    if (waiting.length) return false;
    this.jgCloseAnswers();
    return true;
  };

  proto.jgCloseAnswers = function jgCloseAnswers() {
    const jg = this.jg;
    if (this.phase !== 'playing' || !jg || jg.stage !== 'answer') return;
    if (!Object.keys(jg.answers).length) return this.jgAnnul('no-answers');
    jg.order = buildAnonymous(jg.answers); // embaralha e dá as letras; os autores ficam só no servidor
    if (this.settings.mode === 'judge_human') {
      const readMs = this.timings.judgeReadMs;
      this.jgSetStage('judging', readMs + this.timings.judgeChooseMs);
      jg.canPickAt = Date.now() + readMs; // o servidor só aceita a escolha depois do tempo de leitura
      this.setTimer(readMs + this.timings.judgeChooseMs, () => this.jgAnnul('judge-timeout'));
    } else {
      this.jgSetStage('judging', this.timings.judgeAiMs);
      jg.aiState = 'computing';
      this.setTimer(this.timings.judgeAiMs, () => this.jgAiFail('judge', new Error('tempo esgotado')));
      this.jgRunAI(jg.seq);
    }
    this.emit({ type: 'judg-answers', round: jg.round });
    this.changed();
  };

  // ---------- decisão ----------
  proto.chooseWinner = function chooseWinner(by, label) {
    const jg = this.jg;
    if (this.phase !== 'playing' || !jg || this.settings.mode !== 'judge_human') throw new GameError('Não há resposta para escolher agora.', 'NOT_ALLOWED');
    if (by !== jg.judgeId) throw new GameError('Só o Julgador escolhe a resposta vencedora.', 'NOT_JUDGE');
    if (jg.stage !== 'judging' || jg.resolved) throw new GameError('A rodada já foi decidida.', 'NOT_ALLOWED');
    if (Date.now() < jg.canPickAt) throw new GameError('Aguarde: todos ainda estão lendo as respostas.', 'TOO_EARLY');
    if (typeof label !== 'string' || !jg.order.some((o) => o.label === label)) throw new GameError('Resposta inválida.', 'INVALID');
    this.jgResolve(label, null);
  };

  /** A IA analisa só o tema e os textos com letras: nenhuma identidade chega a ela. */
  proto.jgRunAI = async function jgRunAI(seq) {
    const jg = this.jg;
    const stale = () => this.jg !== jg || jg.seq !== seq || jg.stage !== 'judging' || this.phase !== 'playing';
    const payload = { theme: jg.theme, answers: jg.order.map(({ label, text }) => ({ label, text })) };
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const v = await this.judgeAI.judge(payload);
        if (stale()) return;
        if (!jg.order.some((o) => o.label === v.winner)) throw new Error('resposta inexistente');
        return this.jgResolve(v.winner, { justification: v.justification ?? '', kind: v.kind ?? 'subjective', uncertain: !!v.uncertain });
      } catch (e) {
        if (stale()) return;
        last = e;
      }
    }
    if (!stale()) this.jgAiFail('judge', last);
  };

  proto.jgAiFail = function jgAiFail(where, err) {
    const jg = this.jg;
    if (this.phase !== 'playing' || !jg) return;
    this.log?.(`[julgamento] IA falhou (${where}):`, err?.message ?? err);
    this.emit({ type: 'judg-ai-error', where });
    this.jgFinish('ai-error');
  };

  /** Pontua UMA vez por rodada (resolved evita duplicar por dois cliques, IA + timer, reconexão…). */
  proto.jgResolve = function jgResolve(label, verdict) {
    const jg = this.jg;
    if (this.phase !== 'playing' || !jg || jg.resolved || jg.stage !== 'judging') return;
    const entry = jg.order.find((o) => o.label === label);
    const winner = entry && this.byId(entry.playerId);
    if (!winner) return;
    jg.resolved = true;
    jg.winnerId = winner.id;
    jg.winnerLabel = label;
    jg.verdict = verdict;
    jg.aiState = null;
    winner.score = (winner.score ?? 0) + 1;
    if (!jg.tiebreak) jg.played += 1;
    jg.idle = 0;
    jg.history.push({ round: jg.round, theme: jg.theme, winnerId: winner.id, tiebreak: jg.tiebreak });
    const ms = this.timings.judgeRevealMs + (this.timings.judgeRevealPerAnswerMs ?? 0) * jg.order.length;
    this.jgSetStage('reveal', ms);
    this.setTimer(ms, () => this.jgAfterReveal());
    this.emit({ type: 'judg-result', round: jg.round, playerId: winner.id, label });
    this.changed();
  };

  /** Fim da revelação: próxima rodada, desempate ou fim da partida. */
  proto.jgAfterReveal = function jgAfterReveal() {
    const jg = this.jg;
    if (this.phase !== 'playing' || !jg || jg.stage !== 'reveal') return;
    const act = this.jgAnswerers().map((p) => p.id);
    if (act.length < 2) return this.jgFinish('few-players');
    if (!jg.tiebreak && jg.played < jg.total) return this.jgBeginRound({});
    const top = leaders(this.jgScores(), act);
    if (top.length === 1) return this.jgFinish('complete');
    return this.jgBeginRound({ tiebreak: true }); // empate na 1ª colocação: nova rodada só entre os empatados
  };

  /** Rodada sem respostas, sem tema ou sem decisão a tempo: não conta; recomeça (ou encerra após IDLE_LIMIT seguidas). */
  proto.jgAnnul = function jgAnnul(reason) {
    const jg = this.jg;
    if (this.phase !== 'playing' || !jg || !['theme', 'answer', 'judging'].includes(jg.stage) || jg.resolved) return;
    jg.idle += 1;
    this.emit({ type: 'judg-annul', reason, round: jg.round });
    if (jg.idle >= IDLE_LIMIT) return this.jgFinish('inactive');
    jg.annulReason = reason;
    jg.aiState = null;
    jg.generating = false;
    jg.round -= 1; // a rodada anulada não conta: a próxima reaproveita o número
    this.jgSetStage('annulled', this.timings.judgeAnnulMs);
    this.setTimer(this.timings.judgeAnnulMs, () => {
      if (this.jg?.stage === 'annulled') this.jgBeginRound({ tiebreak: this.jg.tiebreak });
    });
    this.changed();
  };

  proto.jgFinish = function jgFinish(reason) {
    const jg = this.jg;
    if (!jg || this.phase !== 'playing') return;
    jg.seq += 1; // invalida qualquer resposta da IA que ainda esteja a caminho
    jg.aiState = null;
    jg.generating = false;
    const top = leaders(this.jgScores(), this.jgAnswerers().map((p) => p.id));
    const winnerId = top.length === 1 ? top[0] : null;
    this.finish(winnerId, null, {
      judgment: {
        reason, mode: this.settings.mode, judgeId: jg.judgeId, rounds: jg.total,
        scores: this.players.filter((p) => p.id !== jg.judgeId).map((p) => ({ id: p.id, score: p.score ?? 0 })),
        history: jg.history.map((h) => ({ ...h })),
      },
    });
  };

  // ---------- saídas e quedas ----------
  /** Alguém saiu de vez no meio da partida (já marcado como eliminated/offline por Room.leave). */
  proto.jgOnLeave = function jgOnLeave(p) {
    const jg = this.jg;
    if (this.phase !== 'playing' || !jg) return this.changed();
    if (this.settings.mode === 'judge_human' && p.id === jg.judgeId) return this.jgFinish('judge-left');
    if (this.jgAnswerers().length < 2) return this.jgFinish('few-players');
    if (jg.stage === 'answer' && this.jgCheckAnswersDone()) return undefined;
    return this.changed();
  };

  /** Queda de conexão: se só faltavam respostas de quem caiu, a rodada segue. A volta (rejoin) recebe o estado atual. */
  proto.jgOnDisconnect = function jgOnDisconnect() {
    if (this.phase === 'playing' && this.jg?.stage === 'answer') this.jgCheckAnswersDone();
  };

  // ---------- visão ----------
  /**
   * Estado do julgamento para UM jogador. Anonimato: antes da revelação, nenhuma resposta traz autor
   * (nem id, nem posição de envio); durante o envio só se sabe QUEM já enviou, nunca o quê.
   */
  proto.jgView = function jgView(viewerId) {
    const jg = this.jg;
    if (!jg) return null;
    const revealNow = jg.stage === 'reveal';
    const showAnswers = (jg.stage === 'judging' || revealNow) && jg.order.length > 0;
    return {
      mode: this.settings.mode,
      stage: jg.stage,
      round: jg.round,
      played: jg.played,
      total: jg.total,
      tiebreak: jg.tiebreak,
      judgeId: jg.judgeId,
      theme: jg.theme,
      generating: jg.generating,
      aiState: jg.aiState,
      deadline: jg.deadline,
      duration: jg.duration,
      canPickAt: jg.stage === 'judging' ? jg.canPickAt : null,
      eligible: [...jg.eligible],
      submitted: jg.stage === 'answer' ? Object.keys(jg.answers) : [],
      myAnswer: jg.stage === 'answer' ? jg.answers[viewerId] ?? null : null,
      answers: showAnswers ? jg.order.map((o) => (revealNow ? { label: o.label, text: o.text, playerId: o.playerId } : { label: o.label, text: o.text })) : null,
      verdict: revealNow ? { winnerId: jg.winnerId, label: jg.winnerLabel, ...(jg.verdict ?? {}) } : null,
      annul: jg.stage === 'annulled' ? { reason: jg.annulReason } : null,
      idle: jg.idle,
    };
  };

  /** Visual mostrado de um jogador: o Julgador sempre aparece com o visual fixo; o `look` guardado nunca é tocado. */
  proto.jgLookOf = function jgLookOf(p, fallback) {
    return this.jg && p.id === this.jg.judgeId ? JUDGE_LOOK : fallback;
  };
}
