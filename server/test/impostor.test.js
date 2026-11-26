// Modos de impostor: distribuição de papéis, privacidade, turnos, votação, empates e vitórias.
// Parte direto na Room (regras) e parte pelos handlers reais do gameServer com sockets simulados.

import assert from 'node:assert/strict';
import test from 'node:test';
import { IMPOSTOR_WORD, maxImpostors, tally, validateConfig, winner } from '../game/impostor.js';
import { GameError, Room } from '../game/Room.js';
import { createGameServer } from '../net/gameServer.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `esperava ${code}`);
const T = { turnMs: 5000, revealMs: 5000, voteMs: 5000, voteResultMs: 15, resultMs: 10 };

/** Sala no lobby de um modo de impostor: host + `commons` jogadores. */
function imp({ mode = 'imp_single', commons = 3, cfg = {}, timings = {} } = {}) {
  const events = [];
  const room = new Room('TEST', { timings: { ...T, ...timings }, onEvent: (e) => events.push(e) });
  const host = room.createHost('s-host', 'Hosty');
  const others = Array.from({ length: commons }, (_, i) => room.addPlayer(`s${i}`, `Jogador${i}`));
  room.setSettings(host.id, { mode, impostor: cfg });
  return { room, host, others, all: [host, ...others], events };
}
const startPlaying = (ctx) => {
  ctx.room.start(ctx.host.id);
  return ctx;
};
/** Passa da leitura das folhas para os turnos. */
const toTurns = (room) => {
  for (const p of room.impParticipants()) room.impReady(p.id);
};
const begin = (ctx) => {
  startPlaying(ctx);
  toTurns(ctx.room);
  return ctx;
};
/** Todos os ativos passam a vez até abrir a votação. */
const passRound = (room) => {
  let guard = 0;
  while (room.imp.stage === 'turns' && room.turn) {
    room.pass(room.turn.playerId, room.turn.id);
    assert.ok(++guard < 50);
  }
  assert.equal(room.imp.stage, 'vote');
};
const impostorsOf = (room) => room.players.filter((p) => p.role === 'impostor');
const innocentsOf = (room) => room.players.filter((p) => p.role === 'innocent');
/** Todos votam em `target` (o alvo vota em outro). */
const voteOn = (room, target) => {
  const vote = room.imp.vote;
  for (const id of vote.eligible) {
    const to = id === target ? vote.eligible.find((x) => x !== id) : target;
    room.castVote(id, to, vote.id);
  }
};
const afterResult = () => sleep(45);

// ------------------------------------------------------------ regras puras
test('impostor.js: tally só elimina com maioria estrita; empate e zero voto não eliminam', () => {
  assert.equal(tally({ a: 'c', b: 'c', c: 'a' }, ['a', 'b', 'c']).eliminated, 'c');
  assert.equal(tally({ a: 'b', b: 'a' }, ['a', 'b', 'c']).eliminated, null);
  assert.equal(tally({ a: 'b', b: 'a' }, ['a', 'b', 'c']).tie, true);
  assert.equal(tally({}, ['a', 'b']).eliminated, null);
  assert.equal(tally({ a: 'b', b: 'a', c: 'a', d: 'b' }, ['a', 'b', 'c', 'd']).eliminated, null); // 2x2
});

test('impostor.js: condições de vitória dos três modos', () => {
  assert.equal(winner('imp_elim', { impostors: 0, innocents: 3 }), 'innocents');
  assert.equal(winner('imp_elim', { impostors: 1, innocents: 1 }), 'impostors'); // restam 2: impostor + 1 inocente
  assert.equal(winner('imp_elim', { impostors: 1, innocents: 2 }), null);
  assert.equal(winner('imp_single', { impostors: 1, innocents: 4 }, 'innocent'), 'impostors');
  assert.equal(winner('imp_single', { impostors: 0, innocents: 4 }, 'impostor'), 'innocents');
  assert.equal(winner('imp_multi', { impostors: 2, innocents: 3 }), null);
  assert.equal(winner('imp_multi', { impostors: 2, innocents: 2 }), 'impostors');
  assert.equal(winner('imp_multi', { impostors: 0, innocents: 2 }), 'innocents');
});

test('impostor.js: validação — inocentes precisam ser maioria e o mínimo é 3 participantes', () => {
  const base = { innocents: 'ai', sheet: 'word', pick: 'random', count: 1, alliesKnow: false };
  assert.equal(maxImpostors(3), 1);
  assert.equal(maxImpostors(5), 2);
  assert.equal(maxImpostors(6), 2);
  assert.equal(maxImpostors(7), 3);
  assert.equal(validateConfig('imp_multi', base, { n: 3, ids: [] }).length, 0);
  assert.ok(validateConfig('imp_multi', { ...base, count: 2 }, { n: 3, ids: [] }).length > 0);
  assert.ok(validateConfig('imp_single', base, { n: 2, ids: [] }).length > 0);
  assert.ok(validateConfig('imp_single', { ...base, pick: 'host' }, { n: 4, ids: ['a'], impostorId: 'z' }).length > 0);
});

// ------------------------------------------------------------ distribuição
test('papéis (IA escolhe, host joga): inocentes com o MESMO personagem, 1 impostor com a palavra IMPOSTOR', () => {
  for (const mode of ['imp_elim', 'imp_single']) {
    const c = begin(imp({ mode, commons: 4 }));
    const imps = impostorsOf(c.room);
    const inns = innocentsOf(c.room);
    assert.equal(imps.length, 1);
    assert.equal(inns.length, 4);
    assert.equal(new Set(inns.map((p) => p.character)).size, 1);
    assert.equal(imps[0].character, IMPOSTOR_WORD);
    assert.ok(c.room.players.every((p) => p.role)); // o host participa e recebe papel
  }
});

