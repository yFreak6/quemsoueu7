// Testes do modo JULGAMENTO (O JULGADOR e O JULGADOR (IA)): regras puras, sala (Room), rede (handlers reais
// do Socket.io simulado em memória) e o cliente HTTP da IA (contra um servidor HTTP local que imita a API).
//
// ATENÇÃO sobre a IA: aqui a IA é um "dublê de teste" (mock) injetado na sala para exercitar a ORQUESTRAÇÃO
// (tema, anonimato, pontuação, falhas). A qualidade do julgamento de um modelo real não é testável offline.

import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { GameError, Room } from '../game/Room.js';
import { createJudgeAI } from '../game/judgeAI.js';
import { DEFAULT_LOOK } from '../game/look.js';
import { JUDGE_LOOK, buildAnonymous, cleanText, labelFor, leaders, pickJudge, repeatsTheme } from '../game/judgment.js';
import { createGameServer } from '../net/gameServer.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const codeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    return e instanceof GameError ? e.code : `ERR:${e.message}`;
  }
  return null;
};
const FAST = { judgeThemeMs: 5000, judgeThemeAiMs: 5000, judgeAnswerMs: 5000, judgeReadMs: 0, judgeChooseMs: 5000, judgeAiMs: 5000, judgeRevealMs: 30, judgeRevealPerAnswerMs: 0, judgeAnnulMs: 30, hostGraceGameMs: 60_000 };
const nick = (room, id) => room.byId(id).nickname;
/** Espera (com polling) até a condição valer; falha com mensagem clara se estourar o prazo. */
async function until(cond, ms = 1500, what = 'condição') {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) assert.fail(`tempo esgotado esperando: ${what}`);
    await sleep(5);
  }
}

/** Sala em lobby com host + `commons` jogadores, no modo escolhido. */
function lobby({ mode = 'judge_human', commons = 3, cfg = {}, ai, timings = {} } = {}) {
  const room = new Room('JUDG', { timings: { ...FAST, ...timings }, judgeAI: ai ?? { available: false }, log: () => {} });
  const host = room.createHost('s-host', 'Hostão');
  const others = Array.from({ length: commons }, (_, i) => room.addPlayer(`s${i}`, ['Ana', 'Beto', 'Carla', 'Davi', 'Eva', 'Fábio'][i]));
  room.setSettings(host.id, { mode, judgment: cfg });
  return { room, host, others, all: [host, ...others] };
}
/** Julgador humano escolhido pelo host (determinístico). */
function humanGame({ commons = 3, rounds = 2, judge = 'host', timings = {} } = {}) {
  const l = lobby({ commons, cfg: { pick: 'host', rounds }, timings });
  const j = judge === 'host' ? l.host : l.others[judge];
  l.room.setSettings(l.host.id, { judgment: { judgeId: j.id } });
  l.room.start(l.host.id);
  return { ...l, judge: j };
}
/** Joga uma rodada humana inteira: tema, respostas (`R-<nick>`) e escolha da resposta escrita por `winner`. */
async function humanRound(g, winner, theme = 'Personagem mais forte') {
  const { room, judge } = g;
  room.submitTheme(judge.id, theme);
  for (const id of room.jg.eligible) room.submitAnswer(id, `R-${nick(room, id)}`);
  assert.equal(room.jg.stage, 'judging');
  const label = room.jg.order.find((o) => o.playerId === winner.id).label;
  room.chooseWinner(judge.id, label);
  return label;
}

// ---------------------------------------------------------------- regras puras
test('puro: rótulos, limpeza de texto, líderes e temas repetidos', () => {
  assert.deepEqual([0, 1, 2, 9].map(labelFor), ['A', 'B', 'C', 'J']);
  assert.equal(cleanText('  oi   <b>mundo</b>  ', 20), 'oi b mundo /b');
  assert.equal(cleanText('x'.repeat(500), 80).length, 80);
  assert.deepEqual(leaders({ a: 2, b: 3, c: 3 }, ['a', 'b', 'c']), ['b', 'c']);
  assert.deepEqual(leaders({}, ['a', 'b']), ['a', 'b']);
  assert.ok(repeatsTheme('Personagem mais FORTE!', ['personagem mais forte']));
  assert.ok(!repeatsTheme('Personagem mais alto', ['personagem mais forte']));
});

test('1) sorteio do Julgador: uniforme (função pura) e todos podem ser sorteados na sala', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual([0, 0.26, 0.51, 0.76, 0.999].map((r) => pickJudge(ids, () => r)), ['a', 'b', 'c', 'd', 'd']);
  const seen = new Map();
  for (let i = 0; i < 400; i++) {
    const { room } = lobby({ commons: 3, cfg: { pick: 'random' } });
    room.start(room.host.id);
    const who = nick(room, room.jg.judgeId); // os ids mudam a cada sala; o nickname identifica o jogador
    seen.set(who, (seen.get(who) ?? 0) + 1);
    room.destroy();
  }
  assert.equal(seen.size, 4, 'os 4 jogadores (inclusive o host) foram sorteados alguma vez');
  for (const n of seen.values()) assert.ok(n > 50, `distribuição suspeita: ${[...seen.values()]}`); // esperado ~100 cada
});

test('2 e 3) o host escolhe o Julgador e pode escolher a si mesmo', () => {
  for (const idx of [0, 1, 2]) {
    const { room, host, others } = lobby({ cfg: { pick: 'host' } });
    assert.ok(room.readiness().missing.some((m) => /Escolha quem será o Julgador/.test(m)), 'sem escolha não inicia');
    room.setSettings(host.id, { judgment: { judgeId: others[idx].id } });
    room.start(host.id);
    assert.equal(room.jg.judgeId, others[idx].id);
    room.destroy();
  }
  const { room, host } = lobby({ cfg: { pick: 'host' } });
  room.setSettings(host.id, { judgment: { judgeId: host.id } });
  assert.ok(room.readiness().ok);
  room.start(host.id);
  assert.equal(room.jg.judgeId, host.id, 'o host pode ser o Julgador');
  assert.ok(room.viewFor(host.id).players.find((p) => p.id === host.id).judge);
  room.destroy();
});

