import { useMemo, useState } from 'react';
import { useGame } from '../game/GameContext.jsx';
import { TEAM } from '../game/teams.jsx';

const COLORS = ['#2f9e63', '#ffb020', '#e5484d', '#3b82f6', '#a855f7', '#fff176'];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 140 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2.5,
        duration: 3 + Math.random() * 3,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 8,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 animate-fall rounded-sm"
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 0.6, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }}
        />
      ))}
    </div>
  );
}

export default function EndScreen() {
  const { state, reset, leave, notify } = useGame();
  const [hidden, setHidden] = useState(false);
  const isHost = state.you.isHost;
  const winner = state.players.find((p) => p.id === state.result?.winnerId);
  const iWon = winner?.id === state.you.id;
  const teamMode = !!state.teams;
  const winTeam = state.result?.winnerTeam ?? null;
  const lastStanding = !!state.result?.lastStanding; // sobrou só 1 jogador com vida
  const lastRule = state.result?.endRule === 'last' && !lastStanding;
  const loser = lastRule ? state.players.find((p) => p.id === state.result.loserId) : null;
  const order = state.result?.order ?? [];
  const myTeam = state.players.find((p) => p.id === state.you.id)?.team ?? null;
  // modos de impostor
  const ir = state.result?.impostor ?? null;
  // modo JULGAMENTO
  const jr = state.result?.judgment ?? null;
  const jScores = jr ? [...jr.scores].sort((a, b) => b.score - a.score) : [];
  const nickOf = (id) => state.players.find((p) => p.id === id)?.nickname ?? '?';
  const myRole = state.players.find((p) => p.id === state.you.id)?.role ?? null;
  const innocentsWon = ir?.winner === 'innocents';
  const iWinImp = !!ir && !!myRole && (innocentsWon ? myRole === 'innocent' : myRole === 'impostor');

  if (hidden) {
    return (
      <div className="pointer-events-auto absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 gap-2">
        <button onClick={() => setHidden(false)} className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white shadow-lg">
          Ver resultado
        </button>
        {isHost && (
          <button
            onClick={async () => {
              const res = await reset();
              if (!res.ok) notify(res.error, 'error');
            }}
            className="rounded-xl bg-felt px-4 py-2 text-sm font-bold text-white shadow-lg"
          >
            Nova partida
          </button>
        )}
      </div>
    );
  }

  const title = jr
    ? winner
      ? iWon
        ? 'Você venceu o julgamento!'
        : `${winner.nickname} venceu o julgamento!`
      : jr.reason === 'ai-error'
        ? 'A IA não conseguiu responder'
        : 'Julgamento sem vencedor'
    : ir
    ? myRole
      ? iWinImp
        ? 'Você venceu!'
        : 'Você perdeu!'
      : innocentsWon
        ? 'Os inocentes venceram!'
        : 'Os impostores venceram!'
    : teamMode
    ? winTeam
      ? myTeam === winTeam
        ? `Seu time venceu! (${TEAM[winTeam].name})`
        : `${TEAM[winTeam].name} venceu!`
      : 'Empate: nenhum time conseguiu'
    : lastStanding && winner
    ? iWon
      ? 'Você venceu!'
      : `${winner.nickname} venceu!`
    : lastRule
      ? loser
        ? loser.id === state.you.id
          ? 'Você foi o último a descobrir!'
          : `${loser.nickname} foi o último a descobrir!`
        : 'Ninguém conseguiu terminar'
      : iWon
      ? 'Você venceu!'
      : winner
        ? `${winner.nickname} descobriu quem era!`
        : 'Ninguém descobriu';
  const JREASON = {
    complete: 'Maior pontuação depois de todas as rodadas.',
    'judge-left': 'O Julgador saiu da sala e a partida terminou.',
    'few-players': 'Restaram jogadores de menos para continuar.',
    inactive: 'Duas rodadas seguidas foram anuladas e a partida foi encerrada.',
    'ai-error': 'A IA não respondeu (confira a configuração dela no servidor). Este é o placar até aqui.',
  };
  const subtitle = jr
    ? winner
      ? `${jScores.find((x) => x.id === winner.id)?.score ?? 0} ponto(s). ${JREASON[jr.reason] ?? ''}`
      : JREASON[jr.reason] ?? 'Empate no placar.'
    : ir
    ? innocentsWon
      ? ir.mode === 'imp_multi'
        ? 'Todos os impostores foram eliminados.'
        : 'O impostor foi eliminado.'
      : ir.mode === 'imp_single'
        ? 'Um inocente foi eliminado: o impostor escapou.'
        : 'Os impostores igualaram (ou superaram) os inocentes.'
    : teamMode
    ? winTeam
      ? 'Todos os integrantes do time descobriram seus personagens.'
      : 'Cada time tinha um jogador eliminado, então ninguém podia completar. Veja quem era quem:'
    : lastStanding && winner
    ? 'Todos os outros jogadores foram eliminados: sobrou só um com vida.'
    : lastRule
      ? loser
        ? `Era ${loser.character}. Todos os outros acertaram.`
        : 'Os jogadores que faltavam foram eliminados. Veja quem era quem:'
      : winner
      ? `Era ${winner.character}.`
      : 'Todos os jogadores foram eliminados. Veja quem era quem:';

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-ink/75 p-4">
      {(winner || winTeam || ir || (lastRule && loser && loser.id !== state.you.id)) && <Confetti />}
      <div className="animate-pop relative w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
        <p className="text-sm font-bold uppercase tracking-widest text-felt">Fim da partida</p>
        <h2 className="mt-1 text-3xl font-black leading-tight">{title}</h2>
        <p className="mt-1 text-ink/70">{subtitle}</p>

        <h3 className="mb-2 mt-5 text-left text-xs font-bold uppercase tracking-wide text-ink/50">{jr ? 'Placar final' : 'Quem era quem'}</h3>
        {jr ? (
          <div className="grid gap-2 text-left">
            <ul className="grid max-h-48 gap-1 overflow-y-auto">
              {jScores.map((x, i) => (
                <li key={x.id} className={`flex justify-between gap-2 rounded-lg px-3 py-1.5 ${x.id === winner?.id ? 'bg-amber-100 font-bold' : 'bg-ink/5'}`}>
                  <span>{i + 1}º {nickOf(x.id)}{x.id === state.you.id ? ' (você)' : ''}{x.id === winner?.id ? ' 🏆' : ''}</span>
                  <span className="tabular-nums">{x.score} pt</span>
                </li>
              ))}
            </ul>
            {jr.history.length > 0 && (
              <ul className="grid max-h-32 gap-0.5 overflow-y-auto text-xs text-ink/60" aria-label="Rodadas">
                {jr.history.map((h) => (
                  <li key={h.round}>{h.tiebreak ? 'Desempate' : `Rodada ${h.round}`}: “{h.theme}” → <b>{nickOf(h.winnerId)}</b></li>
                ))}
              </ul>
            )}
            {jr.mode === 'judge_human' && <p className="text-xs text-ink/50">Julgador: {nickOf(jr.judgeId)}</p>}
          </div>
        ) : ir ? (
          <ul className="grid max-h-60 gap-1 overflow-y-auto text-left">
            {state.players.filter((p) => !p.spectator).map((p) => (
              <li key={p.id} className={`flex justify-between gap-2 rounded-lg px-3 py-1.5 ${p.role === 'impostor' ? 'bg-red-50 font-bold text-red-700' : 'bg-ink/5'}`}>
                <span>
                  {p.nickname}
                  {p.id === state.you.id ? ' (você)' : ''}
                  {p.eliminated ? ' ✗' : ''}
                </span>
                <span className="text-right font-semibold">{p.role === 'impostor' && p.character !== 'IMPOSTOR' ? `IMPOSTOR · ${p.character}` : p.character}</span>
              </li>
            ))}
          </ul>
        ) : teamMode ? (
          <div className="grid max-h-72 gap-2 overflow-y-auto text-left">
            {state.teams.map((t) => (
              <div key={t.id} className="rounded-xl border-2 p-2" style={{ borderColor: TEAM[t.id].color, background: TEAM[t.id].soft }}>
                <p className="flex justify-between px-1 text-sm font-black" style={{ color: TEAM[t.id].ink }}>
                  <span>{t.name}{winTeam === t.id ? ' 🏆 VENCEDOR' : ''}</span>
                  <span>{t.solved}/{t.size} acertaram</span>
                </p>
                <ul className="mt-1 grid gap-1">
                  {t.members.map((id) => {
                    const p = state.players.find((x) => x.id === id);
                    if (!p) return null;
                    return (
                      <li key={p.id} className="flex justify-between gap-2 rounded-lg bg-white/80 px-3 py-1.5">
                        <span className="font-bold">{p.nickname}{p.id === state.you.id ? ' (você)' : ''}</span>
                        <span className="text-right font-semibold">
                          {p.character} <span className={p.done ? 'text-felt-dark' : 'text-red-500'}>{p.done ? '✓ acertou' : p.eliminated ? '✗ eliminado' : '— não acertou'}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : (
        <ul className="grid max-h-60 gap-1 overflow-y-auto text-left">
          {(lastRule ? [...state.players].sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99)) : state.players).map((p) => (
            <li key={p.id} className={`flex justify-between rounded-lg px-3 py-1.5 ${p.id === winner?.id ? 'bg-felt-light font-bold' : lastRule && p.id === loser?.id ? 'bg-amber-100 font-bold' : 'bg-ink/5'}`}>
              <span>
                {lastRule && order.includes(p.id) ? `${order.indexOf(p.id) + 1}º ` : ''}
                {p.nickname}
              </span>
              <span className="font-semibold">
                {p.character}
                {lastRule && (order.includes(p.id) ? <span className="text-felt-dark"> ✓</span> : <span className="text-red-500">{p.id === loser?.id ? ' · último' : p.eliminated ? ' ✗' : ''}</span>)}
              </span>
            </li>
          ))}
        </ul>
        )}

        <div className="mt-5 grid gap-2">
          {isHost ? (
            <button
              onClick={async () => {
                const res = await reset();
                if (!res.ok) notify(res.error, 'error');
              }}
              className="rounded-xl bg-felt py-3 font-bold text-white hover:bg-felt-dark"
            >
              Nova partida
            </button>
          ) : (
            <p className="text-sm text-ink/60">Aguardando o host começar outra partida…</p>
          )}
          <div className="flex justify-center gap-4 text-sm font-semibold">
            <button onClick={() => setHidden(true)} className="text-ink/70 underline">
              Ver a mesa
            </button>
            <button onClick={leave} className="text-red-600 underline">
              Sair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