test('papéis: o host que participa pode cair como impostor (e também como inocente)', () => {
  const seen = new Set();
  for (let i = 0; i < 300 && seen.size < 2; i++) {
    const c = startPlaying(imp({ mode: 'imp_single', commons: 3 }));
    seen.add(c.host.role);
  }
  assert.deepEqual([...seen].sort(), ['impostor', 'innocent']);
});

test('papéis: impostor com OUTRO personagem — diferente do dos inocentes e sem a palavra', () => {
  for (let i = 0; i < 25; i++) {
    const c = startPlaying(imp({ mode: 'imp_elim', commons: 3, cfg: { sheet: 'character' } }));
    const [im] = impostorsOf(c.room);
    const inn = innocentsOf(c.room)[0];
    assert.notEqual(im.character, inn.character);
    assert.notEqual(im.character, IMPOSTOR_WORD);
    assert.equal(c.room.sheetFor(im).kind, 'character');
  }
});

test('host espectador: não recebe papel, escolhe os personagens e não entra na contagem', () => {
  const c = startPlaying(imp({ mode: 'imp_single', commons: 3, cfg: { innocents: 'host', sheet: 'character', innocentChar: 'Gandalf', impostorChar: 'Frodo' } }));
  assert.equal(c.host.role, null);
  assert.equal(c.host.character, null);
  assert.equal(c.room.sheetFor(c.host), null);
  assert.deepEqual(c.room.impParticipants().map((p) => p.id).sort(), c.others.map((p) => p.id).sort());
  assert.ok(innocentsOf(c.room).every((p) => p.character === 'Gandalf'));
  assert.equal(impostorsOf(c.room)[0].character, 'Frodo');
  assert.equal(c.room.viewFor(c.host.id).you.sheet, null);
  assert.equal(c.room.viewFor(c.host.id).you.spectator, true);
});

test('impostor escolhido pelo host: respeita a escolha; espectador não pode ser o escolhido', () => {
  const c = imp({ mode: 'imp_elim', commons: 3, cfg: { pick: 'host' } });
  c.room.setSettings(c.host.id, { impostor: { impostorId: c.others[1].id } });
  for (let i = 0; i < 10; i++) {
    const cc = imp({ mode: 'imp_elim', commons: 3, cfg: { pick: 'host' } });
    cc.room.setSettings(cc.host.id, { impostor: { impostorId: cc.others[2].id } });
    cc.room.start(cc.host.id);
    assert.equal(impostorsOf(cc.room)[0].id, cc.others[2].id);
  }
  // espectador: o id do host é descartado
  const s = imp({ mode: 'imp_elim', commons: 3, cfg: { innocents: 'host', innocentChar: 'Goku', pick: 'host' } });
  s.room.setSettings(s.host.id, { impostor: { impostorId: s.host.id } });
  assert.equal(s.room.impSecret.impostorId, null);
  assert.equal(s.room.readiness().ok, false);
  // sem escolha, bloqueia
  assert.match(c.room.readiness().missing.join(' ') || 'ok', /ok|Escolha qual jogador/);
  const none = imp({ mode: 'imp_single', commons: 3, cfg: { pick: 'host' } });
  assert.match(none.room.readiness().missing.join(' '), /Escolha qual jogador/);
});

test('múltiplos: respeita a quantidade; todos os impostores recebem a mesma folha', () => {
  for (const sheet of ['word', 'character']) {
    for (const [commons, count] of [[4, 2], [5, 2], [6, 3], [2, 1]]) {
      const c = startPlaying(imp({ mode: 'imp_multi', commons, cfg: { count, sheet } }));
      assert.equal(impostorsOf(c.room).length, count);
      assert.equal(new Set(impostorsOf(c.room).map((p) => p.character)).size, 1);
      assert.equal(new Set(innocentsOf(c.room).map((p) => p.character)).size, 1);
      assert.ok(innocentsOf(c.room).length > count);
    }
  }
});

// ------------------------------------------------------------ validação
test('validação: bloqueia o início com mensagem clara (poucos jogadores, impostores demais, personagens faltando)', () => {
  const few = imp({ mode: 'imp_single', commons: 1 });
  throwsCode(() => few.room.start(few.host.id), 'NOT_READY');
  assert.match(few.room.readiness().missing.join(' '), /pelo menos 3/);

  const many = imp({ mode: 'imp_multi', commons: 3, cfg: { count: 2, sheet: 'character' } }); // 4 jogadores, 2 impostores
  throwsCode(() => many.room.start(many.host.id), 'NOT_READY');
  assert.match(many.room.readiness().missing.join(' '), /inocentes precisam ser maioria/);

  const spec = imp({ mode: 'imp_elim', commons: 2, cfg: { innocents: 'host' } }); // host espectador: só 2 participantes
  assert.match(spec.room.readiness().missing.join(' '), /pelo menos 3/);
  assert.match(spec.room.readiness().missing.join(' '), /Digite o personagem dos inocentes|personagem que os inocentes/);

  const same = imp({ mode: 'imp_elim', commons: 3, cfg: { innocents: 'host', sheet: 'character', innocentChar: 'Goku', impostorChar: 'goku' } });
  assert.match(same.room.readiness().missing.join(' '), /diferente/);
  same.room.setSettings(same.host.id, { impostor: { impostorChar: 'Naruto' } });
  assert.equal(same.room.readiness().ok, true);
});