test('configuração: só o host, só no lobby, valores inválidos recusados', () => {
  const { room, host, others } = lobby();
  assert.equal(codeOf(() => room.setSettings(others[0].id, { judgment: { rounds: 4 } })), 'NOT_HOST');
  assert.equal(codeOf(() => room.setSettings(host.id, { judgment: { rounds: 0 } })), 'INVALID');
  assert.equal(codeOf(() => room.setSettings(host.id, { judgment: { rounds: 11 } })), 'INVALID');
  assert.equal(codeOf(() => room.setSettings(host.id, { judgment: { pick: 'x' } })), 'INVALID');
  assert.equal(codeOf(() => room.setSettings(host.id, { judgment: { judgeId: 'nao-existe' } })), 'INVALID');
  room.setSettings(host.id, { judgment: { rounds: 7, pick: 'host' } });
  assert.deepEqual(room.viewFor(others[0].id).settings.judgment, { pick: 'host', rounds: 7 });
  assert.equal(room.viewFor(others[0].id).lobby.judgmentSetup, null, 'a escolha do host só aparece para ele');
  assert.deepEqual(room.viewFor(host.id).lobby.judgmentSetup, { judgeId: null });
  assert.equal(codeOf(() => room.start(host.id)), 'NOT_READY', 'escolher o Julgador é obrigatório antes de iniciar');
  room.destroy();
});

test('prontidão: mínimo de jogadores por modo e IA indisponível bloqueia o início', () => {
  const h = lobby({ mode: 'judge_human', commons: 1, cfg: { pick: 'random' } });
  assert.ok(h.room.readiness().missing.some((m) => /pelo menos 3 jogadores/.test(m)));
  assert.equal(codeOf(() => h.room.start(h.host.id)), 'NOT_READY');
  const a = lobby({ mode: 'judge_ai', commons: 1 });
  assert.ok(a.room.readiness().missing.some((m) => /ANTHROPIC_API_KEY/.test(m)), 'IA sem chave: informa o que configurar');
  assert.equal(a.room.viewFor(a.host.id).features.judgeAI, false);
  const ok = lobby({ mode: 'judge_ai', commons: 1, ai: { available: true } });
  assert.ok(ok.room.readiness().ok);
  assert.equal(ok.room.viewFor(ok.host.id).features.judgeAI, true);
  for (const r of [h.room, a.room, ok.room]) r.destroy();
});

test('modos novos não aceitam bots e trocar de modo continua funcionando', () => {
  const { room, host } = lobby({ commons: 2 });
  room.setSettings(host.id, { mode: 'host' });
  room.addBot(host.id);
  assert.equal(codeOf(() => room.setSettings(host.id, { mode: 'judge_ai' })), 'NOT_ALLOWED');
  assert.equal(codeOf(() => room.setSettings(host.id, { mode: 'inexistente' })), 'INVALID');
  room.destroy();
});

// ---------------------------------------------------------------- visual do Julgador
test('4 e 5) o Julgador aparece com o visual fixo; a customização dele continua guardada e volta depois', () => {
  const { room, host, others } = lobby({ cfg: { pick: 'host' } });
  const custom = { color: 'red', hat: 'tophat', neck: 'scarf', outfit: 'suit', outfitColor: 'navy', face: 'sunglasses' };
  room.setLook(others[1].id, custom);
  room.setSettings(host.id, { judgment: { judgeId: others[1].id } });
  // no lobby ninguém é Julgador ainda: todos veem o visual personalizado
  assert.deepEqual(room.viewFor(host.id).players.find((p) => p.id === others[1].id).look, custom);
  room.start(host.id);
  for (const viewer of [host, ...others]) {
    const v = room.viewFor(viewer.id);
    const j = v.players.find((p) => p.id === others[1].id);
    assert.deepEqual(j.look, JUDGE_LOOK, 'todos veem o Julgador com o visual fixo');
    assert.equal(j.judge, true);
    assert.deepEqual(v.players.find((p) => p.id === others[0].id).look, DEFAULT_LOOK, 'os demais seguem com o próprio visual');
    assert.equal(v.players.filter((p) => p.judge).length, 1);
  }
  assert.deepEqual(room.byId(others[1].id).look, custom, 'a personalização original não foi apagada nem alterada');
  room.reset(host.id);
  assert.deepEqual(room.viewFor(host.id).players.find((p) => p.id === others[1].id).look, custom, 'fora do papel, o visual personalizado volta');
  room.destroy();
});

test('o visual do Julgador não pode ser escolhido por um jogador (ids "judge" são recusados)', () => {
  const { room, others } = lobby();
  assert.equal(codeOf(() => room.setLook(others[0].id, { ...DEFAULT_LOOK, color: 'judge' })), 'INVALID');
  assert.equal(codeOf(() => room.setLook(others[0].id, { ...DEFAULT_LOOK, hat: 'judge' })), 'INVALID');
  room.destroy();
});

// ---------------------------------------------------------------- tema
test('6) o Julgador envia o tema; os outros recebem; ninguém mais escreve; não muda depois', () => {
  const g = humanGame();
  const { room, judge, all } = g;
  const v0 = room.viewFor(judge.id).jg;
  assert.deepEqual([v0.stage, v0.theme, v0.round, v0.total], ['theme', null, 1, 2]);
  const other = all.find((p) => p.id !== judge.id);
  assert.equal(codeOf(() => room.submitTheme(other.id, 'Tema do intruso')), 'NOT_JUDGE');
  assert.equal(codeOf(() => room.submitAnswer(judge.id, 'x')), 'NOT_ALLOWED', 'ainda não é hora de responder');
  assert.equal(codeOf(() => room.submitTheme(judge.id, '  ')), 'INVALID');
  room.submitTheme(judge.id, '  Personagem   mais forte ');
  for (const p of all) {
    const v = room.viewFor(p.id).jg;
    assert.equal(v.theme, 'Personagem mais forte');
    assert.equal(v.stage, 'answer');
  }
  assert.equal(codeOf(() => room.submitTheme(judge.id, 'Outro tema')), 'NOT_ALLOWED', 'o tema não pode mudar depois');
  assert.equal(room.jg.theme, 'Personagem mais forte');
  room.destroy();
});

// ---------------------------------------------------------------- respostas
test('7 e 8) uma resposta por jogador; o Julgador não responde; sem alterar depois', () => {
  const g = humanGame({ commons: 3, judge: 0 });
  const { room, judge, all } = g;
  room.submitTheme(judge.id, 'Personagem mais forte');
  const players = all.filter((p) => p.id !== judge.id);
  assert.deepEqual([...room.jg.eligible].sort(), players.map((p) => p.id).sort());
  assert.equal(codeOf(() => room.submitAnswer(judge.id, 'Goku')), 'NOT_ALLOWED', 'o Julgador não responde a própria rodada');
  assert.equal(codeOf(() => room.submitAnswer(players[0].id, '   ')), 'INVALID');
  room.submitAnswer(players[0].id, 'Bob Esponja');
  assert.equal(codeOf(() => room.submitAnswer(players[0].id, 'Lula Molusco')), 'DUPLICATE', 'resposta duplicada bloqueada');
  assert.equal(room.jg.answers[players[0].id], 'Bob Esponja', 'a primeira resposta permanece');
  assert.equal(room.viewFor(players[0].id).jg.myAnswer, 'Bob Esponja');
  assert.equal(room.viewFor(players[1].id).jg.myAnswer, null);
  room.destroy();
});

