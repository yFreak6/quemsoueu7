import assert from 'node:assert/strict';
import test from 'node:test';
import { isGuessCorrect } from '../game/fuzzy.js';
import { GameError, Room } from '../game/Room.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIST = ['Homem-Aranha', 'Batman', 'Super-Homem', 'Goku', 'Naruto'];

/** Sala no lobby: host + N jogadores comuns, todos com sugestão enviada. */
function lobby({ commons = 3, characters = LIST, timings = {}, suggest = true } = {}) {
  const room = new Room('TEST', { timings: { turnMs: 80, resultMs: 20, ...timings } });
  const host = room.createHost('s-host', 'Hosty');
  const others = Array.from({ length: commons }, (_, i) => room.addPlayer(`s${i}`, `Jogador${i}`));
  room.setCharacters(host.id, characters);
  if (suggest) others.forEach((p, i) => room.suggest(p.id, `Sugestao Numero${i}`));
  return { room, host, others, all: [host, ...others] };
}
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `esperava ${code}`);

// ---------------------------------------------------------------- chute
test('chute: ignora maiúsculas, acentos, pontuação e espaços', () => {
  assert.ok(isGuessCorrect('CLEOPATRA', 'Cleópatra'));
  assert.ok(isGuessCorrect('  homem   aranha! ', 'Homem-Aranha'));
  assert.ok(isGuessCorrect('darthvader', 'Darth Vader'));
});

test('chute: tolera erros conforme o tamanho e recusa o claramente errado', () => {
  assert.ok(isGuessCorrect('albert einstain', 'Albert Einstein'));
  assert.ok(isGuessCorrect('albrt einstain', 'Albert Einstein')); // 2 erros em nome longo
  assert.ok(isGuessCorrect('batmen', 'Batman'));
  assert.ok(!isGuessCorrect('batgirl', 'Batman'));
  assert.ok(isGuessCorrect('Thar', 'Thor')); // nome curto: 1 erro, primeira letra igual
  assert.ok(!isGuessCorrect('Duke', 'Luke')); // primeira letra diferente em nome curto não vale
  assert.ok(!isGuessCorrect('Ana', 'Ani')); // nome de 3 letras: exato
  assert.ok(!isGuessCorrect('Mussolini', 'Napoleão'));
  assert.ok(!isGuessCorrect('Superman', 'Batman'));
  assert.ok(!isGuessCorrect('a', 'A'));
});

test('chute: palavra isolada ou parte do nome não vale', () => {
  assert.ok(!isGuessCorrect('einstein', 'Albert Einstein'));
  assert.ok(!isGuessCorrect('albert', 'Albert Einstein'));
  assert.ok(!isGuessCorrect('michael', 'Michael Jackson'));
  assert.ok(!isGuessCorrect('homem', 'Homem-Aranha'));
});

test('chute: grafia diferente do nome (Epstein/Episten), letras trocadas e som parecido', () => {
  assert.ok(isGuessCorrect('Epstein', 'Episten')); // o host digitou errado, o jogador acertou a grafia
  assert.ok(isGuessCorrect('Episten', 'Epstein'));
  assert.ok(isGuessCorrect('albert eintsien', 'Albert Einstein')); // letras vizinhas trocadas
  assert.ok(isGuessCorrect('Kleopatra', 'Cleópatra')); // c/k
  assert.ok(isGuessCorrect('Filipe Neto', 'Felipe Neto'));
  assert.ok(isGuessCorrect('Michael Jakson', 'Michael Jackson'));
  assert.ok(isGuessCorrect('Jhonny Depp', 'Johnny Depp'));
  assert.ok(isGuessCorrect('Spiderman', 'Spider-Man'));
  assert.ok(isGuessCorrect('Harry Poter', 'Harry Potter'));
});

test('chute: nomes diferentes continuam errados', () => {
  assert.ok(!isGuessCorrect('Mario', 'Luigi'));
  assert.ok(!isGuessCorrect('Goku', 'Gohan'));
  assert.ok(!isGuessCorrect('Hulk', 'Thor'));
  assert.ok(!isGuessCorrect('Pikachu', 'Raichu'));
  assert.ok(!isGuessCorrect('Napoleão', 'Cleópatra'));
  assert.ok(!isGuessCorrect('Albert Einstein', 'Isaac Newton'));
});

// ---------------------------------------------------------------- salas
test('o host é um jogador: tem boneco, assento 0, personagem e vidas', () => {
  const { room, host } = lobby();
  assert.equal(host.isHost, true);
  assert.equal(host.seat, 0);
  room.start(host.id);
  const v = room.viewFor(host.id);
  assert.equal(v.players.length, 4);
  assert.ok(v.players.every((p) => p.lives === 3));
  assert.ok(room.host.character);
});

test('nickname: vazio, curto, longo, só símbolos e repetido são recusados', () => {
  const room = new Room('T');
  room.createHost('h', 'Host');
  throwsCode(() => room.addPlayer('a', ''), 'NICK_INVALID');
  throwsCode(() => room.addPlayer('a', 'x'), 'NICK_INVALID');
  throwsCode(() => room.addPlayer('a', 'a'.repeat(17)), 'NICK_INVALID');
  throwsCode(() => room.addPlayer('a', '!!!'), 'NICK_INVALID');
  throwsCode(() => room.addPlayer('a', '<b>'), 'NICK_INVALID');
  throwsCode(() => room.addPlayer('a', 'HOST'), 'NICK_TAKEN');
  assert.equal(room.addPlayer('a', '  Ana  Maria ').nickname, 'Ana Maria');
});

test('sala cheia e partida em andamento tornam a sala indisponível', () => {
  const many = Array.from({ length: 12 }, (_, i) => `Personagem ${i}`);
  const { room, host } = lobby({ commons: 9, characters: many }); // 10 jogadores
  throwsCode(() => room.addPlayer('x', 'Extra'), 'ROOM_FULL');
  room.start(host.id);
  throwsCode(() => room.addPlayer('x', 'Extra'), 'ROOM_STARTED');
});

test('lobby: jogador que cai some da lista depois do prazo, e a lista fica sem buracos', async () => {
  const { room, others } = lobby({ timings: { lobbyGraceMs: 30 } });
  room.disconnect('s1');
  assert.equal(room.byId(others[1].id).connected, false);
  await sleep(70);
  assert.equal(room.players.length, 3);
  assert.deepEqual(room.players.map((p) => p.seat), [0, 1, 2]);
  assert.ok(!room.players.some((p) => p.nickname === 'Jogador1'));
  room.destroy();
});

test('reconectar com o token devolve o lugar e cancela a remoção', async () => {
  const { room, others } = lobby({ timings: { lobbyGraceMs: 30 } });
  room.disconnect('s0');
  room.rejoin(others[0].token, 'novo-socket');
  await sleep(60);
  assert.equal(room.players.length, 4);
  assert.equal(room.byId(others[0].id).connected, true);
  throwsCode(() => room.rejoin('token-falso', 'x'), 'SESSION_EXPIRED');
  room.destroy();
});

test('host desconectado: sem transferência de autoridade; volta a tempo ou a sala fecha', async () => {
  const closes = [];
  const a = lobby({ timings: { hostGraceLobbyMs: 40 } });
  a.room.onClose = (r, reason) => closes.push(reason);
  a.room.disconnect('s-host');
  await sleep(20);
  assert.equal(a.room.host.id, a.host.id); // continua sendo o host
  a.room.rejoin(a.host.token, 'novo');
  await sleep(60);
  assert.deepEqual(closes, []); // voltou a tempo

  const b = lobby({ timings: { hostGraceLobbyMs: 30 } });
  b.room.onClose = (r, reason) => closes.push(reason);
  b.room.disconnect('s-host');
  await sleep(70);
  assert.deepEqual(closes, ['host-timeout']);
  assert.equal(b.room.phase, 'closed');
  throwsCode(() => b.room.addPlayer('z', 'Novo'), 'ROOM_CLOSED');
});

test('host que sai encerra a sala; jogador comum que sai apenas deixa a sala', () => {
  const closes = [];
  const { room, host, others } = lobby();
  room.onClose = (r, reason) => closes.push(reason);
  room.leave(others[0].id);
  assert.equal(room.players.length, 3);
  room.leave(host.id);
  assert.deepEqual(closes, ['host-left']);
});

// ---------------------------------------------------------------- personagens e sorteio
test('só o host mexe na lista; duplicados e vazios saem; dá para corrigir e remover', () => {
  const { room, host, others } = lobby({ characters: [] });
  throwsCode(() => room.setCharacters(others[0].id, ['X']), 'NOT_HOST');
  room.setCharacters(host.id, ['Batman', ' batman ', '', '   ', '!!!', 'Goku', 'Vegeta']);
  assert.deepEqual(room.characters, ['Batman', 'Goku', 'Vegeta']);
  room.setCharacters(host.id, ['Batman', 'Gokou', 'Vegeta']); // correção
  assert.deepEqual(room.characters, ['Batman', 'Gokou', 'Vegeta']);
  room.setCharacters(host.id, ['Batman']); // remoção
  assert.equal(room.characters.length, 1);
});

test('só jogadores comuns sugerem; uma sugestão por jogador (trocar substitui); nome inválido é recusado', () => {
  const { room, host, others } = lobby({ suggest: false });
  throwsCode(() => room.suggest(host.id, 'Shrek'), 'NOT_ALLOWED');
  throwsCode(() => room.suggest(others[0].id, '   '), 'INVALID');
  throwsCode(() => room.suggest(others[0].id, '???'), 'INVALID');
  room.suggest(others[0].id, 'Shrek');
  room.suggest(others[0].id, 'Mario');
  assert.equal(room.byId(others[0].id).suggestion, 'Mario');
  assert.equal(room.players.filter((p) => p.suggestion).length, 1);
});