test('validação: configurações inválidas são recusadas; palavra IMPOSTOR desliga o conhecimento de aliados', () => {
  const c = imp({ mode: 'imp_multi', commons: 5 });
  throwsCode(() => c.room.setSettings(c.host.id, { impostor: { sheet: 'x' } }), 'INVALID');
  throwsCode(() => c.room.setSettings(c.host.id, { impostor: { count: 0 } }), 'INVALID');
  throwsCode(() => c.room.setSettings(c.others[0].id, { impostor: { count: 2 } }), 'NOT_HOST');
  c.room.setSettings(c.host.id, { impostor: { sheet: 'character', alliesKnow: true } });
  assert.equal(c.room.settings.impostor.alliesKnow, true);
  c.room.setSettings(c.host.id, { impostor: { sheet: 'word' } });
  assert.equal(c.room.settings.impostor.alliesKnow, false);
  c.room.setSettings(c.host.id, { impostor: { alliesKnow: true } }); // tentativa com a palavra: ignorada
  assert.equal(c.room.settings.impostor.alliesKnow, false);
});

test('modos de impostor: sem bots, sem sugestões e sem lista do host', () => {
  const c = imp({ commons: 3 });
  throwsCode(() => c.room.addBot(c.host.id), 'NOT_ALLOWED');
  throwsCode(() => c.room.suggest(c.others[0].id, 'Batman'), 'NOT_ALLOWED');
  throwsCode(() => c.room.setCharacters(c.host.id, ['Batman']), 'NOT_ALLOWED');
  const b = new Room('T2');
  const h = b.createHost('h', 'Host');
  b.addBot(h.id);
  throwsCode(() => b.setMode('imp_elim'), 'NOT_ALLOWED');
});

// ------------------------------------------------------------ privacidade
test('privacidade: cada um vê só a própria folha; nada de papéis no estado público nem nos eventos', () => {
  const c = startPlaying(imp({ mode: 'imp_single', commons: 4, cfg: { sheet: 'character' } }));
  const room = c.room;
  const [im] = impostorsOf(room);
  const inn = innocentsOf(room)[0];
  for (const p of room.players) {
    const v = room.viewFor(p.id);
    assert.equal(v.you.sheet.text, p.character);
    assert.ok(v.players.every((x) => x.character === null && x.role === null), 'ninguém vê personagem/papel de ninguém');
    const json = JSON.stringify(v);
    if (p.role === 'innocent') assert.ok(!json.includes(JSON.stringify(im.character)), 'inocente não vê a folha do impostor');
    if (p.role === 'impostor') assert.ok(!json.includes(JSON.stringify(inn.character)), 'impostor não vê a folha dos inocentes');
    assert.ok(!json.includes('"role":"impostor"'));
    assert.ok(!json.includes('impostorIds'));
  }
  const evJson = JSON.stringify(c.events);
  assert.ok(!evJson.includes(im.character) && !evJson.includes(inn.character) && !evJson.includes(im.id.concat('"role"')));
});

test('privacidade: o host espectador não recebe segredos que ele mesmo não configurou', () => {
  const c = startPlaying(imp({ mode: 'imp_single', commons: 4, cfg: { innocents: 'host', sheet: 'word', innocentChar: 'Goku' } }));
  const [im] = impostorsOf(c.room);
  const v = c.room.viewFor(c.host.id);
  assert.equal(v.you.sheet, null);
  assert.ok(!JSON.stringify(v).includes('"impostorId"') && !JSON.stringify(v).includes('"impostorIds"'));
  assert.ok(v.players.every((p) => p.role === null && p.character === null));
  assert.equal(v.lobby, null); // só existe no lobby
});

test('privacidade: aliados só aparecem quando a configuração permite (folha com personagem)', () => {
  const yes = startPlaying(imp({ mode: 'imp_multi', commons: 5, cfg: { count: 2, sheet: 'character', alliesKnow: true } }));
  const [a, b] = impostorsOf(yes.room);
  assert.deepEqual(yes.room.viewFor(a.id).you.sheet.allies.map((x) => x.id), [b.id]);
  assert.deepEqual(yes.room.viewFor(b.id).you.sheet.allies.map((x) => x.id), [a.id]);
  assert.equal(yes.room.viewFor(innocentsOf(yes.room)[0].id).you.sheet.allies, null);

  const no = startPlaying(imp({ mode: 'imp_multi', commons: 5, cfg: { count: 2, sheet: 'character', alliesKnow: false } }));
  for (const p of impostorsOf(no.room)) assert.equal(no.room.viewFor(p.id).you.sheet.allies, null);
});

test('privacidade: com a palavra IMPOSTOR no modo múltiplo, ninguém descobre aliados (mesmo se pedirem)', () => {
  const c = startPlaying(imp({ mode: 'imp_multi', commons: 5, cfg: { count: 2, sheet: 'word', alliesKnow: true } }));
  for (const p of impostorsOf(c.room)) {
    const sheet = c.room.viewFor(p.id).you.sheet;
    assert.equal(sheet.kind, 'word');
    assert.equal(sheet.allies, null);
  }
});

test('privacidade: personagens e papéis só são revelados a todos no fim da partida', async () => {
  const c = begin(imp({ mode: 'imp_single', commons: 3, cfg: { sheet: 'character' } }));
  passRound(c.room);
  voteOn(c.room, impostorsOf(c.room)[0].id);
  await afterResult();
  assert.equal(c.room.phase, 'finished');
  const v = c.room.viewFor(c.others[0].id);
  assert.ok(v.players.every((p) => p.role && p.character));
  assert.equal(v.result.impostor.winner, 'innocents');
});