test('quem já enviou aparece para todos, sem o conteúdo; ninguém vê a resposta dos outros durante o envio', () => {
  const g = humanGame({ commons: 3, judge: 0 });
  const { room, judge, all } = g;
  room.submitTheme(judge.id, 'Personagem mais forte');
  const [a, b, c] = all.filter((p) => p.id !== judge.id);
  room.submitAnswer(a.id, 'RespostaSecretaDaAna');
  for (const viewer of all) {
    const v = room.viewFor(viewer.id);
    assert.deepEqual(v.jg.submitted, [a.id], 'todos sabem QUEM já enviou');
    assert.equal(v.jg.answers, null, 'nenhuma lista de respostas antes de todos enviarem');
    if (viewer.id !== a.id) assert.ok(!JSON.stringify(v).includes('RespostaSecretaDaAna'), `${viewer.nickname} não pode ver a resposta de outro`);
  }
  room.submitAnswer(b.id, 'Segunda');
  assert.equal(room.jg.stage, 'answer', 'ainda falta o ' + c.nickname);
  room.submitAnswer(c.id, 'Terceira');
  assert.equal(room.jg.stage, 'judging', 'todos enviaram: avança sozinho');
  room.destroy();
});

// ---------------------------------------------------------------- anonimato
test('9) apresentação anônima: embaralhada, com letras e sem nenhuma informação de autoria', () => {
  const g = humanGame({ commons: 4, judge: 0 });
  const { room, judge, all } = g;
  room.submitTheme(judge.id, 'Personagem mais forte');
  const players = all.filter((p) => p.id !== judge.id);
  for (const p of players) room.submitAnswer(p.id, `Resp-${p.nickname}`);
  assert.equal(room.jg.stage, 'judging');
  const nicks = all.map((p) => p.nickname);
  const first = JSON.stringify(room.viewFor(judge.id).jg.answers);
  for (const viewer of all) {
    const v = room.viewFor(viewer.id);
    assert.deepEqual(v.jg.answers.map((a) => a.label), ['A', 'B', 'C', 'D']);
    assert.ok(v.jg.answers.every((a) => Object.keys(a).sort().join() === 'label,text'), 'só letra e texto');
    assert.equal(JSON.stringify(v.jg.answers), first, 'todos veem a mesma lista (inclusive o Julgador)');
    assert.deepEqual(v.jg.submitted, [], 'depois do envio, nem quem enviou aparece em lista alguma');
    assert.equal(v.jg.verdict, null);
    // os textos (que carregam o nick só no teste) não são ligados a nenhum id no que o cliente recebe
    for (const a of v.jg.answers) assert.ok(!('playerId' in a) && !('nickname' in a) && !('author' in a));
    assert.ok(v.players.every((p) => p.character === null), 'nenhum personagem vaza');
    assert.ok(nicks.every((n) => !first.includes(`"${n}"`)), 'a lista anônima não contém nicks entre aspas');
  }
  room.destroy();
});

test('9b) embaralhamento: a ordem de envio não define a ordem das letras', () => {
  const answers = { p1: 'um', p2: 'dois', p3: 'tres', p4: 'quatro' };
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(buildAnonymous(answers).map((a) => a.text).join('>'));
  assert.ok(seen.size > 10, 'muitas ordens diferentes');
  // com um gerador fixo a ordem é reprodutível e as letras seguem a ordem embaralhada
  const fixed = buildAnonymous(answers, () => 0);
  assert.deepEqual(fixed.map((a) => a.label), ['A', 'B', 'C', 'D']);
  assert.notDeepEqual(fixed.map((a) => a.text), ['um', 'dois', 'tres', 'quatro']);
});

// ---------------------------------------------------------------- escolha do vencedor (humano)
test('10) só o Julgador escolhe, só depois da leitura, uma única vez e uma resposta válida', async () => {
  const g = humanGame({ commons: 3, judge: 1, timings: { judgeReadMs: 60 } });
  const { room, judge, all } = g;
  room.submitTheme(judge.id, 'Personagem mais forte');
  const players = all.filter((p) => p.id !== judge.id);
  for (const p of players) room.submitAnswer(p.id, `R-${p.nickname}`);
  const target = players[1];
  const label = room.jg.order.find((o) => o.playerId === target.id).label;
  assert.equal(codeOf(() => room.chooseWinner(judge.id, label)), 'TOO_EARLY', 'o servidor segura a escolha durante a leitura');
  assert.ok(room.viewFor(judge.id).jg.canPickAt > Date.now() - 5);
  await sleep(80);
  assert.equal(codeOf(() => room.chooseWinner(players[0].id, label)), 'NOT_JUDGE', 'jogador comum não escolhe');
  assert.equal(codeOf(() => room.chooseWinner(judge.id, 'Z')), 'INVALID');
  assert.equal(codeOf(() => room.chooseWinner(judge.id, 7)), 'INVALID');
  room.chooseWinner(judge.id, label);
  assert.equal(room.byId(target.id).score, 1);
  assert.equal(codeOf(() => room.chooseWinner(judge.id, label)), 'NOT_ALLOWED', 'escolha única');
  assert.equal(codeOf(() => room.submitAnswer(players[0].id, 'tarde demais')), 'NOT_ALLOWED');
  room.destroy();
});

// ---------------------------------------------------------------- revelação e pontuação
test('14 e 15) revelação: vencedor e autores só depois da escolha; 1 ponto, sem duplicar', async () => {
  const g = humanGame({ commons: 3, judge: 0, rounds: 3 });
  const { room, judge, all } = g;
  const players = all.filter((p) => p.id !== judge.id);
  const winner = players[2];
  const label = await humanRound(g, winner);
  for (const viewer of all) {
    const v = room.viewFor(viewer.id).jg;
    assert.equal(v.stage, 'reveal');
    assert.equal(v.verdict.winnerId, winner.id);
    assert.equal(v.verdict.label, label);
    assert.equal(v.answers.length, 3);
    for (const a of v.answers) assert.equal(a.text, `R-${nick(room, a.playerId)}`, 'cada resposta revela o autor correto');
    assert.equal(room.viewFor(viewer.id).players.find((p) => p.id === winner.id).score, 1);
  }
  // tentativas de pontuar de novo na mesma rodada não somam
  assert.equal(codeOf(() => room.chooseWinner(judge.id, label)), 'NOT_ALLOWED');
  room.jgResolve(label, null);
  assert.equal(room.byId(winner.id).score, 1, 'pontuação não duplica');
  assert.equal(room.byId(judge.id).score, 0);
  assert.equal(room.jg.played, 1);
  await sleep(80);
  assert.equal(room.jg.round, 2, 'próxima rodada abriu sozinha');
  assert.equal(room.jg.stage, 'theme');
  assert.equal(room.jg.theme, null);
  assert.deepEqual(room.jg.answers, {});
  room.destroy();
});