test('exemplo do enunciado: host recebe uma sugestão, B/C/D recebem os 3 do host sem repetir', () => {
  for (let run = 0; run < 300; run++) {
    const room = new Room('T');
    const host = room.createHost('h', 'Host');
    const [b, c, d] = ['B', 'C', 'D'].map((n, i) => room.addPlayer(`s${i}`, `Jogador ${n}`));
    room.setCharacters(host.id, ['Homem-Aranha', 'Batman', 'Super-Homem']);
    room.suggest(b.id, 'Shrek');
    room.suggest(c.id, 'Mario');
    room.suggest(d.id, 'Sonic');
    room.start(host.id);
    assert.ok(['Shrek', 'Mario', 'Sonic'].includes(host.character), 'o host recebe uma sugestão');
    const got = [b, c, d].map((p) => p.character);
    assert.deepEqual([...got].sort(), ['Batman', 'Homem-Aranha', 'Super-Homem'], 'distribuição sem repetição');
    room.destroy();
  }
});

test('lista maior que o necessário: cada jogador recebe um nome diferente da lista, e o host nunca da lista', () => {
  for (let run = 0; run < 200; run++) {
    const { room, host, others } = lobby({ commons: 3 });
    room.start(host.id);
    const chars = others.map((p) => p.character);
    assert.equal(new Set(chars).size, 3);
    assert.ok(chars.every((c) => LIST.includes(c)));
    assert.ok(!LIST.includes(host.character));
    assert.ok(host.character.startsWith('Sugestao'));
    room.destroy();
  }
});

test('sugestão igual a um nome da lista nunca gera personagem repetido; sem saída, o sorteio avisa', () => {
  for (let run = 0; run < 100; run++) {
    const room = new Room('T');
    const host = room.createHost('h', 'Host');
    const a = room.addPlayer('a', 'Ana');
    const b = room.addPlayer('b', 'Beto');
    room.setCharacters(host.id, ['A Um', 'B Dois']);
    room.suggest(a.id, 'a um'); // coincide com a lista
    room.suggest(b.id, 'Zed');
    room.start(host.id);
    assert.equal(host.character, 'Zed');
    assert.deepEqual([a.character, b.character].sort(), ['A Um', 'B Dois']);
    room.destroy();
  }
  const room = new Room('T');
  const host = room.createHost('h', 'Host');
  const a = room.addPlayer('a', 'Ana');
  room.setCharacters(host.id, ['Só Um']);
  room.suggest(a.id, 'so um');
  throwsCode(() => room.start(host.id), 'DRAW_FAILED');
  assert.equal(room.phase, 'lobby'); // falha não corrompe a sala
});

// ---------------------------------------------------------------- validação de início
test('início: explica o que falta e só o host inicia', () => {
  const { room, host, others } = lobby({ suggest: false, characters: ['Batman'] });
  throwsCode(() => room.start(others[0].id), 'NOT_HOST');
  const r = room.readiness();
  assert.equal(r.ok, false);
  assert.match(r.missing.join(' '), /Faltam sugestões de: Jogador0, Jogador1, Jogador2/);
  assert.match(r.missing.join(' '), /Cadastre pelo menos 3/);
  assert.throws(() => room.start(host.id), /Faltam sugestões/);

  const solo = new Room('S');
  const h = solo.createHost('h', 'Solo');
  throwsCode(() => solo.start(h.id), 'NOT_READY');
  assert.match(solo.readiness().missing[0], /mais um jogador/);
  assert.equal(room.phase, 'lobby');
});

test('início: jogador sem conexão bloqueia a partida até voltar', () => {
  const { room, host, others } = lobby();
  room.disconnect('s1');
  assert.match(room.readiness().missing.join(' '), /Sem conexão: Jogador1/);
  throwsCode(() => room.start(host.id), 'NOT_READY');
  room.rejoin(others[1].token, 'back');
  room.start(host.id);
  assert.equal(room.phase, 'playing');
  room.destroy();
});

test('clique duplo em Iniciar: o segundo é recusado e o sorteio não muda', () => {
  const { room, host, all } = lobby();
  room.start(host.id);
  const before = all.map((p) => p.character);
  const turnId = room.turn.id;
  throwsCode(() => room.start(host.id), 'ALREADY_STARTED');
  assert.deepEqual(all.map((p) => p.character), before);
  assert.equal(room.turn.id, turnId);
  room.destroy();
});

// ---------------------------------------------------------------- visibilidade
test('REGRA CRÍTICA: ninguém recebe o próprio personagem, nem o host; todos veem o dos outros', () => {
  const { room, host, all } = lobby({ commons: 4 });
  room.start(host.id);
  for (const p of all) {
    const view = room.viewFor(p.id);
    const self = view.players.find((x) => x.id === p.id);
    assert.equal(self.character, null);
    assert.ok(!JSON.stringify(view).includes(p.character), `o JSON de ${p.nickname} vaza o próprio personagem`);
    for (const other of view.players.filter((x) => x.id !== p.id)) assert.ok(other.character);
  }
});

test('sugestões alheias e a lista do host nunca vazam para quem não deve', () => {
  const { room, host, others } = lobby();
  const hostView = JSON.stringify(room.viewFor(host.id));
  assert.ok(!hostView.includes('Sugestao'), 'o host não pode ver as sugestões');
  assert.ok(hostView.includes('Batman')); // a própria lista, sim
  for (const p of others) {
    const view = room.viewFor(p.id);
    const json = JSON.stringify(view);
    for (const q of others.filter((x) => x !== p)) assert.ok(!json.includes(q.suggestion));
    assert.ok(json.includes(p.suggestion)); // a própria, sim
    assert.ok(!json.includes('Batman'), 'jogador comum não vê a lista do host');
    assert.equal(view.lobby.characters, null);
    assert.equal(view.lobby.ready, null);
  }
  const submitted = room.viewFor(others[0].id).players.map((p) => p.submitted);
  assert.deepEqual(submitted, [null, true, true, true]); // só o status, nunca o conteúdo
  const suggestions = others.map((p) => p.suggestion);
  room.start(host.id);
  const notDrawn = suggestions.filter((s) => s !== host.character);
  assert.equal(notDrawn.length, 2);
  for (const p of room.players) {
    const v = room.viewFor(p.id);
    const json = JSON.stringify(v);
    for (const s of notDrawn) assert.ok(!json.includes(s), 'sugestão não sorteada continua circulando');
    assert.equal(v.lobby, null);
    assert.ok(!json.includes('Batman') || v.players.some((x) => x.character === 'Batman'), 'lista do host só aparece como personagem de alguém');
  }
  room.destroy();
});

// ---------------------------------------------------------------- turnos
test('turno: 30s configurados, id crescente, apenas um turno ativo', () => {
  const { room, host } = lobby({ timings: { turnMs: 30_000 } });
  room.start(host.id);
  assert.equal(room.turn.duration, 30_000);
  assert.ok(room.turn.deadline - Date.now() <= 30_000);
  assert.equal(room.turn.step, 'action');
  assert.equal(room.turn.id, 1);
  room.destroy();
});

test('ações fora de turno, com turnId velho ou duplicadas são recusadas', () => {
  const { room, host, all } = lobby({ timings: { turnMs: 5000, resultMs: 5000 } });
  room.start(host.id);
  const current = room.byId(room.turn.playerId);
  const other = all.find((p) => p.id !== current.id);
  throwsCode(() => room.guess(other.id, 'X Y Z', room.turn.id), 'NOT_YOUR_TURN');
  throwsCode(() => room.pass(other.id, room.turn.id), 'NOT_YOUR_TURN');
  throwsCode(() => room.guess(current.id, 'X Y Z', 999), 'STALE_TURN');

  const id = room.turn.id;
  room.pass(current.id, id);
  throwsCode(() => room.pass(current.id, id), 'NOT_YOUR_TURN'); // clique duplo: a vez já mudou
  throwsCode(() => room.guess(current.id, 'abc', id), 'NOT_YOUR_TURN');
  assert.equal(room.turn.id, id + 1);
  room.destroy();
});

test('passar a vez: encerra na hora, vai para a direita e não tira vida', () => {
  const { room, host, all } = lobby({ timings: { turnMs: 5000 } });
  room.start(host.id);
  const current = room.byId(room.turn.playerId);
  const lives = current.lives;
  room.pass(current.id, room.turn.id);
  assert.equal(room.turn.playerId, all[(current.seat + 1) % 4].id);
  assert.equal(room.turn.step, 'action');
  assert.equal(current.lives, lives);
  room.destroy();
});

test('tempo esgotado passa a vez sem perder vida e sem reiniciar o relógio de ninguém', async () => {
  const { room, host, all } = lobby({ timings: { turnMs: 80 } });
  room.start(host.id);
  const first = room.byId(room.turn.playerId);
  const deadline = room.turn.deadline;
  await sleep(40);
  assert.equal(room.turn.deadline, deadline); // ler/reconectar não mexe no relógio
  await sleep(70);
  assert.notEqual(room.turn.playerId, first.id);
  assert.equal(room.turn.playerId, all[(first.seat + 1) % 4].id);
  assert.ok(all.every((p) => p.lives === 3));
  room.destroy();
});

test('chute errado: perde 1 vida, pausa curta e a vez passa para a direita', async () => {
  const { room, host, all } = lobby({ timings: { turnMs: 5000, resultMs: 30 } });
  room.start(host.id);
  const p = room.byId(room.turn.playerId);
  const res = room.guess(p.id, 'Zzzzzzzzz Qqqqq', room.turn.id);
  assert.deepEqual([res.correct, res.eliminated, res.livesLeft], [false, false, 2]);
  assert.equal(room.turn.step, 'result');
  throwsCode(() => room.pass(p.id), 'STALE_TURN'); // nada de agir durante a pausa
  await sleep(60);
  assert.equal(room.turn.playerId, all[(p.seat + 1) % 4].id);
  assert.equal(room.turn.step, 'action');
  room.destroy();
});

