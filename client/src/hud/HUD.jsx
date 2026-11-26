import { useEffect, useState } from 'react';
import SoundToggle from '../components/SoundToggle.jsx';
import { useCountdown, useGame } from '../game/GameContext.jsx';
import { TEAM, TeamTag } from '../game/teams.jsx';
import ActionPanel from './ActionPanel.jsx';
import Notebook from './Notebook.jsx';
import { SheetButton, VotePanel } from './ImpostorHud.jsx';
import JudgmentHud, { JudgmentBanner, JudgmentStrip } from './JudgmentHud.jsx';

export default function HUD({ vote = null }) {
  const { state, leave } = useGame();
  const me = state.players.find((p) => p.id === state.you.id);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-2 p-3 text-ink">
      <div className="flex items-start justify-between gap-3">
        <PlayerStrip />
        <div className="pointer-events-none flex flex-1 flex-col items-center gap-2">
          <TurnBanner />
          <TeamProgress />
          <JudgmentBanner />
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {me && !state.imp && !state.jg && <Lives lives={me.lives} max={state.settings.lives} />}
          <div className="flex gap-2">
            <SoundToggle />
            <SheetButton />
            {confirming ? (
              <span className="flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-xs font-bold shadow">
                {state.you.isHost ? 'Encerrar a sala?' : 'Sair?'}
                <button onClick={leave} className="rounded bg-red-600 px-2 py-1 text-white">Sim</button>
                <button onClick={() => setConfirming(false)} className="rounded bg-ink/10 px-2 py-1">Não</button>
              </span>
            ) : (
              <button onClick={() => setConfirming(true)} className="rounded-lg bg-white/85 px-3 py-1.5 text-xs font-bold shadow hover:bg-white">
                Sair
              </button>
            )}
          </div>
        </div>
      </div>

      {state.jg ? (
        <div className="flex flex-col items-center justify-end gap-2">
          <JudgmentHud />
        </div>
      ) : (
      <div className="flex flex-col items-stretch justify-end gap-2 md:flex-row md:items-end md:justify-between">
        <div className="pointer-events-auto order-2 md:order-1 md:w-80">
          <Notebook />
        </div>
        <div className="pointer-events-auto order-1 flex-1 md:order-2 md:max-w-md">
          <ActionPanel />
          {state.imp && <VotePanel vote={vote} />}
        </div>
        <div className="hidden md:block md:w-80" aria-hidden="true" />
      </div>
      )}
    </div>
  );
}

function Lives({ lives, max }) {
  const [shake, setShake] = useState(false);
  const [prev, setPrev] = useState(lives);
  useEffect(() => {
    if (lives < prev) {
      setShake(true);
      const id = setTimeout(() => setShake(false), 650);
      setPrev(lives);
      return () => clearTimeout(id);
    }
    setPrev(lives);
    return undefined;
  }, [lives]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex gap-1 rounded-xl bg-white/90 px-3 py-1.5 shadow" aria-label={`${lives} de ${max} vidas`} title="Suas vidas">
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" className={`h-6 w-6 ${shake && i === lives ? 'animate-heart-break' : ''}`} aria-hidden="true">
          <path
            d="M12 21s-7.5-4.6-9.6-9.1C.9 8.5 2.6 5 6 5c2.1 0 3.4 1.1 4.2 2.3L12 9.6l1.8-2.3C14.6 6.1 15.9 5 18 5c3.4 0 5.1 3.5 3.6 6.9C19.5 16.4 12 21 12 21z"
            fill={i < lives ? '#e5484d' : '#d4d9d6'}
            style={{ transition: 'fill .3s' }}
          />
        </svg>
      ))}
    </div>
  );
}