// ---------------------------------------------------------------- fim da partida e desempate
test('16) a partida termina depois do número de rodadas, com vencedor único', async () => {
  const g = humanGame({ commons: 3, judge: 0, rounds: 2 });
  const { room, all, judge } = g;
  const [a, b] = all.filter((p) => p.id !== judge.id);
  await humanRound(g, a);
  await sleep(80);
  assert.equal(room.phase, 'playing');
  await humanRound(g, a, 'Personagem mais rápido');
  await sleep(80);
  assert.equal(room.phase, 'finished');
  assert.equal(room.result.winnerId, a.id);
  assert.equal(room.result.judgment.reason, 'complete');
  assert.deepEqual(room.result.judgment.scores.find((s) => s.id === a.id), { id: a.id, score: 2 });
  assert.ok(!room.result.judgment.scores.some((s) => s.id === judge.id), 'o Julgador não pontua');
  assert.equal(room.result.judgment.history.length, 2);
  void b;
  room.destroy();
});

test('17) empate na 1ª colocação: rodada de desempate só com os empatados, repetida até haver um líder', async () => {
  const g = humanGame({ commons: 4, judge: 0, rounds: 2 });
  const { room, all, judge } = g;
  const [a, b, c, d] = all.filter((p) => p.id !== judge.id);
  await humanRound(g, a);
  await sleep(80);
  await humanRound(g, b, 'Personagem mais rápido');
  await sleep(80);
  assert.equal(room.phase, 'playing', 'empate: a partida NÃO termina');
  assert.equal(room.jg.tiebreak, true);
  assert.equal(room.jg.round, 3);
  assert.deepEqual([...room.jg.eligible].sort(), [a.id, b.id].sort(), 'só os empatados participam');
  // quem não está empatado não responde; o Julgador (mesmo) continua escrevendo o tema
  room.submitTheme(judge.id, 'Desempate: personagem mais engraçado');
  assert.equal(codeOf(() => room.submitAnswer(c.id, 'x')), 'NOT_ALLOWED');
  assert.equal(codeOf(() => room.submitAnswer(d.id, 'x')), 'NOT_ALLOWED');
  assert.equal(room.viewFor(c.id).jg.tiebreak, true);
  // ninguém responde: a rodada de desempate é anulada, e o empate continua → outra rodada de desempate
  await sleep(20);
  room.jgAnnul('no-answers');
  assert.equal(room.jg.stage, 'annulled');
  await sleep(70);
  assert.equal(room.jg.tiebreak, true, 'o empate continua: nova rodada de desempate');
  assert.deepEqual([...room.jg.eligible].sort(), [a.id, b.id].sort());
  assert.equal(room.jg.round, 3, 'a rodada anulada não consumiu número');
  room.submitTheme(judge.id, 'Desempate 2: personagem mais corajoso');
  for (const id of room.jg.eligible) room.submitAnswer(id, `R-${nick(room, id)}`);
  const label = room.jg.order.find((o) => o.playerId === b.id).label;
  room.chooseWinner(judge.id, label);
  await sleep(80);
  assert.equal(room.phase, 'finished');
  assert.equal(room.result.winnerId, b.id);
  assert.equal(room.byId(b.id).score, 2);
  assert.ok(room.result.judgment.history.at(-1).tiebreak);
  room.destroy();
});

test('empate triplo: desempate envolve os três empatados', async () => {
  const g = humanGame({ commons: 4, judge: 0, rounds: 3 });
  const { room, all, judge } = g;
  const [a, b, c, d] = all.filter((p) => p.id !== judge.id);
  for (const w of [a, b, c]) {
    await humanRound(g, w);
    await sleep(80);
  }
  assert.equal(room.jg.tiebreak, true);
  assert.deepEqual([...room.jg.eligible].sort(), [a.id, b.id, c.id].sort());
  assert.ok(!room.jg.eligible.includes(d.id));
  room.destroy();
});

// ---------------------------------------------------------------- desconexão, reconexão, anulação
test('18) quem cai não trava a rodada; ao voltar recebe o estado atual (e a própria resposta)', () => {
  const g = humanGame({ commons: 3, judge: 0 });
  const { room, judge, all } = g;
  room.submitTheme(judge.id, 'Personagem mais forte');
  const [a, b, c] = all.filter((p) => p.id !== judge.id);
  room.submitAnswer(a.id, 'RespA');
  room.disconnect(b.socketId);
  assert.equal(room.jg.stage, 'answer', 'ainda falta o Carla');
  room.submitAnswer(c.id, 'RespC');
  assert.equal(room.jg.stage, 'judging', 'o que caiu não trava: segue só com os conectados');
  assert.equal(room.jg.order.length, 2);
  // volta: o estado atual (com a lista anônima) é entregue pela visão; ele ficou sem resposta nesta rodada
  room.rejoin(b.token, 'novo-socket');
  const v = room.viewFor(b.id).jg;
  assert.equal(v.stage, 'judging');
  assert.equal(v.answers.length, 2);
  assert.equal(room.byId(b.id).connected, true);
  room.destroy();
});

test('18b) reconexão durante o envio devolve a resposta própria e nenhuma alheia', () => {
  const g = humanGame({ commons: 3, judge: 0 });
  const { room, judge, all } = g;
  room.submitTheme(judge.id, 'Personagem mais forte');
  const [a, b] = all.filter((p) => p.id !== judge.id);
  room.submitAnswer(a.id, 'RespA');
  room.submitAnswer(b.id, 'RespB');
  room.disconnect(a.socketId);
  room.rejoin(a.token, 'sock-a2');
  const v = room.viewFor(a.id);
  assert.equal(v.jg.myAnswer, 'RespA');
  assert.ok(!JSON.stringify(v).includes('RespB'));
  assert.equal(codeOf(() => room.submitAnswer(a.id, 'Outra')), 'DUPLICATE', 'recarregar a página não permite responder de novo');
  room.destroy();
});

