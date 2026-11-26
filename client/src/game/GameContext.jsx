import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { socket } from '../socket.js';

const GameCtx = createContext(null);
export const useGame = () => useContext(GameCtx);

// sessionStorage: cada aba é uma sessão própria (dá para testar vários jogadores no mesmo navegador)
const SESSION_KEY = 'qse:session';
function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}
function writeSession(value) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* armazenamento indisponível: segue sem reconexão automática */
  }
}

const ERR_CONNECTION = {
  ok: false,
  code: 'CONNECTION',
  error: 'Erro de conexão: não foi possível falar com o servidor. Verifique sua internet e tente de novo.',
};

const CLOSED_REASON = {
  'host-left': 'O host encerrou a sala.',
  'host-timeout': 'O host ficou desconectado por muito tempo e a sala foi encerrada.',
  abandoned: 'A sala foi encerrada por inatividade.',
};

/** Segundos restantes até `deadline` (horário do servidor), atualizado 4x por segundo. */
export function useCountdown(deadline) {
  const { serverNow } = useGame();
  const calc = useCallback(() => (deadline ? Math.max(0, Math.ceil((deadline - serverNow()) / 1000)) : 0), [deadline, serverNow]);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    if (!deadline) return undefined;
    const id = setInterval(() => setLeft(calc()), 250);
    return () => clearInterval(id);
  }, [deadline, calc]);
  return left;
}