test('eliminação: zero vidas revela o personagem ao próprio jogador e ele sai da sequência', async () => {
  const { room, host, all } = lobby({ timings: { turnMs: 5000, resultMs: 20 } });
  room.start(host.id);
  const p = room.byId(room.turn.playerId);
  p.lives = 1;
  const res = room.guess(p.id, 'Errado Errado', room.turn.id);
  assert.equal(res.eliminated, true);
  const self = room.viewFor(p.id).players.find((x) => x.id === p.id);
  assert.equal(self.eliminated, true);
  assert.equal(self.character, p.character);
  await sleep(50);
  for (let i = 0; i < 12; i++) {
    assert.notEqual(room.turn.playerId, p.id, 'eliminado recebeu turno');
    room.pass(room.turn.playerId, room.turn.id);
  }
  room.destroy();
});

test('acertar (com acento, caixa e erro de digitação) vence e revela todos', () => {
  // nomes longos: nomes de até 4 letras exigem acerto exato (regra do chute tolerante)
  const { room, host, all } = lobby({ characters: ['Homem-Aranha', 'Albert Einstein', 'Darth Vader', 'Harry Potter', 'Capitão América'], timings: { turnMs: 5000 } });
  room.start(host.id);
  const p = room.byId(room.turn.playerId);
  const typo = p.character.slice(0, -1) + 'x';
  const res = room.guess(p.id, typo.toUpperCase(), room.turn.id);
  assert.equal(res.correct, true);
  assert.equal(room.phase, 'finished');
  assert.equal(room.result.winnerId, p.id);
  assert.equal(room.turn, null);
  for (const viewer of all) assert.ok(room.viewFor(viewer.id).players.every((x) => x.character));
  room.destroy();
});

test('todos eliminados: partida termina sem vencedor', () => {
  const { room, host, all } = lobby({ commons: 1, timings: { turnMs: 5000 } });
  room.start(host.id);
  all.forEach((p) => (p.eliminated = true));
  room.passTurn();
  assert.equal(room.phase, 'finished');
  assert.equal(room.result.winnerId, null);
});

test('jogador desconectado é pulado quando há alguém online; ao sair em jogo vira eliminado', () => {
  const { room, host, all } = lobby({ commons: 3, timings: { turnMs: 5000 } });
  room.start(host.id);
  const cur = room.byId(room.turn.playerId);
  const right = all[(cur.seat + 1) % 4];
  room.disconnect(right.socketId);
  room.pass(cur.id, room.turn.id);
  assert.equal(room.turn.playerId, all[(cur.seat + 2) % 4].id);

  const t = room.byId(room.turn.playerId);
  if (!t.isHost) {
    room.leave(t.id);
    assert.equal(room.byId(t.id).eliminated, true);
    assert.notEqual(room.turn.playerId, t.id);
  }
  room.destroy();
});

test('eventos têm id sequencial (o cliente toca cada som uma única vez)', () => {
  const events = [];
  const { room, host } = lobby({ timings: { turnMs: 5000, resultMs: 5000 } });
  room.onEvent = (e) => events.push(e);
  room.start(host.id);
  const p = room.byId(room.turn.playerId);
  room.guess(p.id, 'Errado Errado', room.turn.id);
  assert.deepEqual(events.map((e) => e.type), ['game-start', 'wrong-guess']);
  assert.deepEqual(events.map((e) => e.id), [1, 2]);
  room.destroy();
});

test('reset volta ao lobby: personagens limpos e cada jogador precisa sugerir de novo', () => {
  const { room, host, all } = lobby({ timings: { turnMs: 5000 } });
  room.start(host.id);
  room.reset(host.id);
  assert.equal(room.phase, 'lobby');
  assert.ok(all.every((p) => p.character === null && !p.eliminated && p.suggestion === null));
  assert.equal(room.readiness().ok, false);
  room.destroy();
});

// ---------------------------------------------------------------- bots
test('bots: só o host adiciona/remove, só no lobby, e respeita o limite da sala', () => {
  const { room, host, others } = lobby({ commons: 1 });
  throwsCode(() => room.addBot(others[0].id), 'NOT_HOST');
  const bot = room.addBot(host.id);
  assert.equal(bot.bot, true);
  assert.equal(room.players.length, 3);
  throwsCode(() => room.removeBot(others[0].id, bot.id), 'NOT_HOST');
  throwsCode(() => room.removeBot(host.id, others[0].id), 'INVALID'); // humano não é bot
  room.removeBot(host.id, bot.id);
  assert.equal(room.players.length, 2);
  while (room.players.length < 10) room.addBot(host.id);
  throwsCode(() => room.addBot(host.id), 'ROOM_FULL');
  assert.equal(new Set(room.players.map((p) => p.nickname)).size, 10); // nomes únicos
  room.players.filter((p) => p.bot).forEach((b) => room.removeBot(host.id, b.id));
  assert.deepEqual(room.players.map((p) => p.seat), [0, 1]); // assentos reordenados
  room.setCharacters(host.id, LIST);
  room.start(host.id);
  throwsCode(() => room.addBot(host.id), 'NOT_LOBBY');
  room.close('x');
});

test('bots: não exigem sugestão, mas ganham personagem da lista do host', () => {
  const { room, host } = lobby({ commons: 1 });
  room.addBot(host.id);
  room.addBot(host.id);
  const r = room.readiness();
  assert.equal(r.ok, true, r.missing.join(' ')); // 1 humano sugeriu; bots não precisam
  room.start(host.id);
  const chars = room.players.map((p) => p.character);
  assert.ok(chars.every(Boolean));
  assert.equal(new Set(chars).size, chars.length); // sem repetição
  room.close('x');
});

test('bots: só com bots, o host recebe um personagem da própria lista (precisa de um a mais)', () => {
  const room = new Room('BOTS', { timings: { turnMs: 500, botThinkMs: [5, 10] } });
  const host = room.createHost('s', 'Hosty');
  room.addBot(host.id);
  room.addBot(host.id);
  room.setCharacters(host.id, ['A1 Um', 'B2 Dois']);
  assert.equal(room.readiness().ok, false);
  assert.equal(room.readiness().needed, 3);
  room.setCharacters(host.id, ['A1 Um', 'B2 Dois', 'C3 Tres']);
  assert.equal(room.readiness().ok, true);
  room.start(host.id);
  assert.equal(new Set(room.players.map((p) => p.character)).size, 3);
  room.close('x');
});

test('bots: a visão marca quem é bot e nunca revela o personagem de um jogador a ele mesmo', () => {
  const { room, host, others } = lobby({ commons: 1 });
  room.addBot(host.id);
  const lobbyView = room.viewFor(host.id);
  const b = lobbyView.players.find((p) => p.bot);
  assert.equal(b.submitted, null);
  assert.equal(b.connected, true);
  room.start(host.id);
  const v = room.viewFor(others[0].id);
  assert.equal(v.players.find((p) => p.id === others[0].id).character, null);
  assert.ok(v.players.find((p) => p.bot).character); // humanos veem o do bot
  room.close('x');
});

test('bots: jogam sozinhos pelas mesmas regras e a partida termina', async () => {
  const room = new Room('BOTP', { timings: { turnMs: 2000, resultMs: 5, botThinkMs: [2, 6] } });
  const host = room.createHost('s', 'Hosty');
  for (let i = 0; i < 3; i++) room.addBot(host.id);
  room.setCharacters(host.id, ['Alfa Um', 'Beta Dois', 'Gama Tres', 'Delta Quatro']);
  room.setSettings(host.id, { lives: 2 });
  const events = [];
  room.onEvent = (e) => events.push(e);
  // o host humano fica passivo; os bots jogam nos turnos deles
  room.start(host.id);
  const t0 = Date.now();
  while (room.phase === 'playing' && Date.now() - t0 < 8000) {
    if (room.turn?.playerId === host.id && room.turn.step === 'action') room.pass(host.id, room.turn.id);
    await sleep(5);
  }
  assert.notEqual(room.phase, 'playing', 'a partida deveria ter terminado');
  assert.ok(events.some((e) => e.type === 'game-end'));
  room.players.forEach((p) => assert.ok(p.lives >= 0 && p.lives <= 2));
  room.close('x');
});

test('bots: ficam no lobby depois de "nova partida" e perdem o personagem', () => {
  const { room, host } = lobby({ commons: 1 });
  room.addBot(host.id);
  room.start(host.id);
  room.reset(host.id);
  assert.equal(room.phase, 'lobby');
  const bot = room.players.find((p) => p.bot);
  assert.ok(bot);
  assert.equal(bot.character, null);
  room.close('x');
});

test('bots: token vazio não reconecta ninguém (bots não têm sessão)', () => {
  const { room, host } = lobby({ commons: 1 });
  room.addBot(host.id);
  throwsCode(() => room.rejoin(null, 'sx'), 'SESSION_EXPIRED');
  throwsCode(() => room.rejoin(undefined, 'sx'), 'SESSION_EXPIRED');
  room.close('x');
});

test('gameNo: sobe a cada partida iniciada (o cliente zera a caderneta com ele)', () => {
  const { room, host } = lobby({ commons: 1 });
  assert.equal(room.viewFor(host.id).gameNo, 0);
  room.start(host.id);
  assert.equal(room.viewFor(host.id).gameNo, 1);
  room.reset(host.id);
  room.suggest(room.players[1].id, 'Alguem Novo');
  room.start(host.id);
  assert.equal(room.viewFor(host.id).gameNo, 2);
  room.close('x');
});

// ---------------------------------------------------------------- modo CADA UM ESCOLHE
function picksRoom(n = 4) {
  const room = new Room('PICK', { timings: { turnMs: 80, resultMs: 20 } });
  const host = room.createHost('s-host', 'Hosty');
  const others = Array.from({ length: n - 1 }, (_, i) => room.addPlayer(`s${i}`, `Jogador${i}`));
  room.setSettings(host.id, { mode: 'players' });
  const all = [host, ...others];
  all.forEach((p, i) => room.suggest(p.id, `Personagem Escolhido ${i}`));
  return { room, host, all };
}