// ------------------------------------------------------------ turnos
test('turnos: a folha é lida antes; ninguém joga durante a leitura e "Entendi" de todos começa os turnos', () => {
  const c = startPlaying(imp());
  assert.equal(c.room.imp.stage, 'reveal');
  assert.equal(c.room.turn, null);
  throwsCode(() => c.room.pass(c.host.id), 'NO_GAME');
  throwsCode(() => c.room.castVote(c.host.id, c.others[0].id), 'NO_VOTE');
  for (const p of c.all.slice(0, -1)) c.room.impReady(p.id);
  assert.equal(c.room.imp.stage, 'reveal');
  c.room.impReady(c.all.at(-1).id);
  assert.equal(c.room.imp.stage, 'turns');
  assert.ok(c.room.turn);
});

test('turnos: a ordem inicial é aleatória, depois segue os assentos e todos jogam uma vez por rodada', () => {
  const starters = new Set();
  for (let i = 0; i < 60; i++) {
    const c = begin(imp({ commons: 3 }));
    starters.add(c.room.turn.playerId);
    const order = [];
    while (c.room.imp.stage === 'turns') {
      order.push(c.room.turn.playerId);
      c.room.pass(c.room.turn.playerId, c.room.turn.id);
    }
    assert.equal(new Set(order).size, 4);
    const seats = order.map((id) => c.room.byId(id).seat);
    seats.forEach((s, k) => k && assert.equal(s, (seats[k - 1] + 1) % 4)); // sentido dos assentos
  }
  assert.ok(starters.size >= 3, `a ordem inicial deveria variar (viu ${starters.size})`);
});

test('turnos: só "passar a vez" — chute é recusado e ação fora da vez também', () => {
  const c = begin(imp());
  const cur = c.room.turn.playerId;
  const other = c.all.find((p) => p.id !== cur);
  throwsCode(() => c.room.guess(cur, 'Batman', c.room.turn.id), 'NOT_ALLOWED');
  throwsCode(() => c.room.pass(other.id, c.room.turn.id), 'NOT_YOUR_TURN');
  throwsCode(() => c.room.pass(cur, c.room.turn.id + 99), 'STALE_TURN');
  c.room.pass(cur, c.room.turn.id);
  assert.notEqual(c.room.turn.playerId, cur);
});

test('turnos: o temporizador (30s no jogo, curto aqui) passa a vez sozinho', async () => {
  const c = begin(imp({ timings: { turnMs: 40 } }));
  const first = c.room.turn.playerId;
  const id1 = c.room.turn.id;
  assert.ok(c.room.turn.duration === 40 && c.room.turn.deadline > Date.now() - 5);
  await sleep(220);
  assert.ok(c.room.turn?.id > id1 || c.room.imp.stage === 'vote');
  assert.notEqual(c.room.turn?.playerId, first);
  c.room.destroy();
});

test('turnos: o tempo padrão de turno é de 30 segundos', () => {
  const room = new Room('X');
  assert.equal(room.timings.turnMs, 30_000);
  room.destroy();
});

test('turnos: espectador não joga turno; eliminado não recebe novos turnos', async () => {
  const c = begin(imp({ mode: 'imp_multi', commons: 5, cfg: { count: 1, innocents: 'host', innocentChar: 'Goku' } }));
  const seen = new Set();
  while (c.room.imp.stage === 'turns') {
    seen.add(c.room.turn.playerId);
    c.room.pass(c.room.turn.playerId, c.room.turn.id);
  }
  assert.ok(!seen.has(c.host.id));
  const victim = innocentsOf(c.room)[0];
  voteOn(c.room, victim.id);
  await afterResult();
  assert.equal(victim.eliminated, true);
  for (let r = 0; r < 2 && c.room.phase === 'playing'; r++) {
    const order = [];
    while (c.room.imp.stage === 'turns') {
      order.push(c.room.turn.playerId);
      c.room.pass(c.room.turn.playerId, c.room.turn.id);
    }
    assert.ok(!order.includes(victim.id), 'eliminado não joga');
    assert.ok(!order.includes(c.host.id));
    if (c.room.phase !== 'playing') break;
    voteOn(c.room, c.room.imp.vote.eligible.find((id) => c.room.byId(id).role === 'innocent'));
    await afterResult();
  }
  c.room.destroy();
});

// ------------------------------------------------------------ votação
test('votação: um voto por jogador; duplicado, em si mesmo, em eliminado ou de espectador é recusado', async () => {
  const c = begin(imp({ mode: 'imp_multi', commons: 5, cfg: { count: 1, innocents: 'host', innocentChar: 'Goku' } }));
  passRound(c.room);
  const { vote } = c.room.imp;
  const [a, b, d] = c.others;
  assert.ok(!vote.eligible.includes(c.host.id));
  throwsCode(() => c.room.castVote(c.host.id, a.id, vote.id), 'NOT_ALLOWED'); // espectador
  throwsCode(() => c.room.castVote(a.id, a.id, vote.id), 'INVALID'); // em si mesmo
  throwsCode(() => c.room.castVote(a.id, c.host.id, vote.id), 'INVALID'); // no espectador
  throwsCode(() => c.room.castVote(a.id, 'nao-existe', vote.id), 'INVALID');
  throwsCode(() => c.room.castVote(a.id, b.id, vote.id + 5), 'STALE_VOTE');
  c.room.castVote(a.id, b.id, vote.id);
  throwsCode(() => c.room.castVote(a.id, d.id, vote.id), 'DUPLICATE');
  assert.equal(c.room.viewFor(a.id).imp.vote.myVote, b.id);
  assert.equal(c.room.viewFor(b.id).imp.vote.myVote, null); // o voto dos outros não aparece antes do resultado
  assert.deepEqual(c.room.viewFor(b.id).imp.vote.voted, [a.id]);
  c.room.destroy();
});