test('18c) Julgador desconectado: a rodada é anulada por tempo e, repetindo, a partida encerra sem travar', async () => {
  const g = humanGame({ commons: 3, judge: 0, timings: { judgeThemeMs: 40, judgeAnnulMs: 60 } });
  const { room, judge } = g;
  room.disconnect(judge.socketId);
  await until(() => room.jg.stage === 'annulled', 800, 'rodada anulada');
  assert.equal(room.jg.annulReason, 'theme-timeout');
  assert.equal(room.viewFor(g.host.id).jg.annul.reason, 'theme-timeout');
  await until(() => room.jg.stage === 'theme', 800, 'mesma rodada recomeça');
  assert.equal(room.jg.round, 1, 'a rodada anulada não consumiu número');
  await until(() => room.phase === 'finished', 800, 'partida encerrada por inatividade');
  assert.equal(room.result.judgment.reason, 'inactive');
  room.destroy();
});

test('18d) ninguém responde a tempo → rodada anulada; o Julgador que não decide a tempo também anula', async () => {
  const a = humanGame({ commons: 3, judge: 0, timings: { judgeAnswerMs: 40, judgeAnnulMs: 300 } });
  a.room.submitTheme(a.judge.id, 'Tema');
  await until(() => a.room.jg.stage === 'annulled', 800, 'anulada por falta de respostas');
  assert.equal(a.room.jg.annulReason, 'no-answers');
  a.room.destroy();

  const b = humanGame({ commons: 3, judge: 0, timings: { judgeChooseMs: 40, judgeAnnulMs: 300 } });
  b.room.submitTheme(b.judge.id, 'Tema');
  for (const id of b.room.jg.eligible) b.room.submitAnswer(id, 'x' + id);
  await until(() => b.room.jg.stage === 'annulled', 800, 'anulada: o Julgador não decidiu');
  assert.equal(b.room.jg.annulReason, 'judge-timeout');
  assert.ok(b.all.every((p) => (p.score ?? 0) === 0), 'nada de ponto em rodada anulada');
  b.room.destroy();
});

test('18e) o Julgador sair encerra a partida; sobrar menos de 2 respondendo também', () => {
  const g = humanGame({ commons: 3, judge: 1 });
  g.room.leave(g.judge.id);
  assert.equal(g.room.phase, 'finished');
  assert.equal(g.room.result.judgment.reason, 'judge-left');
  g.room.destroy();

  const h = humanGame({ commons: 3, judge: 0 });
  const [a, b, c] = h.others.filter((p) => p.id !== h.judge.id); // o host não sai: encerraria a sala
  h.room.leave(a.id);
  assert.equal(h.room.phase, 'playing');
  assert.ok(!h.room.jg.eligible.includes(a.id) || h.room.byId(a.id).eliminated);
  h.room.leave(b.id);
  assert.equal(h.room.phase, 'finished');
  assert.equal(h.room.result.judgment.reason, 'few-players');
  void c;
  h.room.destroy();
});

test('quem sai no meio do envio não impede a rodada de fechar', () => {
  const g = humanGame({ commons: 3, judge: 0 });
  const { room, judge, all } = g;
  room.submitTheme(judge.id, 'Tema');
  const [a, b, c] = all.filter((p) => p.id !== judge.id);
  room.submitAnswer(a.id, 'RA');
  room.submitAnswer(b.id, 'RB');
  room.leave(c.id);
  assert.equal(room.jg.stage, 'judging');
  assert.equal(room.jg.order.length, 2);
  room.destroy();
});

// ---------------------------------------------------------------- IA (orquestração com dublê de teste)
function mockAI(over = {}) {
  const calls = { theme: [], judge: [] };
  const ai = {
    available: true,
    calls,
    async generateTheme(arg) {
      calls.theme.push(arg);
      return `Tema gerado ${calls.theme.length}`;
    },
    async judge(arg) {
      calls.judge.push(arg);
      return { winner: arg.answers[1].label, kind: 'subjective', justification: 'Porque sim.', uncertain: false };
    },
    ...over,
  };
  return ai;
}
const tick = async (ms = 15) => sleep(ms);

function aiGame({ commons = 2, rounds = 2, ai = mockAI(), timings = {} } = {}) {
  const l = lobby({ mode: 'judge_ai', commons, cfg: { rounds }, ai, timings });
  l.room.start(l.host.id);
  return { ...l, ai };
}

test('11) a IA gera o tema (sem lista fixa); temas já usados são enviados para ela evitar', async () => {
  const g = aiGame({ rounds: 3 });
  const { room, ai, all } = g;
  assert.equal(room.jg.stage, 'theme');
  assert.equal(room.viewFor(all[0].id).jg.generating, true, 'a interface sabe que a IA está criando o tema');
  assert.equal(room.jg.judgeId, null, 'na vertente de IA não há Julgador humano');
  assert.equal(room.viewFor(all[0].id).players.some((p) => p.judge), false);
  await tick();
  assert.equal(room.jg.stage, 'answer');
  assert.equal(room.viewFor(all[1].id).jg.theme, 'Tema gerado 1');
  assert.deepEqual(ai.calls.theme[0].used, []);
  assert.ok(['geral', 'específico'].includes(ai.calls.theme[0].style));
  // todos respondem (inclusive o host)
  assert.equal(room.jg.eligible.length, 3);
  for (const p of all) room.submitAnswer(p.id, `R-${p.nickname}`);
  await tick();
  assert.equal(room.jg.stage, 'reveal');
  await sleep(80);
  await tick();
  assert.deepEqual(ai.calls.theme[1].used, ['Tema gerado 1'], 'a IA recebe os temas anteriores da partida');
  room.destroy();
});

test('11b) tema repetido pela IA é recusado e ela tenta de novo; falhas seguidas encerram sem travar', async () => {
  let n = 0;
  const g = aiGame({
    ai: mockAI({
      async generateTheme({ used }) {
        n += 1;
        return n === 1 ? 'Primeiro tema' : n === 2 ? 'primeiro TEMA!' : `Tema novo ${n}`; // 2ª chamada repete o 1º ignorando caixa/pontuação
      },
    }),
    rounds: 2,
  });
  const { room, all } = g;
  await tick();
  assert.equal(room.jg.theme, 'Primeiro tema');
  for (const p of all) room.submitAnswer(p.id, 'x' + p.nickname);
  await tick();
  await sleep(80);
  await tick();
  assert.equal(room.jg.round, 2);
  assert.ok(!/primeiro/i.test(room.jg.theme), 'o tema repetido foi descartado: ' + room.jg.theme);
  room.destroy();

  const bad = aiGame({ ai: mockAI({ async generateTheme() { throw new Error('rede caiu'); } }) });
  await tick(40);
  assert.equal(bad.room.phase, 'finished');
  assert.equal(bad.room.result.judgment.reason, 'ai-error');
  assert.ok(!JSON.stringify(bad.room.viewFor(bad.host.id)).includes('rede caiu'), 'detalhes do erro não vazam para o cliente');
  bad.room.destroy();
});

