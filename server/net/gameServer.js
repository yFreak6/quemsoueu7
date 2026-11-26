// Camada de rede: liga os eventos do Socket.io às salas. Só depende de uma interface
// mínima de `io` (on, to(id).emit, sockets.sockets), então dá para testar sem rede.

import { GameError, Room } from '../game/Room.js';
import { isImpostorMode } from '../game/impostor.js';
import { isJudgmentMode } from '../game/judgment.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O, para não confundir com 1 e 0

export function createGameServer(io, { timings, judgeAI, log } = {}) {
  const rooms = new Map();
  const closed = new Map(); // código -> { reason, at }: distingue "sala encerrada" de "código inexistente"

  const makeCode = () => {
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      if (!rooms.has(code) && !closed.has(code)) return code;
    }
  };

  const broadcast = (room) => {
    for (const p of room.players) {
      if (p.socketId && p.connected) io.to(p.socketId).emit('state', room.viewFor(p.id));
    }
  };

  const onClose = (room, reason, { except } = {}) => {
    for (const p of room.players) {
      if (p.socketId && p.socketId !== except) io.to(p.socketId).emit('room:closed', { reason });
    }
    rooms.delete(room.code);
    closed.set(room.code, { reason, at: Date.now() });
  };

  const newRoom = () => {
    const room = new Room(makeCode(), {
      timings,
      judgeAI,
      log,
      onChange: broadcast,
      onEvent: (evt) => {
        for (const p of room.players) if (p.socketId && p.connected) io.to(p.socketId).emit('game:event', evt);
      },
      onClose,
    });
    rooms.set(room.code, room);
    return room;
  };

  const findRoom = (code) => {
    const key = String(code ?? '').trim().toUpperCase();
    const room = rooms.get(key);
    if (room) return room;
    if (closed.has(key)) throw new GameError('Esta sala foi encerrada.', 'ROOM_CLOSED');
    throw new GameError('Código inexistente. Confira as letras e tente de novo.', 'ROOM_NOT_FOUND');
  };

  io.on('connection', (socket) => {
    const bind = (room, who) => {
      socket.data.roomCode = room.code;
      socket.data.pid = who.id;
    };
    const unbind = () => {
      socket.data.roomCode = null;
      socket.data.pid = null;
    };
    const assertFree = () => {
      if (socket.data.roomCode && rooms.has(socket.data.roomCode)) throw new GameError('Você já está em uma sala.', 'ALREADY_IN_ROOM');
    };
    const ctx = () => {
      const room = rooms.get(socket.data.roomCode);
      if (!room) throw new GameError('Sala não encontrada.', 'ROOM_CLOSED');
      return { room, pid: socket.data.pid };
    };

    // Todo handler responde por ack: { ok:true, ... } ou { ok:false, code, error }
    const handle = (event, fn) =>
      socket.on(event, (payload, cb) => {
        if (typeof payload === 'function') [cb, payload] = [payload, {}];
        const reply = typeof cb === 'function' ? cb : () => {};
        try {
          const data = payload && typeof payload === 'object' ? payload : {};
          reply({ ok: true, ...(fn(data) ?? {}) });
        } catch (err) {
          if (err instanceof GameError) return reply({ ok: false, code: err.code, error: err.message });
          console.error(`[${event}]`, err);
          reply({ ok: false, code: 'INTERNAL', error: 'Erro interno do servidor.' });
        }
      });

    handle('room:create', ({ nickname, mode }) => {
      assertFree();
      const nick = Room.cleanNickname(nickname); // valida antes de criar, para não deixar sala órfã
      if (mode !== undefined && mode !== 'host' && mode !== 'players' && mode !== 'multi' && mode !== 'teams' && !isImpostorMode(mode) && !isJudgmentMode(mode)) throw new GameError('Modo de partida inválido.', 'INVALID');
      const room = newRoom();
      if (mode) room.settings.mode = mode;
      const host = room.createHost(socket.id, nick);
      bind(room, host);
      room.changed();
      return { code: room.code, token: host.token };
    });

    handle('room:join', ({ code, nickname }) => {
      assertFree();
      const room = findRoom(code);
      const player = room.addPlayer(socket.id, nickname);
      bind(room, player);
      room.changed();
      return { code: room.code, token: player.token };
    });

    handle('room:rejoin', ({ code, token }) => {
      const room = findRoom(code);
      const who = room.rejoin(token, socket.id);
      bind(room, who);
      return { code: room.code };
    });

    handle('room:leave', () => {
      const room = rooms.get(socket.data.roomCode);
      const pid = socket.data.pid;
      unbind();
      room?.leave(pid);
    });

    handle('room:settings', (p) => {
      const { room, pid } = ctx();
      room.setSettings(pid, p);
    });
    handle('room:characters', ({ list }) => {
      const { room, pid } = ctx();
      room.setCharacters(pid, list);
    });
    handle('room:addBot', () => {
      const { room, pid } = ctx();
      room.addBot(pid);
    });
    handle('room:removeBot', ({ id }) => {
      const { room, pid } = ctx();
      room.removeBot(pid, id);
    });
    handle('player:suggest', ({ text }) => {
      const { room, pid } = ctx();
      room.suggest(pid, text);
    });
    handle('player:look', ({ look }) => {
      const { room, pid } = ctx();
      room.setLook(pid, look);
    });
    handle('player:picks', ({ list }) => {
      const { room, pid } = ctx();
      room.setPicks(pid, list);
    });
    handle('teams:cancel', () => {
      const { room, pid } = ctx();
      room.cancelTeams(pid);
    });
    handle('game:start', () => {
      const { room, pid } = ctx();
      room.start(pid);
    });
    handle('game:reset', () => {
      const { room, pid } = ctx();
      room.reset(pid);
    });
    handle('turn:guess', ({ text, turnId }) => {
      const { room, pid } = ctx();
      return room.guess(pid, text, turnId);
    });
    handle('imp:ready', () => {
      const { room, pid } = ctx();
      room.impReady(pid);
    });
    handle('vote:cast', ({ targetId, voteId }) => {
      const { room, pid } = ctx();
      room.castVote(pid, targetId, voteId);
    });
    handle('judg:theme', ({ text }) => {
      const { room, pid } = ctx();
      room.submitTheme(pid, text);
    });
    handle('judg:answer', ({ text }) => {
      const { room, pid } = ctx();
      room.submitAnswer(pid, text);
    });
    handle('judg:choose', ({ label }) => {
      const { room, pid } = ctx();
      room.chooseWinner(pid, label);
    });
    handle('turn:pass', ({ turnId }) => {
      const { room, pid } = ctx();
      room.pass(pid, turnId);
    });

    socket.on('disconnect', () => {
      rooms.get(socket.data.roomCode)?.disconnect(socket.id);
    });
  });

  /** Fecha salas abandonadas e esquece salas encerradas há muito tempo. */
  const sweep = (now = Date.now()) => {
    for (const room of [...rooms.values()]) if (room.isAbandoned()) room.close('abandoned');
    for (const [code, v] of closed) if (now - v.at > 30 * 60_000) closed.delete(code);
  };

  return { rooms, closed, sweep };
}