test('votação: eliminado não pode mais votar nem receber voto', async () => {
  const c = begin(imp({ mode: 'imp_multi', commons: 6, cfg: { count: 1 } }));
  passRound(c.room);
  const victim = innocentsOf(c.room)[0];
  voteOn(c.room, victim.id);
  await afterResult();
  assert.equal(victim.eliminated, true);
  passRound(c.room);
  const vote = c.room.imp.vote;
  assert.ok(!vote.eligible.includes(victim.id));
  throwsCode(() => c.room.castVote(victim.id, c.room.impActive()[0].id, vote.id), 'NOT_ALLOWED');
  const voter = c.room.impActive().find((p) => p.id !== vote.eligible[0]);
  throwsCode(() => c.room.castVote(voter.id, victim.id, vote.id), 'INVALID');
  c.room.destroy();
});

test('votação: maioria estrita elimina e todos veem o mesmo resultado', async () => {
  const c = begin(imp({ mode: 'imp_elim', commons: 4 }));
  passRound(c.room);
  const target = innocentsOf(c.room)[0];
  voteOn(c.room, target.id);
  assert.equal(c.room.imp.stage, 'result');
  const results = c.all.map((p) => JSON.stringify(c.room.viewFor(p.id).imp.vote.result));
  assert.equal(new Set(results).size, 1);
  const r = JSON.parse(results[0]);
  assert.equal(r.eliminatedId, target.id);
  assert.equal(r.tie, false);
  assert.ok(c.all.every((p) => c.room.viewFor(p.id).players.find((x) => x.id === target.id).eliminated));
  c.room.destroy();
});

test('votação: EMPATE não elimina ninguém, não termina a partida, vai para outra rodada e depois nova votação com todos', async () => {
  const c = begin(imp({ mode: 'imp_single', commons: 3 })); // 4 participantes
  passRound(c.room);
  const ids = c.room.imp.vote.eligible;
  // 2 x 2: A e B votam em C; C e D votam em A... gera empate no topo
  const [A, B, C, D] = ids;
  c.room.castVote(A, C, c.room.imp.vote.id);
  c.room.castVote(B, C, c.room.imp.vote.id);
  c.room.castVote(C, A, c.room.imp.vote.id);
  c.room.castVote(D, A, c.room.imp.vote.id);
  assert.equal(c.room.imp.vote.result.tie, true);
  assert.equal(c.room.imp.vote.result.eliminatedId, null);
  assert.ok(c.room.players.every((p) => !p.eliminated));
  await afterResult();
  assert.equal(c.room.phase, 'playing'); // não terminou
  assert.equal(c.room.imp.stage, 'turns'); // outra rodada normal, SEM votação de desempate restrita
  assert.equal(c.room.imp.vote, null);
  assert.equal(c.room.imp.round, 2);
  const order = [];
  while (c.room.imp.stage === 'turns') {
    order.push(c.room.turn.playerId);
    c.room.pass(c.room.turn.playerId, c.room.turn.id);
  }
  assert.equal(order.length, 4); // todos os ativos jogaram de novo
  assert.deepEqual([...c.room.imp.vote.eligible].sort(), [...ids].sort()); // nova votação com TODOS os ativos
  c.room.destroy();
});

test('votação: empates repetidos continuam sem eliminar ninguém, rodada após rodada', async () => {
  const c = begin(imp({ mode: 'imp_single', commons: 3 }));
  for (let k = 1; k <= 3; k++) {
    passRound(c.room);
    const [A, B, C, D] = c.room.imp.vote.eligible;
    const vid = c.room.imp.vote.id;
    c.room.castVote(A, C, vid);
    c.room.castVote(B, C, vid);
    c.room.castVote(C, A, vid);
    c.room.castVote(D, A, vid);
    assert.equal(c.room.imp.lastVote.tie, true);
    await afterResult();
    assert.equal(c.room.phase, 'playing');
    assert.equal(c.room.imp.round, k + 1);
    assert.ok(c.room.players.every((p) => !p.eliminated));
  }
  c.room.destroy();
});

test('votação: sem votos (todos se abstêm) = empate; o tempo da votação acaba e segue para nova rodada', async () => {
  const c = begin(imp({ timings: { voteMs: 40 } }));
  passRound(c.room);
  await sleep(220);
  assert.equal(c.room.imp.lastVote.tie, true);
  assert.ok(c.room.players.every((p) => !p.eliminated));
  await afterResult();
  assert.equal(c.room.phase, 'playing');
  assert.equal(c.room.imp.round, 2);
  c.room.destroy();
});

// ------------------------------------------------------------ vitórias
test('ELIMINAÇÃO: inocente eliminado → continua; ao sobrar impostor + 1 inocente → impostor vence', async () => {
  const c = begin(imp({ mode: 'imp_elim', commons: 3 })); // 4 jogadores
  passRound(c.room);
  voteOn(c.room, innocentsOf(c.room)[0].id);
  await afterResult();
  assert.equal(c.room.phase, 'playing'); // 3 restantes
  assert.equal(c.room.imp.round, 2);
  passRound(c.room);
  voteOn(c.room, c.room.impActive().find((p) => p.role === 'innocent').id);
  await afterResult();
  assert.equal(c.room.phase, 'finished'); // restaram 2: impostor + inocente
  assert.equal(c.room.result.impostor.winner, 'impostors');
});