test('12) a IA julga: recebe só tema e textos com letras; o resultado, a justificativa e os autores são revelados depois', async () => {
  const g = aiGame({ commons: 3 });
  const { room, ai, all } = g;
  await tick();
  for (const p of all) room.submitAnswer(p.id, `Resp-${p.nickname}`);
  assert.equal(room.jg.stage, 'judging');
  assert.equal(room.jg.aiState, 'computing');
  const mid = room.viewFor(all[0].id).jg;
  assert.equal(mid.aiState, 'computing');
  assert.equal(mid.verdict, null);
  assert.ok(mid.answers.every((a) => !('playerId' in a)), 'autores ocultos durante a análise');
  await tick();
  // o que a IA recebeu: tema + [{label,text}] — nenhuma identidade
  const sent = ai.calls.judge[0];
  assert.deepEqual(Object.keys(sent).sort(), ['answers', 'theme']);
  assert.ok(sent.answers.every((a) => Object.keys(a).sort().join() === 'label,text'));
  const wire = JSON.stringify(sent);
  for (const p of all) assert.ok(!wire.includes(p.id) && !wire.includes(`"${p.nickname}"`), 'a IA não recebe ids nem nicks');
  const v = room.viewFor(all[2].id).jg;
  assert.equal(v.stage, 'reveal');
  assert.equal(v.aiState, null, 'o "computando" termina quando o julgamento acaba');
  assert.equal(v.verdict.justification, 'Porque sim.');
  assert.equal(v.verdict.kind, 'subjective');
  const winner = v.answers.find((a) => a.label === v.verdict.label);
  assert.equal(room.byId(winner.playerId).score, 1);
  room.destroy();
});

test('13) julgamento objetivo: a classificação e a incerteza da IA chegam à tela; resposta inexistente é recusada', async () => {
  const g = aiGame({
    ai: mockAI({
      async judge(arg) {
        return { winner: arg.answers[0].label, kind: 'objective', justification: 'Medidas oficiais: 1,83 m.', uncertain: true };
      },
    }),
  });
  const { room, all } = g;
  await tick();
  for (const p of all) room.submitAnswer(p.id, p.nickname);
  await tick();
  const v = room.viewFor(all[0].id).jg.verdict;
  assert.deepEqual([v.kind, v.uncertain, v.justification], ['objective', true, 'Medidas oficiais: 1,83 m.']);
  room.destroy();

  const bad = aiGame({ ai: mockAI({ async judge() { return { winner: 'Z', kind: 'subjective', justification: '', uncertain: false }; } }) });
  await tick();
  for (const p of bad.all) bad.room.submitAnswer(p.id, p.nickname);
  await tick(40);
  assert.equal(bad.room.phase, 'finished');
  assert.equal(bad.room.result.judgment.reason, 'ai-error', 'a IA nunca escolhe uma resposta que não existe');
  assert.ok(bad.all.every((p) => !p.score));
  bad.room.destroy();
});

test('IA lenta/atrasada: resposta que chega depois do fim da etapa é descartada e não pontua de novo', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const g = aiGame({ ai: mockAI({ async judge(arg) { await gate; return { winner: arg.answers[0].label, kind: 'subjective', justification: '', uncertain: false }; } }), timings: { judgeAiMs: 40 } });
  const { room, all } = g;
  await tick();
  for (const p of all) room.submitAnswer(p.id, p.nickname);
  await sleep(80); // estoura o tempo da análise
  assert.equal(room.phase, 'finished');
  release();
  await tick(30);
  assert.ok(all.every((p) => !room.byId(p.id).score), 'resposta atrasada ignorada');
  room.destroy();
});

test('IA: desempate cria um NOVO tema (gerado pela IA) e só os empatados respondem', async () => {
  const targets = ['Ana', 'Beto', 'Beto']; // quem a IA "escolhe" em cada rodada (as respostas são os próprios nicks)
  let r = 0;
  const g = aiGame({
    commons: 2,
    rounds: 2,
    ai: mockAI({
      async judge(arg) {
        const want = targets[r++];
        return { winner: arg.answers.find((a) => a.text === want).label, kind: 'subjective', justification: 'ok', uncertain: false };
      },
    }),
  });
  const { room, all, ai } = g;
  const [host, ana, beto] = all;
  for (let round = 1; round <= 2; round++) {
    await until(() => room.jg.stage === 'answer' && room.jg.round === round, 800, `rodada ${round} aberta`);
    for (const p of all) room.submitAnswer(p.id, p.nickname);
    await until(() => room.jg.stage === 'reveal', 800, `rodada ${round} julgada`);
  }
  // Ana 1 × Beto 1 × Hostão 0 → empate na 1ª colocação
  await until(() => room.jg.tiebreak === true && room.jg.stage === 'answer', 1000, 'desempate aberto com tema novo');
  assert.equal(room.jg.round, 3);
  assert.deepEqual([...room.jg.eligible].sort(), [ana.id, beto.id].sort(), 'só os empatados respondem');
  assert.equal(codeOf(() => room.submitAnswer(host.id, 'fora')), 'NOT_ALLOWED');
  assert.equal(ai.calls.theme.length, 3, 'a IA gerou um tema novo para o desempate');
  assert.deepEqual(ai.calls.theme[2].used, ['Tema gerado 1', 'Tema gerado 2']);
  for (const id of room.jg.eligible) room.submitAnswer(id, nick(room, id));
  await until(() => room.phase === 'finished', 1000, 'fim após o desempate');
  assert.equal(room.result.winnerId, beto.id);
  assert.equal(room.byId(beto.id).score, 2);
  room.destroy();
});

test('IA: o host também responde e pode ganhar ponto', async () => {
  const g = aiGame({ commons: 1, rounds: 1, ai: mockAI({ async judge(arg) { return { winner: arg.answers[0].label, kind: 'subjective', justification: '', uncertain: false }; } }) });
  const { room, all } = g;
  await tick();
  assert.ok(room.jg.eligible.includes(g.host.id));
  for (const p of all) room.submitAnswer(p.id, p.nickname);
  await tick();
  assert.equal(all.reduce((s, p) => s + (room.byId(p.id).score ?? 0), 0), 1);
  room.destroy();
});