test('modo padrão é HOST ESCOLHE e o modo pode ser definido no lobby', () => {
  const room = new Room('M', {});
  const host = room.createHost('h', 'Host');
  assert.equal(room.settings.mode, 'host');
  room.setSettings(host.id, { mode: 'players' });
  assert.equal(room.viewFor(host.id).settings.mode, 'players');
  throwsCode(() => room.setSettings(host.id, { mode: 'qualquer' }), 'INVALID');
  room.addPlayer('x', 'Ana');
  throwsCode(() => room.setSettings('id-que-nao-existe', { mode: 'host' }), 'NOT_HOST');
});

test('CADA UM ESCOLHE: ninguém recebe o próprio personagem e todas as escolhas são usadas uma vez (500 sorteios, 2 a 8 jogadores)', () => {
  for (let n = 2; n <= 8; n++) {
    for (let k = 0; k < 70; k++) {
      const { room, all } = picksRoom(n);
      const own = new Map(all.map((p) => [p.id, room.byId(p.id).suggestion]));
      room.start(all[0].id);
      const got = all.map((p) => room.byId(p.id).character);
      assert.equal(new Set(got).size, n, 'personagens repetidos');
      assert.deepEqual([...got].sort(), [...own.values()].sort(), 'nem toda escolha foi usada');
      all.forEach((p) => assert.notEqual(room.byId(p.id).character, own.get(p.id), `${p.nickname} recebeu o próprio personagem`));
    }
  }
});

test('CADA UM ESCOLHE: o host também escolhe; só começa com todos tendo escolhido', () => {
  const room = new Room('P', {});
  const host = room.createHost('h', 'Hosty');
  const a = room.addPlayer('a', 'Ana');
  room.setSettings(host.id, { mode: 'players' });
  room.suggest(a.id, 'Batman');
  let r = room.readiness();
  assert.equal(r.ok, false);
  assert.match(r.missing.join(' '), /Hosty/);
  room.suggest(host.id, 'Goku'); // no outro modo isso seria proibido
  assert.equal(room.readiness().ok, true);
  assert.equal(room.byId(a.id).suggestion, 'Batman');
});

test('CADA UM ESCOLHE: só 1 escolha por jogador (trocar substitui) e personagem repetido é recusado', () => {
  const { room, all } = picksRoom(3);
  room.suggest(all[1].id, 'Outro Nome');
  assert.equal(room.byId(all[1].id).suggestion, 'Outro Nome');
  assert.equal(all.filter((p) => room.byId(p.id).suggestion).length, 3);
  throwsCode(() => room.suggest(all[2].id, 'personagem escolhido 0'), 'DUPLICATE'); // ignora caixa/acentos
  room.suggest(all[2].id, 'Personagem Escolhido 2'); // reenviar a própria é aceito
  const v = room.viewFor(all[2].id);
  assert.equal(JSON.stringify(v).includes('Outro Nome'), false, 'a escolha de outro jogador vazou');
});

test('CADA UM ESCOLHE: a escolha só aparece para quem a fez e o próprio personagem nunca vai para o dono', () => {
  const { room, all } = picksRoom(4);
  const v0 = room.viewFor(all[0].id);
  assert.equal(v0.lobby.mySuggestion, 'Personagem Escolhido 0');
  assert.equal(v0.lobby.characters, null);
  assert.ok(v0.players.every((p) => p.submitted === true));
  room.start(all[0].id);
  all.forEach((me) => {
    const v = room.viewFor(me.id);
    assert.equal(v.players.find((p) => p.id === me.id).character, null);
    assert.ok(v.players.filter((p) => p.id !== me.id).every((p) => p.character));
  });
});

test('CADA UM ESCOLHE: sem bots e sem lista do host', () => {
  const { room, host, all } = picksRoom(3);
  throwsCode(() => room.addBot(host.id), 'NOT_ALLOWED');
  throwsCode(() => room.setCharacters(host.id, ['A', 'B', 'C']), 'NOT_ALLOWED');
  const r2 = new Room('B', {});
  const h2 = r2.createHost('h', 'Hosty');
  r2.addBot(h2.id);
  throwsCode(() => r2.setSettings(h2.id, { mode: 'players' }), 'NOT_ALLOWED');
  assert.equal(r2.settings.mode, 'host');
});

test('trocar de modo descarta as escolhas já enviadas; HOST ESCOLHE continua igual', () => {
  const { room, host, all } = picksRoom(3);
  room.setSettings(host.id, { mode: 'host' });
  assert.ok(all.every((p) => room.byId(p.id).suggestion === null));
  throwsCode(() => room.suggest(host.id, 'Batman'), 'NOT_ALLOWED'); // host volta a não sugerir
  room.setCharacters(host.id, LIST);
  room.suggest(all[1].id, 'Sugestao A');
  room.suggest(all[2].id, 'Sugestao B');
  room.start(host.id);
  assert.ok(all.every((p) => room.byId(p.id).character));
});

test('CADA UM ESCOLHE: nova partida limpa as escolhas e a próxima exige escolher de novo', () => {
  const { room, host, all } = picksRoom(3);
  room.start(host.id);
  room.reset(host.id);
  assert.equal(room.settings.mode, 'players');
  assert.equal(room.readiness().ok, false);
  all.forEach((p, i) => room.suggest(p.id, `Nova Escolha ${i}`));
  assert.equal(room.readiness().ok, true);
});

// ---------------------------------------------------------------- modo CADA UM ESCOLHE VÁRIOS
import { distribute, drawOnePerPlayer, keysOf } from '../game/draw.js';
import { nameKey } from '../game/fuzzy.js';

function multiRoom(lists) {
  const room = new Room('MULT', { timings: { turnMs: 80, resultMs: 20 } });
  const host = room.createHost('s-host', 'Hosty');
  const others = lists.slice(1).map((_, i) => room.addPlayer(`s${i}`, `Jogador${i}`));
  room.setSettings(host.id, { mode: 'multi' });
  const all = [host, ...others];
  all.forEach((p, i) => room.setPicks(p.id, lists[i]));
  return { room, host, all };
}

test('multi: exemplo do enunciado (3 jogadores, 3 escolhas cada) respeita a regra em 2000 sorteios', () => {
  const L = [['A', 'B', 'C'], ['D', 'E', 'F'], ['G', 'H', 'I']];
  for (let k = 0; k < 2000; k++) {
    const { room, all } = multiRoom(L);
    room.start(all[0].id);
    const got = all.map((p) => room.byId(p.id).character);
    assert.equal(new Set(got).size, 3, 'repetido');
    // exatamente 1 de cada lista foi sorteado: cada lista tem no máx. 1 dos personagens em jogo
    const inGame = new Set(got);
    L.forEach((l) => assert.equal(l.filter((c) => inGame.has(c)).length, 1, 'não foi exatamente 1 por lista'));
    all.forEach((p, i) => assert.ok(!L[i].includes(room.byId(p.id).character), 'recebeu da própria seleção'));
  }
});

test('multi: cada jogador pode escolher de 1 a 3 (4 é recusado, repetidos na própria lista contam uma vez, vazio desfaz)', () => {
  const room = new Room('X', {});
  const host = room.createHost('h', 'Hosty');
  const a = room.addPlayer('a', 'Ana');
  throwsCode(() => room.setPicks(a.id, ['A']), 'NOT_ALLOWED'); // modo host ainda
  room.setSettings(host.id, { mode: 'multi' });
  throwsCode(() => room.setPicks(a.id, ['A', 'B', 'C', 'D']), 'INVALID');
  room.setPicks(a.id, ['Goku', 'goku', ' GOKU ', 'Naruto']);
  assert.deepEqual(room.byId(a.id).picks, ['Goku', 'Naruto']);
  assert.equal(room.viewFor(a.id).lobby.myPicks.length, 2);
  assert.equal(room.viewFor(host.id).lobby.myPicks.length, 0);
  assert.equal(room.viewFor(host.id).players.find((p) => p.id === a.id).submitted, true);
  room.setPicks(a.id, []);
  assert.equal(room.viewFor(host.id).players.find((p) => p.id === a.id).submitted, false);
  throwsCode(() => room.suggest(a.id, 'Batman'), 'NOT_ALLOWED');
});

test('multi: 2 a 10 jogadores, listas de 1 a 3 nomes, nunca recebe o sorteado da própria seleção (1500 sorteios)', () => {
  for (let n = 2; n <= 10; n++) {
    for (let k = 0; k < 170; k++) {
      const lists = Array.from({ length: n }, (_, i) => Array.from({ length: 1 + ((i + k) % 3) }, (_, j) => `Pers ${i}-${j}`));
      const drawn = drawOnePerPlayer(lists);
      assert.ok(drawn);
      const names = drawn.map((ix, i) => lists[i][ix]);
      const assign = distribute(names.map(nameKey), lists.map(keysOf));
      assert.ok(assign);
      assert.equal(new Set(assign).size, n);
      assign.forEach((src, i) => assert.notEqual(src, i));
    }
  }
});

test('multi: nomes iguais em listas de jogadores diferentes nunca viram dois bonecos iguais nem entregam a resposta', () => {
  const L = [['Goku', 'Naruto'], ['goku', 'Luffy'], ['Naruto', 'Zoro']];
  for (let k = 0; k < 500; k++) {
    const { room, all } = multiRoom(L);
    room.start(all[0].id);
    const got = all.map((p) => room.byId(p.id).character);
    assert.equal(new Set(got.map(nameKey)).size, 3);
    all.forEach((p, i) => assert.ok(!L[i].map(nameKey).includes(nameKey(room.byId(p.id).character)), 'recebeu nome da própria lista'));
  }
});

test('multi: conflito impossível (todos só têm o mesmo nome) é avisado e impede o início', () => {
  const { room, host } = multiRoom([['Goku'], ['goku']]);
  const r = room.readiness();
  assert.equal(r.ok, false);
  assert.match(r.missing.join(' '), /repetidos/);
  throwsCode(() => room.start(host.id), 'NOT_READY');
});

test('multi: dois jogadores com listas de 1 nome trocam entre si', () => {
  const { room, all } = multiRoom([['Batman'], ['Goku']]);
  room.start(all[0].id);
  assert.equal(room.byId(all[0].id).character, 'Goku');
  assert.equal(room.byId(all[1].id).character, 'Batman');
});