test('ELIMINAÇÃO: eliminar o impostor → inocentes vencem na hora (com 3, 5 e 7 jogadores)', async () => {
  for (const commons of [2, 4, 6]) {
    const c = begin(imp({ mode: 'imp_elim', commons }));
    passRound(c.room);
    voteOn(c.room, impostorsOf(c.room)[0].id);
    await afterResult();
    assert.equal(c.room.phase, 'finished');
    assert.equal(c.room.result.impostor.winner, 'innocents');
  }
});

test('ELIMINAÇÃO: host espectador — vence ao restarem 2 participantes (o host não conta)', async () => {
  const c = begin(imp({ mode: 'imp_elim', commons: 4, cfg: { innocents: 'host', innocentChar: 'Goku' } })); // 4 participantes
  passRound(c.room);
  voteOn(c.room, innocentsOf(c.room)[0].id);
  await afterResult();
  assert.equal(c.room.phase, 'playing'); // 3 participantes (+ host espectador = 4 pessoas)
  passRound(c.room);
  voteOn(c.room, c.room.impActive().find((p) => p.role === 'innocent').id);
  await afterResult();
  assert.equal(c.room.phase, 'finished');
  assert.equal(c.room.result.impostor.winner, 'impostors');
});

test('VOTAÇÃO ÚNICA: inocente eliminado → impostor vence; impostor eliminado → inocentes vencem', async () => {
  const a = begin(imp({ mode: 'imp_single', commons: 4 }));
  passRound(a.room);
  voteOn(a.room, innocentsOf(a.room)[0].id);
  await afterResult();
  assert.equal(a.room.phase, 'finished');
  assert.equal(a.room.result.impostor.winner, 'impostors');

  const b = begin(imp({ mode: 'imp_single', commons: 4 }));
  passRound(b.room);
  voteOn(b.room, impostorsOf(b.room)[0].id);
  await afterResult();
  assert.equal(b.room.result.impostor.winner, 'innocents');
  assert.equal(b.room.viewFor(b.host.id).result.impostor.impostorIds[0], impostorsOf(b.room)[0].id);
});

test('VOTAÇÃO ÚNICA: empate NÃO encerra; só uma votação com resultado definido encerra', async () => {
  const c = begin(imp({ mode: 'imp_single', commons: 3 }));
  passRound(c.room);
  const [A, B, C, D] = c.room.imp.vote.eligible;
  const vid = c.room.imp.vote.id;
  c.room.castVote(A, C, vid);
  c.room.castVote(B, C, vid);
  c.room.castVote(C, A, vid);
  c.room.castVote(D, A, vid);
  await afterResult();
  assert.equal(c.room.phase, 'playing');
  passRound(c.room);
  voteOn(c.room, impostorsOf(c.room)[0].id);
  await afterResult();
  assert.equal(c.room.phase, 'finished');
  assert.equal(c.room.result.impostor.winner, 'innocents');
});

test('MÚLTIPLOS: inocentes vencem ao eliminar todos os impostores; impostores vencem ao igualar os inocentes', async () => {
  // 6 jogadores, 2 impostores: eliminar os 2 impostores
  const a = begin(imp({ mode: 'imp_multi', commons: 5, cfg: { count: 2 } }));
  passRound(a.room);
  voteOn(a.room, impostorsOf(a.room)[0].id);
  await afterResult();
  assert.equal(a.room.phase, 'playing'); // 1 impostor, 4 inocentes
  passRound(a.room);
  voteOn(a.room, impostorsOf(a.room).find((p) => !p.eliminated).id);
  await afterResult();
  assert.equal(a.room.result.impostor.winner, 'innocents');

  // 5 jogadores (2 impostores, 3 inocentes): eliminar 1 inocente → 2 x 2 → impostores vencem
  const b = begin(imp({ mode: 'imp_multi', commons: 4, cfg: { count: 2, sheet: 'character' } }));
  passRound(b.room);
  voteOn(b.room, innocentsOf(b.room)[0].id);
  await afterResult();
  assert.equal(b.room.phase, 'finished');
  assert.equal(b.room.result.impostor.winner, 'impostors');
});

test('MÚLTIPLOS: inocente eliminado com impostores ainda em minoria → partida segue', async () => {
  const c = begin(imp({ mode: 'imp_multi', commons: 6, cfg: { count: 2 } })); // 7 jogadores: 2 impostores, 5 inocentes
  passRound(c.room);
  voteOn(c.room, innocentsOf(c.room)[0].id);
  await afterResult();
  assert.equal(c.room.phase, 'playing'); // 2 x 4
  passRound(c.room);
  voteOn(c.room, c.room.impActive().find((p) => p.role === 'innocent').id);
  await afterResult();
  assert.equal(c.room.phase, 'playing'); // 2 x 3
  c.room.destroy();
});

test('MÚLTIPLOS com host espectador: o host fora da contagem de vitória', async () => {
  const c = begin(imp({ mode: 'imp_multi', commons: 5, cfg: { count: 2, innocents: 'host', innocentChar: 'Goku' } })); // 5 participantes
  passRound(c.room);
  voteOn(c.room, innocentsOf(c.room)[0].id);
  await afterResult();
  assert.equal(c.room.phase, 'finished'); // 5 participantes = 2 impostores + 3 inocentes; sai 1 inocente → 2 x 2 (o host não conta)
  assert.equal(c.room.result.impostor.winner, 'impostors');
});

