import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/GameContext.jsx';

/**
 * Só duas ações por turno: Chutar (nome completo) ou Passar a Vez.
 * Um trinco local (busy) impede duplo clique; o servidor ainda confere o turnId.
 */
export default function ActionPanel() {
  const { state, guess, pass, notify } = useGame();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const inputRef = useRef(null);

  const { turn, players, you } = state;
  const me = players.find((p) => p.id === you.id);
  const current = players.find((p) => p.id === turn?.playerId);
  const myTurn = turn?.playerId === you.id && turn.step === 'action' && !me?.eliminated;

  // limpa o campo e foca quando a vez chega
  useEffect(() => {
    setText('');
    if (myTurn) inputRef.current?.focus({ preventScroll: true });
  }, [turn?.id, myTurn]);

  const run = async (fn) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const res = await fn();
    lock.current = false;
    setBusy(false);
    if (!res.ok && res.code !== 'STALE_TURN' && res.code !== 'NOT_YOUR_TURN') notify(res.error, 'error');
    return res;
  };

  const onGuess = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    run(() => guess(text));
  };

  if (state.phase !== 'playing' || !turn) return null;

  if (me?.done) {
    const mine = state.teams?.find((t) => t.id === me.team);
    return (
      <Box>
        <p className="font-bold text-felt-dark">✓ Você acertou! Era {me.character}.</p>
        <p className="text-sm text-ink/70">
          Você não joga mais as rodadas. {mine ? `Seu time: ${mine.solved}/${mine.size} acertaram. Torça pelos seus companheiros!` : 'A partida acaba quando só restar 1 jogador sem acertar.'}
        </p>
      </Box>
    );
  }

  if (me?.eliminated && state.imp) {
    return (
      <Box>
        <p className="font-bold text-red-600">Você foi eliminado.</p>
        <p className="text-sm text-ink/70">Continue acompanhando a partida.</p>
      </Box>
    );
  }

  if (me?.eliminated) {
    return (
      <Box>
        <p className="font-bold text-red-600">Você foi eliminado.</p>
        <p className="text-sm text-ink/70">
          Seu personagem era <b>{me.character}</b>. Continue assistindo a partida.
        </p>
      </Box>
    );
  }

  if (turn.step === 'result' && turn.playerId === you.id) {
    return (
      <Box>
        <p className="font-bold text-red-600">Chute errado! Você perdeu uma vida.</p>
        <p className="text-sm text-ink/70">A vez passa para o próximo jogador…</p>
      </Box>
    );
  }

  // modos de impostor: não há chute. Só "Passar a Vez" (ou esperar o tempo acabar)
  if (state.imp && myTurn) {
    return (
      <div className="grid gap-2 rounded-2xl bg-white/95 p-3 shadow-xl ring-1 ring-ink/5 animate-pop" aria-label="Sua jogada">
        <p className="text-xs font-extrabold uppercase tracking-widest text-felt">Sua vez!</p>
        <p className="text-sm text-ink/70">Observe os outros. Você pode passar a vez agora ou esperar o tempo acabar.</p>
        <button disabled={busy} onClick={() => run(pass)} className="rounded-xl bg-ink py-2.5 font-bold text-white shadow hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">
          Passar a Vez
        </button>
      </div>
    );
  }

  if (!myTurn) {
    return (
      <Box>
        <p className="text-sm font-semibold text-ink/70">
          {turn.step === 'result' ? 'Chute errado. Passando a vez…' : <>Aguardando <b>{current?.nickname}</b> jogar…</>}
        </p>
      </Box>
    );
  }

  return (
    <form onSubmit={onGuess} className="grid gap-2 rounded-2xl bg-white/95 p-3 shadow-xl ring-1 ring-ink/5 animate-pop" aria-label="Sua jogada">
      <label htmlFor="guess" className="text-xs font-extrabold uppercase tracking-widest text-felt">
        Sua vez! Quem você acha que é?
      </label>
      <input
        id="guess"
        ref={inputRef}
        value={text}
        maxLength={80}
        onChange={(e) => setText(e.target.value)}
        placeholder="Digite o nome do personagem"
        autoComplete="off"
        className="w-full rounded-xl border-2 border-ink/10 bg-white px-3 py-2.5 text-base outline-none focus:border-felt focus:ring-4 focus:ring-felt/15"
      />
      <div className="grid grid-cols-2 gap-2">
        <button disabled={busy || !text.trim()} className="rounded-xl bg-felt py-2.5 font-bold text-white shadow hover:bg-felt-dark disabled:cursor-not-allowed disabled:opacity-40">
          Chutar
        </button>
        <button type="button" disabled={busy} onClick={() => run(pass)} className="rounded-xl bg-ink py-2.5 font-bold text-white shadow hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">
          Passar a Vez
        </button>
      </div>
      <p className="text-[11px] text-ink/50">Chute errado custa uma vida. Passar não custa nada e termina seu turno na hora.</p>
    </form>
  );
}

function Box({ children }) {
  return <div className="animate-pop rounded-2xl bg-white/90 px-4 py-3 text-center shadow-lg ring-1 ring-ink/5">{children}</div>;
}