test('multi: só começa com todos tendo escolhido, sem bots, sem lista do host; troca de modo limpa as escolhas', () => {
  const { room, host, all } = multiRoom([['A1'], ['B1'], ['C1']]);
  room.setPicks(all[2].id, []);
  assert.match(room.readiness().missing.join(' '), /Faltam escolhas/);
  throwsCode(() => room.addBot(host.id), 'NOT_ALLOWED');
  throwsCode(() => room.setCharacters(host.id, ['X', 'Y']), 'NOT_ALLOWED');
  room.setSettings(host.id, { mode: 'players' });
  assert.ok(all.every((p) => !(room.byId(p.id).picks?.length)));
  room.setSettings(host.id, { mode: 'multi' });
  room.setPicks(all[0].id, ['A1']);
  const r2 = new Room('B', {});
  const h2 = r2.createHost('h', 'Hosty');
  r2.addBot(h2.id);
  throwsCode(() => r2.setSettings(h2.id, { mode: 'multi' }), 'NOT_ALLOWED');
});

test('multi: a visão nunca mostra o próprio personagem nem as listas dos outros; nova partida limpa as escolhas', () => {
  const { room, host, all } = multiRoom([['Alfa Um', 'Alfa Dois'], ['Beta Um'], ['Gama Um', 'Gama Dois', 'Gama Tres']]);
  const v = JSON.stringify(room.viewFor(all[1].id));
  assert.equal(v.includes('Alfa'), false);
  assert.equal(v.includes('Gama'), false);
  room.start(host.id);
  all.forEach((me) => assert.equal(room.viewFor(me.id).players.find((p) => p.id === me.id).character, null));
  room.reset(host.id);
  assert.equal(room.settings.mode, 'multi');
  assert.equal(room.readiness().ok, false);
});

// ---------------------------------------------------------------- MODO EM TIMES
import { distributeTeams, splitTeams, teamsAvailable } from '../game/teams.js';

function teamsRoom(n, { lives = 3, picked = true } = {}) {
  const room = new Room('TEAM', { timings: { turnMs: 60_000, resultMs: 20 } });
  const host = room.createHost('s-host', 'Hosty');
  const others = Array.from({ length: n - 1 }, (_, i) => room.addPlayer(`s${i}`, `Jogador${i}`));
  room.setSettings(host.id, { mode: 'teams', lives });
  const all = [host, ...others];
  if (picked) all.forEach((p, i) => room.suggest(p.id, `Escolha Numero ${i}`));
  return { room, host, all };
}
const pickOf = (room, id) => room.byId(id).suggestion;
const teamOf = (room, id) => room.byId(id).team;

test('times: disponibilidade por quantidade de jogadores (1 e 3 desabilitados)', () => {
  const exp = { 1: false, 2: true, 3: false, 4: true, 5: true, 6: true, 7: true, 8: true, 9: true, 10: true };
  for (const [n, ok] of Object.entries(exp)) assert.equal(teamsAvailable(Number(n)), ok, `n=${n}`);
  // no lobby: não dá para trocar para o modo com 1 ou 3 jogadores; com 2 pode
  const r = new Room('A', {});
  const h = r.createHost('h', 'Hosty');
  throwsCode(() => r.setSettings(h.id, { mode: 'teams' }), 'NOT_ALLOWED');
  r.addPlayer('b', 'Beto');
  r.setSettings(h.id, { mode: 'teams' });
  assert.equal(r.settings.mode, 'teams');
  r.addPlayer('c', 'Carla'); // agora são 3: a partida não pode iniciar
  r.suggest(h.id, 'A1'); r.suggest(r.players[1].id, 'B1'); r.suggest(r.players[2].id, 'C1');
  assert.match(r.readiness().missing.join(' '), /2 ou de 4 a 10/);
  throwsCode(() => r.start(h.id), 'NOT_READY');
  // 1 jogador sozinho (modo escolhido na criação): não inicia
  const solo = new Room('S', {});
  const hs = solo.createHost('h', 'Hosty');
  solo.settings.mode = 'teams';
  solo.suggest(hs.id, 'Batman');
  throwsCode(() => solo.start(hs.id), 'NOT_READY');
});

test('times: divisão por quantidade (2..10) e sorteio de qual time fica com a vaga extra', () => {
  const exp = { 2: [1, 1], 4: [2, 2], 5: [2, 3], 6: [3, 3], 7: [3, 4], 8: [4, 4], 9: [4, 5], 10: [5, 5] };
  for (const [n, [a, b]] of Object.entries(exp)) {
    const sizes = new Set();
    for (let k = 0; k < 60; k++) {
      const ids = Array.from({ length: Number(n) }, (_, i) => `p${i}`);
      const t = splitTeams(ids);
      assert.deepEqual([...t[1], ...t[2]].sort(), [...ids].sort());
      assert.deepEqual([t[1].length, t[2].length].sort(), [a, b], `n=${n}`);
      sizes.add(t[1].length);
    }
    if (a !== b) assert.equal(sizes.size, 2, `n=${n}: o time 1 sempre ficou com o mesmo tamanho`);
  }
  assert.equal(splitTeams(['a']), null);
  assert.equal(splitTeams(['a', 'b', 'c']), null);
});

test('times: distribuição (pura) nunca entrega escolha do próprio time, sem duplicados (n=2,4..10)', () => {
  for (const n of [2, 4, 5, 6, 7, 8, 9, 10]) {
    for (let k = 0; k < 120; k++) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const teams = splitTeams(ids);
      const teamOfId = (id) => (teams[1].includes(id) ? 1 : 2);
      const { assigned, missing, discarded } = distributeTeams(teams, (id) => `C-${id}`);
      assert.equal(assigned.size + missing.length, n, 'todo jogador ou recebeu ou está pendente');
      assert.ok(missing.length <= 1);
      assert.equal(new Set(assigned.values()).size, assigned.size, 'duplicado');
      for (const [id, ch] of assigned) {
        const owner = ch.slice(2);
        assert.notEqual(teamOfId(owner), teamOfId(id), `${id} recebeu escolha do próprio time`);
      }
      // escolhas usadas + descartadas = todas
      assert.equal(assigned.size + discarded.length, n);
      if (n % 2 === 0) assert.equal(discarded.length, 0);
      else {
        assert.equal(discarded.length, 1);
        assert.equal(missing.length, 1);
        assert.equal(teamOfId(missing[0]), teams[1].length > teams[2].length ? 1 : 2, 'a vaga sobra no time maior');
      }
    }
  }
});

test('times: partida com times iguais começa direto, pelo Time 1, e todos têm 1 personagem do time adversário', () => {
  for (const n of [2, 4, 6, 8, 10]) {
    const { room, host, all } = teamsRoom(n);
    const own = new Map(all.map((p) => [p.id, pickOf(room, p.id)]));
    room.start(host.id);
    assert.equal(room.phase, 'playing');
    const chars = all.map((p) => room.byId(p.id).character);
    assert.equal(new Set(chars).size, n);
    assert.ok(chars.every(Boolean));
    const owner = (ch) => all.find((p) => own.get(p.id) === ch).id;
    all.forEach((p) => assert.notEqual(teamOf(room, owner(room.byId(p.id).character)), teamOf(room, p.id)));
    assert.equal(teamOf(room, room.turn.playerId), 1, 'deve começar pelo Time 1');
    assert.equal(room.teams[1].length, n / 2);
    assert.equal(room.teams[2].length, n / 2);
  }
});

test('times: 5 jogadores (2x3) abre a seleção adicional; só o time menor sugere; sorteia 1 e descarta as outras', () => {
  for (let k = 0; k < 40; k++) {
    const { room, host, all } = teamsRoom(5);
    const own = new Map(all.map((p) => [p.id, pickOf(room, p.id)]));
    room.start(host.id);
    const setup = room.teamSetup;
    if (!setup) {
      assert.fail('com 5 jogadores deveria haver vaga extra');
    }
    assert.equal(room.phase, 'lobby');
    const recv = room.byId(setup.receiverId);
    const big = recv.team, small = setup.smallTeam;
    assert.notEqual(big, small);
    assert.equal(room.teams[big].length, 3);
    assert.equal(room.teams[small].length, 2);
    // visão: nada de personagens; quem deve sugerir e quem falta
    const vSmall = room.viewFor(setup.suggesters[0]).lobby.setup;
    assert.equal(vSmall.receiver.id, recv.id);
    assert.equal(vSmall.receiver.slot >= 1 && vSmall.receiver.slot <= 3, true);
    assert.equal(room.viewFor(all[0].id).players.every((p) => p.character === null), true);
    // quem é do time maior não pode sugerir
    const bigMember = room.teams[big].find((id) => id !== recv.id);
    throwsCode(() => room.suggest(bigMember, 'Intruso'), 'NOT_ALLOWED');
    throwsCode(() => room.suggest(recv.id, 'Eu mesmo'), 'NOT_ALLOWED');
    // início/cancelamento repetidos não refazem o sorteio
    const snap = JSON.stringify(room.teams);
    throwsCode(() => room.start(host.id), 'ALREADY_STARTED');
    assert.equal(JSON.stringify(room.teams), snap);
    // sugestões do time menor
    const [s1, s2] = setup.suggesters;
    room.suggest(s1, 'Extra Alfa');
    assert.equal(room.phase, 'lobby', 'ainda falta um integrante sugerir');
    assert.equal(room.viewFor(s1).lobby.setup.mine, 'Extra Alfa');
    assert.equal(room.viewFor(s2).lobby.setup.mine, null);
    assert.equal(room.viewFor(s2).lobby.setup.submitted[s1], true);
    assert.equal(JSON.stringify(room.viewFor(s2)).includes('Extra Alfa'), false, 'sugestão alheia vazou');
    room.suggest(s2, 'Extra Beta');
    assert.equal(room.phase, 'playing');
    const extra = room.byId(recv.id).character;
    assert.ok(['Extra Alfa', 'Extra Beta'].includes(extra));
    const chars = all.map((p) => room.byId(p.id).character);
    assert.equal(new Set(chars).size, 5);
    // o receptor da vaga extra não recebe nada do próprio time
    chars.forEach((ch, i) => {
      if (ch.startsWith('Extra')) return;
      const owner = all.find((p) => own.get(p.id) === ch);
      assert.notEqual(owner.team, all[i].team);
    });
    assert.equal(room.teamSetup, null);
  }
});