test('saída no meio da partida: sair deixa de contar para turno/voto/vitória', async () => {
  const c = imp({ mode: 'imp_multi', commons: 3, cfg: { count: 1 } }); // 4 jogadores, 1 impostor
  c.room.setSettings(c.host.id, { mode: 'imp_elim', impostor: { pick: 'host', impostorId: c.others[0].id } });
  begin(c);
  c.room.leave(c.others[0].id); // o impostor sai
  assert.equal(c.room.phase, 'finished');
  assert.equal(c.room.result.impostor.winner, 'innocents');
});

test('modos antigos continuam funcionando (chute, vidas, fim por acerto)', () => {
  const room = new Room('OLD', { timings: { turnMs: 5000 } });
  const host = room.createHost('h', 'Host');
  const a = room.addPlayer('a', 'Ana');
  room.setCharacters(host.id, ['Batman', 'Goku']);
  room.suggest(a.id, 'Shrek Verde');
  room.start(host.id);
  assert.equal(room.phase, 'playing');
  assert.equal(room.viewFor(host.id).imp, null);
  assert.equal(room.viewFor(host.id).you.sheet, null);
  const cur = room.turn.playerId;
  const me = room.byId(cur);
  const r = room.guess(cur, me.character, room.turn.id);
  assert.equal(r.correct, true);
  assert.equal(room.phase, 'finished');
});