// ---------------------------------------------------------------- cliente HTTP da IA (servidor HTTP local imitando a API)
function fakeApi(handler) {
  const reqs = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = body ? JSON.parse(body) : {};
      reqs.push({ url: req.url, headers: req.headers, json });
      const out = handler(json, reqs.length);
      res.writeHead(out.status ?? 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out.body));
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, reqs, url: `http://127.0.0.1:${srv.address().port}` })));
}
const textMsg = (text) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });

test('judgeAI: sem ANTHROPIC_API_KEY fica indisponível e recusa chamadas (sem inventar chave)', async () => {
  const ai = createJudgeAI({ env: {} });
  assert.equal(ai.available, false);
  await assert.rejects(() => ai.generateTheme({}), /ANTHROPIC_API_KEY/);
  await assert.rejects(() => ai.judge({ theme: 't', answers: [{ label: 'A', text: 'x' }] }), /ANTHROPIC_API_KEY/);
  assert.equal(createJudgeAI({ env: { ANTHROPIC_API_KEY: '  ' } }).available, false);
  assert.equal(createJudgeAI({ env: { ANTHROPIC_API_KEY: 'k' } }).available, true);
});

test('judgeAI: gera tema (pedido correto, chave só no cabeçalho do servidor, JSON extraído)', async () => {
  const api = await fakeApi(() => ({ body: textMsg('Claro!\n{"theme":"Personagem mais alto do Bob Esponja."}') }));
  const ai = createJudgeAI({ env: { ANTHROPIC_API_KEY: 'chave-teste', ANTHROPIC_BASE_URL: api.url, JUDGE_AI_MODEL: 'modelo-x' } });
  const theme = await ai.generateTheme({ used: ['Tema velho'], style: 'específico' });
  assert.equal(theme, 'Personagem mais alto do Bob Esponja');
  const r = api.reqs[0];
  assert.equal(r.url, '/v1/messages');
  assert.equal(r.headers['x-api-key'], 'chave-teste');
  assert.equal(r.headers['anthropic-version'], '2023-06-01');
  assert.equal(r.json.model, 'modelo-x');
  assert.match(r.json.messages[0].content, /Tema velho/, 'temas usados vão no pedido');
  assert.match(r.json.messages[0].content, /específico/);
  assert.match(r.json.system, /NOME DE UM PERSONAGEM/, 'o tema da IA deve sempre pedir um personagem');
  assert.match(r.json.system, /real ou fictício/);
  assert.ok(!r.json.tools, 'gerar tema não usa busca');
  assert.ok(!JSON.stringify(r.json).includes('chave-teste'), 'a chave não vai no corpo');
  api.srv.close();
});

test('judgeAI: julga com busca na web habilitada e critérios subjetivo/objetivo no prompt; valida a letra', async () => {
  const api = await fakeApi(() => ({ body: textMsg('{"winner":"b","kind":"objective","justification":"Dados oficiais.","uncertain":false}') }));
  const ai = createJudgeAI({ env: { ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: api.url } });
  const out = await ai.judge({ theme: 'Personagem mais alto', answers: [{ label: 'A', text: 'Bob Esponja' }, { label: 'B', text: 'Lula Molusco' }] });
  assert.deepEqual(out, { winner: 'B', kind: 'objective', justification: 'Dados oficiais.', uncertain: false });
  const j = api.reqs[0].json;
  assert.match(j.system, /SUBJETIVO/);
  assert.match(j.system, /OBJETIVO/);
  assert.match(j.system, /ferramenta de busca/);
  assert.match(j.system, /uncertain/);
  assert.deepEqual(j.tools.map((t) => [t.name, t.type]), [['web_search', 'web_search_20250305']]);
  assert.match(j.messages[0].content, /A\) Bob Esponja\nB\) Lula Molusco/);
  assert.ok(!/nickname|playerId/.test(JSON.stringify(j)));
  api.srv.close();

  const bad = await fakeApi(() => ({ body: textMsg('{"winner":"Z","kind":"subjective","justification":"x","uncertain":false}') }));
  const ai2 = createJudgeAI({ env: { ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: bad.url } });
  await assert.rejects(() => ai2.judge({ theme: 't', answers: [{ label: 'A', text: 'x' }] }), /não existe/);
  bad.srv.close();

  const off = await fakeApi(() => ({ body: textMsg('{"winner":"A","kind":"subjective","justification":"ok","uncertain":false}') }));
  const ai3 = createJudgeAI({ env: { ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: off.url, JUDGE_AI_SEARCH: 'off' } });
  await ai3.judge({ theme: 't', answers: [{ label: 'A', text: 'x' }] });
  assert.ok(!off.reqs[0].json.tools, 'busca desligada por configuração');
  off.srv.close();
});

test('judgeAI: continua quando a ferramenta de busca pausa o turno e trata erros HTTP/JSON inválido', async () => {
  let n = 0;
  const api = await fakeApi(() => {
    n += 1;
    if (n === 1) return { body: { content: [{ type: 'server_tool_use', id: 't1', name: 'web_search', input: { query: 'altura' } }], stop_reason: 'pause_turn' } };
    return { body: textMsg('{"winner":"A","kind":"objective","justification":"Segundo turno.","uncertain":false}') };
  });
  const ai = createJudgeAI({ env: { ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: api.url } });
  const out = await ai.judge({ theme: 't', answers: [{ label: 'A', text: 'x' }, { label: 'B', text: 'y' }] });
  assert.equal(out.winner, 'A');
  assert.equal(api.reqs.length, 2, 'retomou o turno pausado');
  assert.equal(api.reqs[1].json.messages.at(-1).role, 'assistant');
  api.srv.close();

  const err = await fakeApi(() => ({ status: 401, body: { error: { message: 'invalid x-api-key' } } }));
  const ai2 = createJudgeAI({ env: { ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: err.url } });
  await assert.rejects(() => ai2.generateTheme({}), /HTTP 401/);
  err.srv.close();

  const junk = await fakeApi(() => ({ body: textMsg('sem json aqui') }));
  const ai3 = createJudgeAI({ env: { ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: junk.url } });
  await assert.rejects(() => ai3.generateTheme({}), /JSON/);
  junk.srv.close();

  const slow = await fakeApi(() => ({ body: textMsg('{}') }));
  slow.srv.close();
  const ai4 = createJudgeAI({ env: { ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: slow.url, JUDGE_AI_TIMEOUT_MS: '50' } });
  await assert.rejects(() => ai4.generateTheme({}), /IA/);
});