test('times: as duas sugestões adicionais podem ser sorteadas (nenhuma é sempre a escolhida)', () => {
  const won = new Set();
  for (let k = 0; k < 80; k++) {
    const { room, host } = teamsRoom(5);
    room.start(host.id);
    const [s1, s2] = room.teamSetup.suggesters;
    room.suggest(s1, 'Extra Alfa');
    room.suggest(s2, 'Extra Beta');
    won.add(room.byId(room.teams[1].concat(room.teams[2]).find((id) => room.byId(id).character?.startsWith('Extra'))).character);
  }
  assert.equal(won.size, 2);
});

test('times: sugestão adicional repetida de personagem em jogo é descartada sem vazar; se todas repetem, pede de novo', () => {
  const { room, host, all } = teamsRoom(5);
  room.start(host.id);
  const [s1, s2] = room.teamSetup.suggesters;
  const inPlay = all.map((p) => room.byId(p.id).character).filter(Boolean)[0];
  room.suggest(s1, inPlay); // aceito na hora (não revela nada)
  room.suggest(s2, inPlay.toUpperCase());
  assert.equal(room.phase, 'lobby');
  assert.equal(room.viewFor(s1).lobby.setup.rejected, true);
  assert.equal(room.viewFor(s1).lobby.setup.submitted[s1], false);
  room.suggest(s1, 'Novo Nome Um');
  room.suggest(s2, inPlay);
  assert.equal(room.phase, 'playing');
  assert.equal(new Set(all.map((p) => room.byId(p.id).character)).size, 5);
  assert.ok(all.some((p) => room.byId(p.id).character === 'Novo Nome Um'));
});

test('times: 7 e 9 jogadores (3x4 e 4x5) fecham a distribuição com a seleção adicional', () => {
  for (const n of [7, 9]) {
    const { room, host, all } = teamsRoom(n);
    room.start(host.id);
    const s = room.teamSetup;
    assert.equal(s.suggesters.length, Math.floor(n / 2));
    s.suggesters.forEach((id, i) => room.suggest(id, `Extra ${i}`));
    assert.equal(room.phase, 'playing');
    assert.equal(new Set(all.map((p) => room.byId(p.id).character)).size, n);
  }
});

test('times: durante a seleção adicional ninguém entra, mudanças de configuração são bloqueadas; sair cancela; host cancela', () => {
  const { room, host, all } = teamsRoom(5);
  room.start(host.id);
  throwsCode(() => room.addPlayer('x', 'Novato'), 'ROOM_STARTED');
  throwsCode(() => room.setSettings(host.id, { lives: 5 }), 'NOT_ALLOWED');
  assert.equal(room.viewFor(host.id).lobby.ready.ok, false);
  room.cancelTeams(host.id);
  assert.equal(room.teamSetup, null);
  assert.ok(all.every((p) => room.byId(p.id).suggestion && room.byId(p.id).character === null && room.byId(p.id).team === null));
  assert.equal(room.readiness().ok, true);
  room.start(host.id);
  const leaver = room.players.find((p) => !p.isHost);
  room.leave(leaver.id);
  assert.equal(room.teamSetup, null, 'sair deve invalidar os times');
  assert.equal(room.players.length, 4);
  assert.equal(room.readiness().ok, true);
});

test('times: personagens vazios e duplicados são recusados; escolhas não mudam depois do início', () => {
  const { room, host, all } = teamsRoom(4, { picked: false });
  throwsCode(() => room.suggest(all[1].id, '   '), 'INVALID');
  room.suggest(all[1].id, 'Goku');
  throwsCode(() => room.suggest(all[2].id, 'goku'), 'DUPLICATE');
  room.suggest(all[0].id, 'A0'); room.suggest(all[2].id, 'C0'); room.suggest(all[3].id, 'D0');
  room.start(host.id);
  throwsCode(() => room.suggest(all[1].id, 'Outro'), 'NOT_LOBBY');
  throwsCode(() => room.start(host.id), 'ALREADY_STARTED');
});

test('times: sem bots e sem lista do host', () => {
  const { room, host } = teamsRoom(2);
  throwsCode(() => room.addBot(host.id), 'NOT_ALLOWED');
  throwsCode(() => room.setCharacters(host.id, ['A', 'B']), 'NOT_ALLOWED');
  const r2 = new Room('B', {});
  const h2 = r2.createHost('h', 'Hosty');
  r2.addBot(h2.id);
  r2.addBot(h2.id);
  throwsCode(() => r2.setSettings(h2.id, { mode: 'teams' }), 'NOT_ALLOWED');
});

/** Joga a partida: executa a ação do jogador da vez. */
function act(room, fn) {
  const t = room.turn;
  return fn(t.playerId, t.id);
}
const solve = (room) => act(room, (pid, tid) => room.guess(pid, room.byId(pid).character, tid));
const failGuess = (room) => act(room, (pid, tid) => room.guess(pid, 'Zzzz Nada Haver', tid));
const passIt = (room) => act(room, (pid, tid) => room.pass(pid, tid));

test('times: os turnos alternam entre os times (T1, T2, T1, T2) e passar a vez segue a sequência', () => {
  const { room, host } = teamsRoom(4);
  room.start(host.id);
  const seq = [];
  for (let i = 0; i < 8; i++) {
    seq.push(teamOf(room, room.turn.playerId));
    passIt(room);
  }
  assert.deepEqual(seq, [1, 2, 1, 2, 1, 2, 1, 2]);
  // cada integrante joga uma vez por rodada
  const ids = [];
  for (let i = 0; i < 4; i++) {
    ids.push(room.turn.playerId);
    passIt(room);
  }
  assert.equal(new Set(ids).size, 4);
});

test('times: acerto individual não encerra, jogador fica "done" e é pulado; ação dele é recusada', () => {
  const { room, host, all } = teamsRoom(4);
  room.start(host.id);
  const first = room.turn.playerId;
  const r = solve(room);
  assert.deepEqual(r, { correct: true, solved: true });
  assert.equal(room.phase, 'playing');
  assert.equal(room.byId(first).done, true);
  assert.equal(room.viewFor(first).players.find((p) => p.id === first).character, room.byId(first).character, 'quem acertou vê o próprio personagem');
  assert.equal(room.viewFor(all.find((p) => p.id !== first).id).teams.find((t) => t.id === 1).solved, 1);
  for (let i = 0; i < 12; i++) {
    assert.notEqual(room.turn.playerId, first, 'quem já acertou não pode ter turno');
    passIt(room);
  }
  throwsCode(() => room.guess(first, 'x', room.turn.id), 'NOT_YOUR_TURN');
  const t0 = room.turn.id;
  throwsCode(() => room.pass(first, t0), 'NOT_YOUR_TURN');
});

test('times: vitória do Time 1 e do Time 2, com times iguais', () => {
  for (const winner of [1, 2]) {
    const { room, host } = teamsRoom(4);
    room.start(host.id);
    let guard = 0;
    while (room.phase === 'playing' && guard++ < 40) {
      if (teamOf(room, room.turn.playerId) === winner) solve(room);
      else passIt(room);
    }
    assert.equal(room.phase, 'finished');
    assert.equal(room.result.winnerTeam, winner);
    const v = room.viewFor(host.id);
    assert.equal(v.teams.find((t) => t.id === winner).solved, 2);
    assert.ok(v.players.every((p) => p.character), 'no fim todos os personagens são revelados');
    assert.equal(v.players.filter((p) => p.team === winner).every((p) => p.done), true);
  }
});

test('times: vitória com times de tamanhos diferentes (o menor e o maior)', () => {
  for (const wantSmall of [true, false]) {
    const { room, host } = teamsRoom(5);
    room.start(host.id);
    const s = room.teamSetup;
    s.suggesters.forEach((id, i) => room.suggest(id, `Extra ${i}`));
    const winner = wantSmall ? s.smallTeam : 3 - s.smallTeam;
    let guard = 0;
    while (room.phase === 'playing' && guard++ < 80) {
      if (teamOf(room, room.turn.playerId) === winner) solve(room);
      else passIt(room);
    }
    assert.equal(room.phase, 'finished');
    assert.equal(room.result.winnerTeam, winner);
    assert.equal(room.teams[winner].every((id) => room.byId(id).done), true);
  }
});

test('times: com um time desfalcado, o resto continua alternando e todos os ativos têm turno', () => {
  const { room, host } = teamsRoom(5);
  room.start(host.id);
  const s = room.teamSetup;
  s.suggesters.forEach((id, i) => room.suggest(id, `Extra ${i}`));
  const small = s.smallTeam, big = 3 - small;
  let guard = 0;
  while (guard++ < 30 && teamOf(room, room.turn.playerId) !== big) passIt(room);
  const solver = room.turn.playerId;
  solve(room); // um do time grande acerta
  const seen = [];
  for (let i = 0; i < 8; i++) {
    seen.push(room.turn.playerId);
    passIt(room);
  }
  assert.equal(seen.includes(solver), false);
  assert.equal(new Set(seen).size, 4, 'os 4 jogadores ativos deveriam ter turno');
  // alternância preservada enquanto os dois times têm gente
  const teamsSeq = seen.map((id) => teamOf(room, id));
  for (let i = 1; i < 4; i++) assert.notEqual(teamsSeq[i], teamsSeq[i - 1], 'times devem alternar');
  // e o time pequeno ainda pode vencer
  guard = 0;
  while (room.phase === 'playing' && guard++ < 60) {
    if (teamOf(room, room.turn.playerId) === small) solve(room); else passIt(room);
  }
  assert.equal(room.result.winnerTeam, small);
});