function PlayerStrip() {
  const { state } = useGame();
  if (state.jg) return <JudgmentStrip />;
  if (state.teams) return <TeamStrip />;
  return (
    <ul className="pointer-events-auto hidden max-h-[40vh] min-w-44 gap-1 overflow-y-auto rounded-2xl bg-white/90 p-2 shadow sm:grid" aria-label="Jogadores">
      {state.players.map((p) => {
        const isTurn = state.turn?.playerId === p.id;
        return (
          <li key={p.id} className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-sm transition ${isTurn ? 'bg-amber-100 font-bold' : ''} ${p.eliminated ? 'opacity-50' : ''}`}>
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-felt' : 'bg-amber-400'}`} title={p.connected ? 'online' : 'reconectando'} />
              <span className={p.eliminated ? 'line-through' : ''}>{p.nickname}</span>
              {p.id === state.you.id && <span className="text-[10px] text-ink/50">você</span>}
              {p.isHost && <span className="text-[10px] font-extrabold text-amber-700">HOST</span>}
              {p.bot && <span className="text-[10px] font-extrabold text-ink/50">BOT</span>}
            </span>
            <span className="text-xs text-red-500">{p.eliminated ? 'fora' : state.imp ? (p.spectator ? 'espectador' : '') : '♥'.repeat(p.lives)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Progresso de cada time ("1/2 acertaram"): visível em qualquer tamanho de tela. */
function TeamProgress() {
  const { state } = useGame();
  if (!state.teams) return null;
  const myTeam = state.players.find((p) => p.id === state.you.id)?.team;
  return (
    <div className="pointer-events-auto flex gap-2" aria-label="Progresso dos times">
      {state.teams.map((t) => (
        <span
          key={t.id}
          className="rounded-full px-3 py-1 text-xs font-black shadow"
          style={{ background: TEAM[t.id].soft, color: TEAM[t.id].ink, outline: myTeam === t.id ? `2px solid ${TEAM[t.id].color}` : 'none' }}
        >
          {t.name}{myTeam === t.id ? ' (seu time)' : ''}: {t.solved}/{t.size} acertaram
        </span>
      ))}
    </div>
  );
}

/** Lista de jogadores agrupada por time, com quem já acertou. */
function TeamStrip() {
  const { state } = useGame();
  return (
    <div className="pointer-events-auto hidden max-h-[44vh] min-w-52 gap-2 overflow-y-auto rounded-2xl bg-white/90 p-2 shadow sm:grid" aria-label="Times">
      {state.teams.map((t) => (
        <div key={t.id} className="rounded-xl p-1.5" style={{ background: TEAM[t.id].soft }}>
          <p className="flex justify-between px-1 text-xs font-black uppercase tracking-wide" style={{ color: TEAM[t.id].ink }}>
            <span>{t.name}</span>
            <span>{t.solved}/{t.size}</span>
          </p>
          <ul className="mt-1 grid gap-0.5">
            {t.members.map((id) => {
              const p = state.players.find((x) => x.id === id);
              if (!p) return null;
              const isTurn = state.turn?.playerId === p.id;
              return (
                <li key={p.id} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-0.5 text-sm ${isTurn ? 'bg-white font-bold ring-2 ring-amber-400' : ''} ${p.eliminated && !p.done ? 'opacity-50' : ''}`}>
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-felt' : 'bg-amber-400'}`} title={p.connected ? 'online' : 'reconectando'} />
                    <span className={p.eliminated && !p.done ? 'line-through' : ''}>{p.nickname}</span>
                    {p.id === state.you.id && <span className="text-[10px] text-ink/50">você</span>}
                  </span>
                  <span className="text-xs font-bold">
                    {p.done ? <span className="text-felt-dark">✓ acertou</span> : p.eliminated ? <span className="text-red-500">fora</span> : <span className="text-red-500">{'♥'.repeat(p.lives)}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TurnBanner() {
  const { state } = useGame();
  const { turn, players } = state;
  const left = useCountdown(turn?.deadline);
  const current = players.find((p) => p.id === turn?.playerId);
  if (!turn || !current) return <div />;

  const C = 2 * Math.PI * 22;
  const frac = turn.duration ? Math.min(1, (left * 1000) / turn.duration) : 0;
  const acting = turn.step === 'action';
  const urgent = left <= 5 && acting;
  const mine = current.id === state.you.id;

  return (
    <div className="pointer-events-none flex justify-center">
      <div className={`pointer-events-auto flex items-center gap-3 rounded-2xl bg-white/95 py-2 pl-4 pr-3 shadow-lg ${mine && acting ? 'animate-turn-pulse' : ''}`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink/50">Vez de{state.imp?.cycle ? ` · rodada ${state.imp.cycle}/${state.imp.turnRounds}` : ''}</p>
          <p className="text-lg font-black leading-tight">
            {current.nickname}
            {current.team && <span className="ml-2 align-middle"><TeamTag team={current.team} /></span>}
            {mine && <span className="ml-2 text-sm font-semibold text-felt">(você)</span>}
          </p>
        </div>
        {acting && (
          <div className="relative h-14 w-14" role="timer" aria-label={`${left} segundos restantes`}>
            <svg viewBox="0 0 52 52" className="h-14 w-14 -rotate-90">
              <circle cx="26" cy="26" r="22" fill="none" stroke="#e3e8e5" strokeWidth="5" />
              <circle
                cx="26"
                cy="26"
                r="22"
                fill="none"
                stroke={urgent ? '#e5484d' : '#2f9e63'}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${frac * C} ${C}`}
                style={{ transition: 'stroke-dasharray .25s linear' }}
              />
            </svg>
            <span className={`absolute inset-0 grid place-items-center text-lg font-black tabular-nums ${urgent ? 'text-red-600' : ''}`}>{left}</span>
          </div>
        )}
      </div>
    </div>
  );
}