// ------------------------------------------------------------ rede (handlers reais)
class FakeSocket {
  constructor(io, id) {
    Object.assign(this, { io, id, data: {}, handlers: new Map(), inbox: [] });
  }
  on(e, fn) {
    this.handlers.set(e, fn);
  }
  call(e, p) {
    return new Promise((res) => this.handlers.get(e)(p, res));
  }
  last(e) {
    return [...this.inbox].reverse().find((m) => m.ev === e)?.payload;
  }
}
class FakeIO {
  constructor() {
    this.sockets = { sockets: new Map() };
  }
  on(e, fn) {
    if (e === 'connection') this.onConnection = fn;
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

test('rede: 4 clientes jogam um IMPOSTOR — ELIMINAÇÃO inteiro (folhas privadas, turnos, voto, duplicado, resultado sincronizado)', async () => {
  const io = new FakeIO();
  createGameServer(io, { timings: { ...T, voteResultMs: 30 } });
  const host = io.connect('H');
  const created = await host.call('room:create', { nickname: 'Hostão', mode: 'imp_elim' });
  assert.ok(created.ok, created.error);
  const clients = [host];
  for (const n of ['Ana', 'Beto', 'Carla']) {
    const s = io.connect('S' + n);
    assert.ok((await s.call('room:join', { code: created.code, nickname: n })).ok);
    clients.push(s);
  }
  assert.equal(host.last('state').settings.mode, 'imp_elim');
  assert.ok((await host.call('room:settings', { impostor: { sheet: 'character' } })).ok);
  assert.equal((await host.call('room:settings', { mode: 'inexistente' })).ok, false);
  assert.ok((await host.call('game:start')).ok);

  const states = clients.map((c) => c.last('state'));
  assert.ok(states.every((s) => s.phase === 'playing' && s.imp.stage === 'reveal' && s.you.sheet?.text));
  const texts = states.map((s) => s.you.sheet.text);
  assert.equal(new Set(texts).size, 2); // 3 iguais (inocentes) + 1 diferente (impostor)
  for (const s of states) for (const other of texts.filter((t) => t !== s.you.sheet.text)) assert.ok(!JSON.stringify(s).includes(other), 'folha alheia no estado');

  // "Entendi" de todos → turnos
  for (const c of clients) assert.ok((await c.call('imp:ready')).ok);
  let st = host.last('state');
  assert.equal(st.imp.stage, 'turns');
  const byClient = new Map(clients.map((c) => [c.last('state').you.id, c]));
  const guessTry = await byClient.get(st.turn.playerId).call('turn:guess', { text: 'Qualquer', turnId: st.turn.id });
  assert.equal(guessTry.ok, false);
  const wrong = clients.find((c) => c.last('state').you.id !== st.turn.playerId);
  assert.equal((await wrong.call('turn:pass', { turnId: st.turn.id })).ok, false);
  while (host.last('state').imp.stage === 'turns') {
    const t = host.last('state').turn;
    assert.ok((await byClient.get(t.playerId).call('turn:pass', { turnId: t.id })).ok);
  }
  st = host.last('state');
  assert.equal(st.imp.stage, 'vote');

  // todos votam no mesmo jogador (quem não for ele); o alvo vota em outro
  const ids = st.imp.vote.eligible;
  const target = ids[1];
  for (const id of ids) {
    const to = id === target ? ids[0] : target;
    assert.ok((await byClient.get(id).call('vote:cast', { targetId: to, voteId: st.imp.vote.id })).ok);
  }
  const dup = await byClient.get(ids[0]).call('vote:cast', { targetId: ids[2], voteId: st.imp.vote.id });
  assert.equal(dup.ok, false);
  const finalStates = clients.map((c) => c.last('state'));
  assert.equal(new Set(finalStates.map((s) => JSON.stringify(s.imp.vote.result))).size, 1);
  assert.equal(finalStates[0].imp.vote.result.eliminatedId, target);
  assert.ok(finalStates.every((s) => s.players.find((p) => p.id === target).eliminated));
  await sleep(80);
  // ou terminou (impostor eliminado) ou seguiu para a rodada 2; nos dois casos, estado idêntico para todos
  const after = clients.map((c) => c.last('state'));
  assert.equal(new Set(after.map((s) => s.phase + ':' + s.imp.stage + ':' + s.imp.round)).size, 1);
  if (after[0].phase === 'finished') assert.ok(after.every((s) => s.players.every((p) => p.role)));
});

test('rede: host espectador (IMPOSTORES — MÚLTIPLOS) — sem folha, voto recusado, 5 clientes veem o mesmo resultado', async () => {
  const io = new FakeIO();
  createGameServer(io, { timings: { ...T, voteResultMs: 30 } });
  const host = io.connect('H');
  const created = await host.call('room:create', { nickname: 'Hostão', mode: 'imp_multi' });
  const clients = [host];
  for (const n of ['Ana', 'Beto', 'Carla', 'Duda', 'Eva']) {
    const s = io.connect('S' + n);
    assert.ok((await s.call('room:join', { code: created.code, nickname: n })).ok);
    clients.push(s);
  }
  // 5 participantes, 2 impostores com outro personagem, aliados se conhecem
  assert.ok((await host.call('room:settings', { impostor: { innocents: 'host', innocentChar: 'Goku', sheet: 'character', impostorChar: 'Naruto', count: 2, alliesKnow: true } })).ok);
  assert.ok((await clients[1].call('room:settings', { impostor: { count: 1 } })).ok === false); // só o host configura
  assert.ok((await host.call('game:start')).ok);
  const hs = host.last('state');
  assert.equal(hs.you.sheet, null);
  assert.equal(hs.you.spectator, true);
  const sheets = clients.slice(1).map((c) => c.last('state').you.sheet);
  assert.equal(sheets.filter((s) => s.text === 'Naruto').length, 2);
  assert.equal(sheets.filter((s) => s.text === 'Goku').length, 3);
  assert.equal(sheets.filter((s) => s.allies?.length === 1).length, 2); // só os impostores conhecem o aliado
  for (const c of clients.slice(1)) assert.ok((await c.call('imp:ready')).ok);
  assert.equal((await host.call('imp:ready')).ok, false);
  const byId = new Map(clients.slice(1).map((c) => [c.last('state').you.id, c]));
  while (host.last('state').imp.stage === 'turns') {
    const t = host.last('state').turn;
    assert.notEqual(t.playerId, hs.you.id); // espectador não joga
    assert.ok((await byId.get(t.playerId).call('turn:pass', { turnId: t.id })).ok);
  }
  const vote = host.last('state').imp.vote;
  assert.equal((await host.call('vote:cast', { targetId: [...byId.keys()][0], voteId: vote.id })).ok, false);
  const ids = vote.eligible;
  for (const id of ids) assert.ok((await byId.get(id).call('vote:cast', { targetId: id === ids[0] ? ids[1] : ids[0], voteId: vote.id })).ok);
  const seen = clients.map((c) => JSON.stringify(c.last('state').imp.vote.result));
  assert.equal(new Set(seen).size, 1);
  assert.equal(JSON.parse(seen[0]).eliminatedId, ids[0]);
});

test('rodadas antes da votação: o host escolhe de 1 a 5 e cada jogador ativo joga esse tanto antes de cada votação', async () => {
  const c = imp({ mode: 'imp_single', commons: 3 }); // 4 jogadores
  throwsCode(() => c.room.setSettings(c.host.id, { impostor: { rounds: 0 } }), 'INVALID');
  throwsCode(() => c.room.setSettings(c.host.id, { impostor: { rounds: 6 } }), 'INVALID');
  throwsCode(() => c.room.setSettings(c.others[0].id, { impostor: { rounds: 2 } }), 'NOT_HOST');
  c.room.setSettings(c.host.id, { impostor: { rounds: 3 } });
  assert.equal(c.room.viewFor(c.others[0].id).settings.impostor.rounds, 3);
  begin(c);
  const per = new Map();
  const cycles = [];
  while (c.room.imp.stage === 'turns') {
    per.set(c.room.turn.playerId, (per.get(c.room.turn.playerId) ?? 0) + 1);
    cycles.push(c.room.viewFor(c.host.id).imp.cycle);
    c.room.pass(c.room.turn.playerId, c.room.turn.id);
  }
  assert.equal(c.room.imp.stage, 'vote'); // só vota depois das 3 rodadas
  assert.deepEqual([...per.values()], [3, 3, 3, 3]);
  assert.deepEqual([...new Set(cycles)], [1, 2, 3]);
  // depois de um empate, são de novo 3 rodadas completas
  const [A, B, C, D] = c.room.imp.vote.eligible;
  const vid = c.room.imp.vote.id;
  c.room.castVote(A, C, vid); c.room.castVote(B, C, vid); c.room.castVote(C, A, vid); c.room.castVote(D, A, vid);
  await afterResult();
  let turns = 0;
  while (c.room.imp.stage === 'turns') {
    turns++;
    c.room.pass(c.room.turn.playerId, c.room.turn.id);
  }
  assert.equal(turns, 12);
  c.room.destroy();
});

test('rodadas antes da votação: padrão é 1 (comportamento anterior)', () => {
  const c = begin(imp({ commons: 3 }));
  let turns = 0;
  while (c.room.imp.stage === 'turns') {
    turns++;
    c.room.pass(c.room.turn.playerId, c.room.turn.id);
  }
  assert.equal(turns, 4);
  c.room.destroy();
});