test('times: ação fora do turno, turno velho e chute errado (vidas/eliminação) continuam valendo', () => {
  const { room, host, all } = teamsRoom(4, { lives: 2 });
  room.start(host.id);
  const cur = room.turn.playerId;
  const other = all.find((p) => p.id !== cur).id;
  throwsCode(() => room.guess(other, 'x', room.turn.id), 'NOT_YOUR_TURN');
  throwsCode(() => room.pass(other, room.turn.id), 'NOT_YOUR_TURN');
  throwsCode(() => room.pass(cur, room.turn.id + 99), 'STALE_TURN');
  const r = failGuess(room);
  assert.equal(r.correct, false);
  assert.equal(room.byId(cur).lives, 1);
  assert.equal(room.turn.step, 'result');
  throwsCode(() => room.pass(cur, room.turn.id), 'STALE_TURN');
});

test('times: o dono do turno com resultado "errado" depois passa para o time adversário', async () => {
  const { room, host } = teamsRoom(4, { lives: 3 });
  room.start(host.id);
  const t1 = teamOf(room, room.turn.playerId);
  failGuess(room);
  await new Promise((r) => setTimeout(r, 60)); // resultMs = 20
  assert.equal(room.turn.step, 'action');
  assert.notEqual(teamOf(room, room.turn.playerId), t1);
});

test('times: jogador eliminado (vidas) impede a vitória do time dele; sem time capaz de vencer a partida acaba empatada', async () => {
  const { room, host } = teamsRoom(4, { lives: 1 });
  room.start(host.id);
  // elimina um jogador de cada time
  const killed = new Set();
  let guard = 0;
  while (killed.size < 2 && guard++ < 20) {
    const t = teamOf(room, room.turn.playerId);
    if (!killed.has(t)) {
      failGuess(room);
      killed.add(t);
      await new Promise((r) => setTimeout(r, 60));
    } else passIt(room);
  }
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(room.phase, 'finished');
  assert.equal(room.result.winnerTeam, null);
  assert.equal(room.result.winnerId, null);
});

test('times: eliminação de um integrante: o outro time ainda pode vencer', async () => {
  const { room, host } = teamsRoom(4, { lives: 1 });
  room.start(host.id);
  const first = room.turn.playerId;
  const losing = teamOf(room, first);
  failGuess(room); // elimina o primeiro jogador (Time 1)
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(room.phase, 'playing');
  let guard = 0;
  const winner = 3 - losing;
  while (room.phase === 'playing' && guard++ < 40) {
    if (teamOf(room, room.turn.playerId) === winner) solve(room); else passIt(room);
  }
  assert.equal(room.result.winnerTeam, winner);
});

test('times: reconexão não refaz sorteio nem troca times/personagens; saída em jogo elimina o jogador', () => {
  const { room, host, all } = teamsRoom(4);
  room.start(host.id);
  const before = JSON.stringify([room.teams, all.map((p) => room.byId(p.id).character)]);
  const p = room.byId(all[1].id);
  room.disconnect(p.socketId);
  room.rejoin(p.token, 'novo-socket');
  assert.equal(JSON.stringify([room.teams, all.map((x) => room.byId(x.id).character)]), before);
  assert.equal(room.viewFor(p.id).players.find((x) => x.id === p.id).character, null, 'o próprio personagem segue oculto');
  const t = room.byId(all[2].id).team;
  room.leave(all[2].id);
  assert.equal(room.byId(all[2].id).eliminated, true);
  assert.equal(room.phase, 'playing');
  assert.notEqual(room.turn.playerId, all[2].id);
  assert.equal(typeof t, 'number');
});

test('times: nova partida limpa times, sorteio e acertos; o modo continua', () => {
  const { room, host, all } = teamsRoom(4);
  room.start(host.id);
  solve(room);
  room.reset(host.id);
  assert.equal(room.settings.mode, 'teams');
  assert.equal(room.teams, null);
  assert.ok(all.every((p) => room.byId(p.id).team === null && !room.byId(p.id).done));
  assert.equal(room.viewFor(host.id).teams, null);
  assert.equal(room.readiness().ok, false);
});

test('times: a visão da partida nunca revela o próprio personagem nem as escolhas originais', () => {
  const { room, host, all } = teamsRoom(6);
  const picks = all.map((p) => pickOf(room, p.id));
  room.start(host.id);
  all.forEach((me) => {
    const v = room.viewFor(me.id);
    assert.equal(v.players.find((p) => p.id === me.id).character, null);
    assert.equal(v.lobby, null);
    assert.equal(v.teams.length, 2);
  });
  assert.ok(picks.length === 6);
});

test('regressão: os outros modos seguem iguais (host/players/multi não têm times nem "done")', () => {
  const { room, host, all } = picksRoom(4);
  room.start(host.id);
  const v = room.viewFor(host.id);
  assert.equal(v.teams, null);
  assert.ok(v.players.every((p) => p.team === null && p.done === false));
  // acerto continua encerrando a partida nos outros modos
  const cur = room.turn.playerId;
  room.guess(cur, room.byId(cur).character, room.turn.id);
  assert.equal(room.phase, 'finished');
  assert.equal(room.result.winnerId, cur);
  assert.equal(room.result.winnerTeam, null);
});

// ---------------------------------------------------------------- regra de fim (modos padrão)
const solveE = (room, id = room.turn.playerId) => room.guess(id, room.byId(id).character, room.turn.id);
const missE = (room, id = room.turn.playerId) => room.guess(id, 'zzzz qqqq wwww', room.turn.id);
const endRoom = (commons, endRule, extra = {}) => {
  const l = lobby({ commons, timings: { turnMs: 5000, resultMs: 15 } });
  l.room.setSettings(l.host.id, { endRule, ...extra });
  l.room.start(l.host.id);
  return l;
};

test('fim: padrão é "first"; valor inválido e não-host são recusados; só no lobby', () => {
  const { room, host, others } = lobby();
  assert.equal(room.settings.endRule, 'first');
  throwsCode(() => room.setSettings(host.id, { endRule: 'qualquer' }), 'INVALID');
  throwsCode(() => room.setSettings(others[0].id, { endRule: 'last' }), 'NOT_HOST');
  room.setSettings(host.id, { endRule: 'last' });
  assert.equal(room.viewFor(others[0].id).settings.endRule, 'last');
  room.start(host.id);
  throwsCode(() => room.setSettings(host.id, { endRule: 'first' }), 'NOT_LOBBY');
  room.close('test');
});

test('fim "first": o primeiro acerto encerra (comportamento original)', () => {
  const { room } = endRoom(3, 'first');
  const cur = room.turn.playerId;
  solveE(room);
  assert.equal(room.phase, 'finished');
  assert.equal(room.result.winnerId, cur);
  assert.equal(room.result.endRule, undefined);
  room.close('test');
});

test('fim "last": acertos tiram o jogador das rodadas; acaba só quando resta 1 sem acertar', () => {
  const { room, all } = endRoom(3, 'last'); // 4 jogadores
  const solved = [];
  for (let i = 0; i < 2; i++) {
    const cur = room.turn.playerId;
    const r = solveE(room);
    assert.equal(r.solved, true);
    solved.push(cur);
    assert.equal(room.phase, 'playing', `após ${i + 1} acerto(s) ainda joga`);
    assert.equal(room.byId(cur).done, true);
    assert.notEqual(room.turn.playerId, cur);
    assert.ok(!solved.includes(room.turn.playerId), 'quem acertou nunca recebe o turno');
  }
  solved.push(room.turn.playerId);
  solveE(room); // 3º acerto: sobra 1
  assert.equal(room.phase, 'finished');
  const loser = all.find((p) => !solved.includes(p.id));
  assert.equal(room.result.loserId, loser.id);
  assert.equal(room.result.winnerId, null);
  assert.deepEqual(room.result.order, solved);
  room.close('test');
});

test('fim "last": quem acertou vê o próprio personagem; o último a descobrir só vê no fim', () => {
  const { room, all } = endRoom(3, 'last');
  const first = room.turn.playerId;
  solveE(room);
  const v = room.viewFor(first);
  assert.equal(v.players.find((p) => p.id === first).character, room.byId(first).character);
  const other = all.find((p) => p.id !== first);
  assert.equal(room.viewFor(other.id).players.find((p) => p.id === other.id).character, null);
  room.close('test');
});

test('fim "last": quem erra e é eliminado não encerra; o último ativo segue sozinho até acertar', async () => {
  const { room, all } = endRoom(2, 'last', { lives: 1 }); // 3 jogadores, 1 vida
  const a = room.turn.playerId;
  solveE(room); // A acertou
  const b = room.turn.playerId;
  missE(room); // B eliminado
  assert.equal(room.byId(b).eliminated, true);
  await sleep(50);
  assert.equal(room.phase, 'playing');
  const c = all.find((p) => p.id !== a && p.id !== b).id;
  assert.equal(room.turn.playerId, c);
  solveE(room, c); // C acerta: sobra só o B (não acertou)
  assert.equal(room.phase, 'finished');
  assert.equal(room.result.loserId, b);
  room.close('test');
});

test('fim "last": todos os que faltavam foram eliminados: acaba sem último definido', async () => {
  const { room } = endRoom(3, 'last', { lives: 1 }); // 4 jogadores
  solveE(room); // 1 acerta
  missE(room); // elimina
  await sleep(50);
  missE(room);
  await sleep(50);
  missE(room); // último ativo eliminado
  await sleep(50);
  assert.equal(room.phase, 'finished');
  assert.equal(room.result.loserId, null);
  assert.equal(room.result.order.length, 1);
  room.close('test');
});