export function GameProvider({ children }) {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [booting, setBooting] = useState(() => !!readSession());
  const [toasts, setToasts] = useState([]);
  const [notice, setNotice] = useState(null); // aviso persistente na tela inicial: { tone, text }
  const [lastEvent, setLastEvent] = useState(null);
  const [reactions, setReactions] = useState({}); // playerId -> { id, at } (animação de erro de chute)
  const offset = useRef(0); // diferença entre o relógio do servidor e o local
  const stateRef = useRef(null);
  stateRef.current = state;

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  const notify = useCallback((text, tone = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const emit = useCallback(
    (event, payload) =>
      new Promise((resolve) => {
        if (!socket.connected) return resolve(ERR_CONNECTION);
        socket.timeout(8000).emit(event, payload ?? {}, (err, res) => resolve(err || !res ? ERR_CONNECTION : res));
      }),
    [],
  );

  useEffect(() => {
    const rejoin = async () => {
      const session = readSession();
      if (!session) return setBooting(false);
      const res = await emit('room:rejoin', session);
      if (!res.ok && res.code !== 'CONNECTION') {
        writeSession(null);
        setState(null);
        setNotice({ tone: 'warn', text: res.code === 'ROOM_CLOSED' || res.code === 'ROOM_NOT_FOUND' ? 'A sala em que você estava foi encerrada.' : res.error });
      }
      setBooting(false);
    };

    const onConnect = () => {
      setConnected(true);
      rejoin();
    };
    const onDisconnect = () => setConnected(false);
    const onState = (s) => {
      offset.current = s.serverTime - Date.now();
      setState(s);
    };
    const onEvent = (e) => {
      setLastEvent({ ...e, at: Date.now() });
      const nick = stateRef.current?.players.find((p) => p.id === e.playerId)?.nickname ?? 'Alguém';
      if (e.type === 'wrong-guess') {
        setReactions((r) => ({ ...r, [e.playerId]: { id: e.id, at: Date.now() } }));
        const tail = e.eliminated ? ' e foi eliminado!' : ` (${e.livesLeft} ${e.livesLeft === 1 ? 'vida restante' : 'vidas restantes'})`;
        notify(`${nick} chutou "${e.text}" e errou${tail}`, 'warn');
      }
      if (e.type === 'teams-formed') notify('Times sorteados!', 'info');
      if (e.type === 'extra-rejected') notify('Nenhuma sugestão adicional serviu (repetiam personagens em jogo). Sugiram outros.', 'warn');
      if (e.type === 'player-solved') notify(`${nick} acertou o personagem!`, 'info');
      if (e.type === 'game-start' && e.mode?.startsWith('judge_')) notify(e.playerId ? `${nick} é o Julgador desta partida!` : 'A IA será a Julgadora desta partida!', 'info');
      else if (e.type === 'game-start') notify(e.mode?.startsWith('imp_') ? `Folhas distribuídas! ${nick} abre a primeira rodada.` : `A partida começou! ${nick} abre a rodada.`, 'info');
      if (e.type === 'judg-annul') notify(e.reason === 'judge-timeout' ? 'O Julgador não decidiu a tempo: rodada anulada.' : e.reason === 'theme-timeout' ? 'O tema não foi enviado a tempo: rodada anulada.' : 'Ninguém respondeu: rodada anulada.', 'warn');
      if (e.type === 'judg-ai-error') notify('A IA não conseguiu responder. A partida foi encerrada.', 'error');
      if (e.type === 'vote-start') notify('Votação aberta: quem é o impostor?', 'info');
      if (e.type === 'vote-result') {
        const who = stateRef.current?.players.find((p) => p.id === e.eliminatedId)?.nickname;
        notify(e.eliminatedId ? `${who} foi eliminado pela votação.` : 'Empate na votação: ninguém foi eliminado. Nova rodada!', e.eliminatedId ? 'warn' : 'info');
      }
    };
    const onClosed = ({ reason } = {}) => {
      writeSession(null);
      setState(null);
      setReactions({});
      setNotice({ tone: 'warn', text: CLOSED_REASON[reason] ?? 'A sala foi encerrada.' });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state', onState);
    socket.on('game:event', onEvent);
    socket.on('room:closed', onClosed);
    if (socket.connected) rejoin();
    const bootTimeout = setTimeout(() => setBooting(false), 6000);

    return () => {
      clearTimeout(bootTimeout);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state', onState);
      socket.off('game:event', onEvent);
      socket.off('room:closed', onClosed);
    };
  }, [emit, notify]);

  const actions = useMemo(
    () => ({
      async create(nickname, mode = 'host') {
        const r = await emit('room:create', { nickname, mode });
        if (r.ok) writeSession({ code: r.code, token: r.token });
        return r;
      },
      async join(code, nickname) {
        const r = await emit('room:join', { code, nickname });
        if (r.ok) writeSession({ code: r.code, token: r.token });
        return r;
      },
      async leave() {
        await emit('room:leave');
        writeSession(null);
        setState(null);
        setReactions({});
      },
      setSettings: (patch) => emit('room:settings', patch),
      setCharacters: (list) => emit('room:characters', { list }),
      addBot: () => emit('room:addBot'),
      removeBot: (id) => emit('room:removeBot', { id }),
      suggest: (text) => emit('player:suggest', { text }),
      setPicks: (list) => emit('player:picks', { list }),
      setLook: (look) => emit('player:look', { look }),
      cancelTeams: () => emit('teams:cancel', {}),
      start: () => emit('game:start'),
      reset: () => emit('game:reset'),
      // O turnId impede que um clique atrasado ou duplicado atinja o turno seguinte
      guess: (text) => emit('turn:guess', { text, turnId: stateRef.current?.turn?.id }),
      pass: () => emit('turn:pass', { turnId: stateRef.current?.turn?.id }),
      // modos de impostor: "Entendi" na folha secreta e voto (o servidor valida tudo; o voteId evita voto em votação antiga)
      impReady: () => emit('imp:ready'),
      // modo JULGAMENTO: tema (Julgador humano), resposta de cada jogador e escolha do vencedor (o servidor valida quem pode)
      submitTheme: (text) => emit('judg:theme', { text }),
      submitAnswer: (text) => emit('judg:answer', { text }),
      chooseWinner: (label) => emit('judg:choose', { label }),
      castVote: (targetId) => emit('vote:cast', { targetId, voteId: stateRef.current?.imp?.vote?.id }),
    }),
    [emit],
  );

  const value = { state, connected, booting, toasts, notify, notice, setNotice, lastEvent, reactions, serverNow, ...actions };
  return <GameCtx.Provider value={value}>{children}</GameCtx.Provider>;
}