// ---------------------------------------------------------------- rede (handlers reais) e sincronização
class FakeSocket {
  constructor(io, id) {
    Object.assign(this, { io, id, data: {}, handlers: new Map(), inbox: [] });
  }
  on(event, fn) {
    this.handlers.set(event, fn);
  }
  call(event, payload) {
    return new Promise((resolve) => this.handlers.get(event)(payload, resolve));
  }
  last(event) {
    return [...this.inbox].reverse().find((m) => m.ev === event)?.payload;
  }
}
class FakeIO {
  constructor() {
    this.sockets = { sockets: new Map() };
  }
  on(event, fn) {
    if (event === 'connection') this.onConnection = fn;
  }
  connect(id) {
    const s = new FakeSocket(this, id);
    this.sockets.sockets.set(id, s);
    this.onConnection(s);
    return s;
  }
  to(id) {
    return { emit: (ev, payload) => this.sockets.sockets.get(id)?.inbox.push({ ev, payload }) };
  }
}

test('19) rede: eventos judg:* pelos handlers reais; todos os clientes veem o mesmo estado público', async () => {
  const io = new FakeIO();
  const gs = createGameServer(io, { timings: FAST, log: () => {} });
  const host = io.connect('H');
  const created = await host.call('room:create', { nickname: 'Hostão', mode: 'judge_human' });
  assert.ok(created.ok, created.error);
  const socks = { Hostão: host };
  for (const name of ['Ana', 'Beto']) {
    const s = io.connect('S-' + name);
    assert.ok((await s.call('room:join', { code: created.code, nickname: name })).ok);
    socks[name] = s;
  }
  assert.ok((await host.call('room:settings', { judgment: { pick: 'host', rounds: 1 } })).ok);
  const hostView = host.last('state');
  const ana = hostView.players.find((p) => p.nickname === 'Ana');
  assert.ok((await host.call('room:settings', { judgment: { judgeId: ana.id } })).ok);
  assert.ok((await socks.Beto.call('game:start', {})).error, 'jogador comum não inicia');
  assert.ok((await host.call('game:start', {})).ok);

  // só o Julgador (Ana) escreve o tema
  assert.equal((await host.call('judg:theme', { text: 'Tema do host' })).code, 'NOT_JUDGE');
  assert.ok((await socks.Ana.call('judg:theme', { text: 'Personagem mais forte' })).ok);
  // o Julgador não responde; os outros respondem 1 vez
  assert.equal((await socks.Ana.call('judg:answer', { text: 'x' })).code, 'NOT_ALLOWED');
  assert.ok((await host.call('judg:answer', { text: 'Goku' })).ok);
  assert.equal((await host.call('judg:answer', { text: 'Outro' })).code, 'DUPLICATE');
  assert.ok((await socks.Beto.call('judg:answer', { text: 'Bob Esponja' })).ok);

  const states = Object.values(socks).map((s) => s.last('state'));
  const pub = (st) => ({ ...st.jg, myAnswer: undefined });
  for (const st of states) assert.deepEqual(pub(st), pub(states[0]), 'estado público idêntico em todos os clientes');
  for (const st of states) {
    assert.equal(st.jg.stage, 'judging');
    assert.equal(st.jg.theme, 'Personagem mais forte');
    assert.ok(st.jg.answers.every((a) => !a.playerId));
  }
  assert.equal((await socks.Beto.call('judg:choose', { label: 'A' })).code, 'NOT_JUDGE');
  const label = states[0].jg.answers.find((a) => a.text === 'Goku').label;
  assert.ok((await socks.Ana.call('judg:choose', { label })).ok);
  const after = Object.values(socks).map((s) => s.last('state'));
  for (const st of after) {
    assert.equal(st.jg.stage, 'reveal');
    assert.equal(st.jg.verdict.winnerId, st.players.find((p) => p.nickname === 'Hostão').id);
    assert.equal(st.players.find((p) => p.nickname === 'Hostão').score, 1);
  }
  const events = socks.Beto.inbox.filter((m) => m.ev === 'game:event').map((m) => m.payload.type);
  for (const t of ['game-start', 'judg-round', 'judg-theme', 'judg-answered', 'judg-answers', 'judg-result']) assert.ok(events.includes(t), `evento ${t}`);
  await sleep(120);
  assert.equal(socks.Beto.last('state').phase, 'finished', '1 rodada, vencedor único: fim');
  assert.equal(socks.Beto.last('state').result.winnerId, after[0].players.find((p) => p.nickname === 'Hostão').id);
  gs.sweep();
});

test('19b) rede: a IA indisponível aparece em features e impede o início (sem chave no cliente)', async () => {
  const io = new FakeIO();
  createGameServer(io, { timings: FAST, log: () => {} });
  const host = io.connect('H');
  const created = await host.call('room:create', { nickname: 'Hostão', mode: 'judge_ai' });
  const guest = io.connect('G');
  await guest.call('room:join', { code: created.code, nickname: 'Ana' });
  const v = host.last('state');
  assert.equal(v.features.judgeAI, false);
  assert.equal(v.settings.mode, 'judge_ai');
  assert.ok(v.lobby.ready.missing.some((m) => /ANTHROPIC_API_KEY/.test(m)));
  const r = await host.call('game:start', {});
  assert.equal(r.code, 'NOT_READY');
  assert.ok(!JSON.stringify(v).includes('sk-'), 'nenhuma chave no estado');
});

test('modo inválido na criação da sala continua recusado; os modos novos são aceitos', async () => {
  const io = new FakeIO();
  createGameServer(io, { timings: FAST, log: () => {} });
  assert.equal((await io.connect('A').call('room:create', { nickname: 'Aaa', mode: 'judge_xyz' })).code, 'INVALID');
  assert.ok((await io.connect('B').call('room:create', { nickname: 'Bbb', mode: 'judge_human' })).ok);
  assert.ok((await io.connect('C').call('room:create', { nickname: 'Ccc', mode: 'judge_ai' })).ok);
});

test('outros modos não foram afetados: HOST ESCOLHE ainda inicia e o estado não traz julgamento', () => {
  const room = new Room('OUTR', { timings: { turnMs: 5000 } });
  const host = room.createHost('s-h', 'Hostão');
  const p = room.addPlayer('s-1', 'Ana');
  room.setCharacters(host.id, ['Homem-Aranha', 'Albert Einstein', 'Darth Vader']);
  room.suggest(p.id, 'Harry Potter');
  room.start(host.id);
  const v = room.viewFor(host.id);
  assert.equal(v.jg, null);
  assert.ok(v.players.every((x) => x.judge === false && x.score === null));
  assert.equal(room.phase, 'playing');
  room.destroy();
});
