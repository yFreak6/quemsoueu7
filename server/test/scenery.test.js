// Sorteio do cenário 3D: uma vez por partida, no servidor, igual para todos e estável em reconexões.
// (O desenho dos cenários é do cliente e não é testável aqui; este arquivo cobre só a escolha e a sincronização.)

import assert from 'node:assert/strict';
import test from 'node:test';
import { Room } from '../game/Room.js';
import { DEFAULT_SCENERY, SCENERIES, isScenery, pickScenery } from '../game/scenery.js';

const LIST = ['Batman', 'Goku', 'Naruto', 'Super-Homem', 'Homem-Aranha'];
const T = { turnMs: 5000, resultMs: 20, revealMs: 5000 };

function lobby({ random, commons = 3, mode = 'host' } = {}) {
  const room = new Room('SCEN', { timings: T, random, log: () => {} });
  const host = room.createHost('s-host', 'Hosty');
  const others = Array.from({ length: commons }, (_, i) => room.addPlayer(`s${i}`, `Jogador${i}`));
  if (mode === 'host') {
    room.setCharacters(host.id, LIST);
    others.forEach((p, i) => room.suggest(p.id, `Sugestao Numero${i}`));
  } else {
    room.setSettings(host.id, { mode });
  }
  return { room, host, others, all: [host, ...others] };
}
const views = (room) => room.players.map((p) => room.viewFor(p.id));

test('scenery.js: lista, padrão e validação dos ids', () => {
  assert.deepEqual(SCENERIES, ['bar', 'truck']);
  assert.equal(DEFAULT_SCENERY, 'bar');
  assert.ok(isScenery('bar') && isScenery('truck'));
  assert.ok(!isScenery('x') && !isScenery(undefined));
});

test('pickScenery: cobre todos os cenários conforme o sorteio e nunca sai da lista', () => {
  assert.equal(pickScenery({ random: () => 0, env: {} }), 'bar');
  assert.equal(pickScenery({ random: () => 0.99, env: {} }), 'truck');
  assert.equal(pickScenery({ random: () => 1, env: {} }), 'truck'); // borda: nunca índice fora da lista
  const seen = new Set(Array.from({ length: 200 }, () => pickScenery({ env: {} })));
  assert.deepEqual([...seen].sort(), ['bar', 'truck']);
});

test('pickScenery: QSE_SCENERY força um cenário válido e ignora um inválido', () => {
  assert.equal(pickScenery({ random: () => 0, env: { QSE_SCENERY: 'truck' } }), 'truck');
  assert.equal(pickScenery({ random: () => 0, env: { QSE_SCENERY: 'nada' } }), 'bar');
});

test('no lobby não há cenário; ao iniciar, o sorteado vai no estado de TODOS os jogadores', () => {
  const { room, host } = lobby({ random: () => 0.99 });
  assert.ok(views(room).every((v) => v.scenery === null));
  room.start(host.id);
  const vs = views(room);
  assert.equal(vs.length, 4);
  assert.ok(vs.every((v) => v.scenery === 'truck'), 'todos recebem o mesmo cenário');
  room.destroy();
});

test('o cenário não muda durante a partida: turnos, chutes, passes e visões repetidas', () => {
  const { room, host } = lobby({ random: () => 0.99 });
  room.start(host.id);
  for (let i = 0; i < 6; i++) {
    assert.equal(room.viewFor(host.id).scenery, 'truck');
    if (room.turn) room.pass(room.turn.playerId, room.turn.id);
  }
  assert.equal(room.scenery, 'truck');
  room.destroy();
});

test('reconexão no meio da partida mantém o cenário (não sorteia de novo)', () => {
  let calls = 0;
  const seq = [0.99, 0, 0, 0];
  const { room, host, others } = lobby({ random: () => seq[calls++ % seq.length] });
  room.start(host.id);
  assert.equal(calls, 1, 'sorteou uma única vez');
  const p = others[0];
  room.disconnect(p.socketId);
  room.rejoin(p.token, 'novo-socket');
  assert.equal(room.viewFor(p.id).scenery, 'truck');
  assert.equal(calls, 1, 'a reconexão não sorteia');
  room.destroy();
});

test('nova partida (volta ao lobby e inicia) sorteia de novo; entre uma e outra volta a null', () => {
  const seq = [0, 0.99];
  let i = 0;
  const { room, host } = lobby({ random: () => seq[i++] });
  room.start(host.id);
  assert.equal(room.viewFor(host.id).scenery, 'bar');
  room.reset(host.id);
  assert.equal(room.viewFor(host.id).scenery, null);
  room.players.forEach((p) => !p.isHost && room.suggest(p.id, `Outra Sugestao ${p.nickname}`));
  room.setCharacters(host.id, LIST);
  room.start(host.id);
  assert.equal(room.viewFor(host.id).scenery, 'truck');
  room.destroy();
});

test('início que falha (não pronto) não deixa cenário vazando no estado', () => {
  const { room, host } = lobby({ random: () => 0.99 });
  room.setCharacters(host.id, []);
  assert.throws(() => room.start(host.id));
  assert.equal(room.viewFor(host.id).scenery, null);
  room.destroy();
});

test('modos de impostor e de julgamento também recebem o cenário sorteado', () => {
  const a = lobby({ random: () => 0.99, mode: 'imp_single', commons: 3 });
  a.room.start(a.host.id);
  assert.ok(views(a.room).every((v) => v.scenery === 'truck'));
  a.room.destroy();

  const b = lobby({ random: () => 0, mode: 'judge_human', commons: 3 });
  b.room.setSettings(b.host.id, { judgment: { pick: 'host', rounds: 2, judgeId: b.host.id } });
  b.room.start(b.host.id);
  assert.ok(views(b.room).every((v) => v.scenery === 'bar'));
  b.room.destroy();
});

test('estado novo no cliente: sem scenery (servidor antigo) o cliente cai no bar — contrato do campo', () => {
  const { room, host } = lobby({ random: () => 0.5 });
  room.start(host.id);
  const v = room.viewFor(host.id);
  assert.ok('scenery' in v);
  assert.ok(isScenery(v.scenery));
  room.destroy();
});