test('fim "last": nova partida limpa acertos e ordem, e a regra escolhida permanece', () => {
  const { room, host } = endRoom(2, 'last');
  solveE(room);
  solveE(room);
  assert.equal(room.phase, 'finished');
  room.reset(host.id);
  assert.equal(room.settings.endRule, 'last');
  assert.ok(room.players.every((p) => !p.done));
  room.suggest(room.players[1].id, 'Outro Nome Um');
  room.suggest(room.players[2].id, 'Outro Nome Dois');
  room.start(host.id);
  assert.deepEqual(room.solvedOrder, []);
  assert.equal(room.phase, 'playing');
  room.close('test');
});

test('fim "last": também vale nos modos "cada um escolhe" e "vários"', () => {
  const rooms = [picksRoom(3), multiRoom([['Aaa Um', 'Aaa Dois'], ['Bbb Um'], ['Ccc Um', 'Ccc Dois']])];
  rooms.forEach(({ room, host }, i) => {
    room.setSettings(host.id, { endRule: 'last' });
    room.start(host.id);
    solveE(room);
    assert.equal(room.phase, 'playing', `modo ${i}`);
    solveE(room);
    assert.equal(room.phase, 'finished', `modo ${i}`);
    assert.ok(room.result.loserId, `modo ${i}`);
    room.close('test');
  });
});

// ---------------------------------------------------------------- visual do boneco
test('visual: padrão é boneco branco sem acessórios e todos veem o visual dos outros', () => {
  const { room, host, others } = lobby({ commons: 2 });
  const v = room.viewFor(others[0].id);
  assert.deepEqual(v.players.find((p) => p.id === host.id).look, { color: 'white', hat: 'none', neck: 'none', outfit: 'none', outfitColor: 'blue', face: 'none' });
  room.setLook(host.id, { color: 'red', hat: 'crown', neck: 'bowtie', outfit: 'suit', outfitColor: 'navy', face: 'glasses' });
  assert.deepEqual(room.viewFor(others[1].id).players.find((p) => p.id === host.id).look, { color: 'red', hat: 'crown', neck: 'bowtie', outfit: 'suit', outfitColor: 'navy', face: 'glasses' });
  assert.equal(room.viewFor(others[1].id).players.find((p) => p.id === others[0].id).look.color, 'white'); // não mexe nos outros
});

test('visual: campo omitido volta ao padrão; ids desconhecidos ou tipos errados são recusados', () => {
  const { room, host } = lobby();
  room.setLook(host.id, { color: 'blue', hat: 'cap' });
  room.setLook(host.id, { color: 'green' });
  assert.deepEqual(room.byId(host.id).look, { color: 'green', hat: 'none', neck: 'none', outfit: 'none', outfitColor: 'blue', face: 'none' });
  for (const bad of [{ outfit: 'armadura' }, { outfitColor: 'ouro' }, { face: 'x' }, { outfitColor: 'purple2' }, { color: '#ff0000' }, { hat: 'nave' }, { neck: 5 }, { color: ['red'] }, null, 'red', [], { color: '<script>' }]) {
    throwsCode(() => room.setLook(host.id, bad), 'INVALID');
  }
  assert.equal(room.byId(host.id).look.color, 'green'); // recusa não altera nada
});

test('visual: só no lobby; permanece depois de nova partida', () => {
  const { room, host } = lobby({ commons: 2 });
  room.setLook(host.id, { color: 'purple', hat: 'party' });
  room.start(host.id);
  throwsCode(() => room.setLook(host.id, { color: 'red' }), 'NOT_LOBBY');
  assert.equal(room.viewFor(host.id).players.find((p) => p.id === host.id).look.color, 'purple');
  room.reset(host.id);
  assert.deepEqual(room.byId(host.id).look, { color: 'purple', hat: 'party', neck: 'none', outfit: 'none', outfitColor: 'blue', face: 'none' });
  room.close('test');
});

// ---------------------------------------------------------------- chute por parte do nome
test('chute parcial: "Remy" vale para "Remy Ratatouille" quando não é ambíguo', () => {
  const others = ['Batman', 'Goku'];
  assert.ok(isGuessCorrect('Remy', 'Remy Ratatouille', { others }));
  assert.ok(isGuessCorrect('remy', 'Remy Ratatouille', { others }));
  assert.ok(isGuessCorrect('Ratatouille', 'Remy Ratatouille', { others }));
  assert.ok(isGuessCorrect('Remi', 'Remy Ratatouille', { others })); // continua tolerante a erro
  assert.ok(isGuessCorrect('Einstein', 'Albert Einstein', { others }));
  assert.ok(isGuessCorrect('Homem', 'Homem-Aranha', { others }));
});

test('chute parcial: ambíguo (serve para outro personagem em jogo) ou fraco não vale', () => {
  assert.ok(!isGuessCorrect('Homem', 'Homem-Aranha', { others: ['Homem de Ferro'] }));
  assert.ok(!isGuessCorrect('Remy', 'Remy Ratatouille', { others: ['Remy Martin'] }));
  assert.ok(!isGuessCorrect('Remy', 'Remy Ratatouille', { others: ['Remy'] }));
  assert.ok(!isGuessCorrect('de', 'Leonardo da Vinci', { others: [] })); // palavra de ligação
  assert.ok(!isGuessCorrect('da', 'Leonardo da Vinci', { others: [] }));
  assert.ok(!isGuessCorrect('Re', 'Remy Ratatouille', { others: [] })); // curto demais
  assert.ok(!isGuessCorrect('Remy Gusteau', 'Remy Ratatouille', { others: [] })); // mistura errada
  assert.ok(isGuessCorrect('Leonardo', 'Leonardo da Vinci', { others: [] }));
  assert.ok(isGuessCorrect('da Vinci', 'Leonardo da Vinci', { others: [] }));
});

test('chute parcial: sem a lista dos outros (padrão) continua exigindo o nome completo', () => {
  assert.ok(!isGuessCorrect('Remy', 'Remy Ratatouille'));
  assert.ok(!isGuessCorrect('einstein', 'Albert Einstein'));
});

test('chute parcial (sala): "Remy" acerta; ambiguidade com outro personagem da partida não', () => {
  const l = lobby({ commons: 2, characters: ['Remy Ratatouille', 'Batman', 'Goku'], timings: { turnMs: 5000, resultMs: 15 } });
  l.room.start(l.host.id);
  const cur = l.room.turn.playerId;
  const who = l.room.byId(cur);
  who.character = 'Remy Ratatouille';
  l.room.players.filter((p) => p.id !== cur).forEach((p, i) => (p.character = ['Batman', 'Goku'][i]));
  assert.equal(l.room.guess(cur, 'Remy', l.room.turn.id).correct, true);
  assert.equal(l.room.phase, 'finished');
  l.room.close('t');

  const m = lobby({ commons: 2, timings: { turnMs: 5000, resultMs: 15 } });
  m.room.start(m.host.id);
  const c2 = m.room.turn.playerId;
  m.room.byId(c2).character = 'Remy Ratatouille';
  const rest = m.room.players.filter((p) => p.id !== c2);
  rest[0].character = 'Remy Martin';
  rest[1].character = 'Goku';
  assert.equal(m.room.guess(c2, 'Remy', m.room.turn.id).correct, false); // ambíguo: erra e perde vida
  m.room.close('t');
});

test('visual: roupa, cor da roupa e rosto são validados e vistos pelos outros', () => {
  const { room, host, others } = lobby({ commons: 1 });
  room.setLook(host.id, { outfit: 'hoodie', outfitColor: 'black', face: 'mustache', hat: 'tophat' });
  const l = room.viewFor(others[0].id).players.find((p) => p.id === host.id).look;
  assert.deepEqual([l.outfit, l.outfitColor, l.face, l.hat], ['hoodie', 'black', 'mustache', 'tophat']);
  for (const o of ['none', 'tee', 'hoodie', 'suit', 'apron']) room.setLook(host.id, { outfit: o });
  throwsCode(() => room.setLook(host.id, { outfit: 'hoodie ' }), 'INVALID');
});

// ---------------------------------------------------------------- último com vida
test('só um jogador com vida: a partida acaba e ele vence (após a pausa do chute errado)', async () => {
  const { room, host, all } = lobby({ commons: 2, timings: { turnMs: 5000, resultMs: 20 } });
  room.start(host.id);
  const p = room.byId(room.turn.playerId);
  const others = all.filter((x) => x.id !== p.id);
  others[0].eliminated = true; // sobram p e others[1]
  p.lives = 1;
  room.guess(p.id, 'Errado Errado', room.turn.id); // p é eliminado: sobra só others[1]
  assert.equal(room.phase, 'playing', 'a pausa do chute errado ainda é exibida');
  await sleep(50);
  assert.equal(room.phase, 'finished');
  assert.equal(room.result.winnerId, others[1].id);
  assert.equal(room.result.lastStanding, true);
  room.destroy();
});

test('só um jogador com vida: também vale quando os outros saem da sala', () => {
  const { room, host, all } = lobby({ commons: 2, timings: { turnMs: 5000 } });
  room.start(host.id);
  const [a, b] = all.filter((x) => !x.isHost);
  room.leave(a.id);
  assert.equal(room.phase, 'playing');
  room.leave(b.id);
  assert.equal(room.phase, 'finished');
  assert.equal(room.result.winnerId, host.id);
  room.destroy();
});

test('só um jogador com vida: partida com 2+ jogadores no fim "último a descobrir" também termina', () => {
  const { room, host, all } = lobby({ commons: 2, timings: { turnMs: 5000 } });
  room.setSettings(host.id, { endRule: 'last' });
  room.start(host.id);
  all.filter((x) => !x.isHost).forEach((x) => room.leave(x.id));
  assert.equal(room.phase, 'finished');
  assert.equal(room.result.winnerId, host.id);
  assert.equal(room.result.lastStanding, true);
  room.destroy();
});

test('com 2 ou mais jogadores com vida a partida continua', () => {
  const { room, host, all } = lobby({ commons: 2, timings: { turnMs: 5000 } });
  room.start(host.id);
  const p = room.byId(room.turn.playerId);
  all.filter((x) => x.id !== p.id)[0].eliminated = true;
  room.pass(p.id, room.turn.id);
  assert.equal(room.phase, 'playing');
  room.destroy();
});
