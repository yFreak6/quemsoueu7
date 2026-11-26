import { useState } from 'react';
import { useCountdown, useGame } from '../game/GameContext.jsx';
import { MODES } from '../components/ModePicker.jsx';

/** A folha secreta é privada: só vem do servidor para o dono, e fica escondida até ele pedir para ver. */
function SheetCard({ sheet, onClose, closeLabel, footer }) {
  const [shown, setShown] = useState(false);
  const word = sheet.kind === 'word';
  return (
    <div className="animate-pop w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
      <p className="text-xs font-extrabold uppercase tracking-widest text-felt">Sua folha secreta</p>
      <p className="mt-1 text-sm font-semibold text-ink/60">Só você pode ver. Não mostre a ninguém.</p>
      <div className="relative mt-4 grid min-h-40 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-ink/20 bg-[#fbf7ea] p-4">
        {shown ? (
          <div className="grid gap-2">
            {word ? (
              <>
                <p className="text-4xl font-black tracking-wider text-red-600">IMPOSTOR</p>
                <p className="text-sm font-semibold text-ink/70">Você é o impostor. Descubra qual é o personagem dos outros sem se entregar.</p>
              </>
            ) : (
              <>
                <p className="text-xs font-bold uppercase tracking-widest text-ink/50">Seu personagem</p>
                <p className="text-3xl font-black leading-tight">{sheet.text}</p>
              </>
            )}
            {sheet.allies && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                Seus aliados (impostores): {sheet.allies.length ? sheet.allies.map((a) => a.nickname).join(', ') : 'nenhum'}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm font-bold text-ink/50">Folha escondida</p>
        )}
      </div>
      <button onClick={() => setShown((v) => !v)} className="mt-3 w-full rounded-xl border-2 border-felt/40 bg-white py-2.5 font-bold text-felt-dark hover:border-felt">
        {shown ? 'Esconder folha' : 'Ver minha folha'}
      </button>
      <button onClick={onClose} className="mt-2 w-full rounded-xl bg-felt py-3 font-bold text-white shadow hover:bg-felt-dark">
        {closeLabel}
      </button>
      {footer}
    </div>
  );
}

/** Momento de revelação: cada jogador lê a própria folha antes dos turnos. Espectador só recebe um aviso. */
export function RevealOverlay() {
  const { state, impReady, notify } = useGame();
  const imp = state.imp;
  const me = state.players.find((p) => p.id === state.you.id);
  const left = useCountdown(imp?.reveal?.deadline);
  const [dismissed, setDismissed] = useState(false);
  if (state.phase !== 'playing' || imp?.stage !== 'reveal') return null;
  const ready = imp.reveal.ready;
  const total = state.players.filter((p) => !p.spectator).length;
  const iAmReady = ready.includes(state.you.id);

  const confirm = async () => {
    if (state.you.spectator) return setDismissed(true);
    const res = await impReady();
    if (!res.ok && res.code !== 'NOT_ALLOWED') notify(res.error, 'error');
  };

  if (iAmReady || dismissed) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-16 z-30 grid place-items-center">
        <p className="animate-pop rounded-full bg-white/95 px-4 py-2 text-sm font-bold shadow-lg">
          Aguardando os outros jogadores… {ready.length}/{total} prontos · {left}s
        </p>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 grid place-items-center bg-ink/80 p-4">
      {state.you.spectator ? (
        <div className="animate-pop w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
          <p className="text-xs font-extrabold uppercase tracking-widest text-felt">{MODES[state.settings.mode].name}</p>
          <h2 className="mt-1 text-2xl font-black">Você é o espectador</h2>
          <p className="mt-2 text-sm text-ink/70">
            Você escolheu os personagens, então não recebe papel, não joga turnos e não vota. Acompanhe a partida e continue com os controles da sala.
          </p>
          <button onClick={confirm} className="mt-4 w-full rounded-xl bg-felt py-3 font-bold text-white shadow hover:bg-felt-dark">Ok</button>
        </div>
      ) : me && state.you.sheet ? (
        <SheetCard
          sheet={state.you.sheet}
          closeLabel="Entendi"
          onClose={confirm}
          footer={<p className="mt-3 text-xs font-semibold text-ink/50">Os turnos começam quando todos confirmarem ({ready.length}/{total}) ou em {left}s.</p>}
        />
      ) : null}
    </div>
  );
}

/** Botão discreto para rever a própria folha durante a partida. */
export function SheetButton() {
  const { state } = useGame();
  const [open, setOpen] = useState(false);
  if (!state.imp || state.phase !== 'playing' || !state.you.sheet) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-lg bg-white/85 px-3 py-1.5 text-xs font-bold shadow hover:bg-white">
        Minha folha
      </button>
      {open && (
        <div className="pointer-events-auto fixed inset-0 z-40 grid place-items-center bg-ink/80 p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <SheetCard sheet={state.you.sheet} closeLabel="Fechar" onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

/** Painel da votação e do resultado (a folha está no 3D; aqui ficam o cronômetro, a lista de votos e a confirmação). */
export function VotePanel({ vote }) {
  const { state, castVote, notify } = useGame();
  const imp = state.imp;
  const v = imp?.vote;
  const left = useCountdown(v?.deadline);
  const [busy, setBusy] = useState(false);
  if (state.phase !== 'playing' || !v || (imp.stage !== 'vote' && imp.stage !== 'result')) return null;
  const nick = (id) => state.players.find((p) => p.id === id)?.nickname ?? '?';
  const meId = state.you.id;

  if (imp.stage === 'result') {
    const r = v.result;
    const ranking = Object.entries(r.counts).sort((a, b) => b[1] - a[1]);
    return (
      <Panel>
        <p className="text-xs font-extrabold uppercase tracking-widest text-felt">Resultado da votação</p>
        <p className={`text-xl font-black ${r.eliminatedId ? 'text-red-600' : 'text-ink'}`}>
          {r.eliminatedId ? `${nick(r.eliminatedId)} foi eliminado!` : 'Empate! Ninguém foi eliminado.'}
        </p>
        {!r.eliminatedId && <p className="text-sm text-ink/70">Todos continuam na partida: vem mais uma rodada de turnos e depois uma nova votação.</p>}
        <ul className="mt-1 grid gap-1 text-left text-sm">
          {ranking.map(([id, n]) => (
            <li key={id} className="flex justify-between rounded-lg bg-ink/5 px-3 py-1">
              <span className="font-bold">{nick(id)}</span>
              <span>{n} voto{n === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
      </Panel>
    );
  }

  const canVote = vote.canVote;
  const candidates = v.eligible.filter((id) => id !== meId);
  const confirm = async () => {
    if (!vote.pickId || busy) return;
    setBusy(true);
    const res = await castVote(vote.pickId);
    setBusy(false);
    if (!res.ok && res.code !== 'STALE_VOTE') notify(res.error, 'error');
  };

  return (
    <Panel>
      <p className="flex items-center justify-between text-xs font-extrabold uppercase tracking-widest text-felt">
        <span>Votação — quem é o impostor?</span>
        <span className="tabular-nums text-ink/60">{left}s</span>
      </p>
      {canVote ? (
        <>
          <p className="text-xs text-ink/60">Toque em um jogador (aqui ou na folha sobre a mesa) e confirme. O voto não pode ser trocado.</p>
          <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto">
            {candidates.map((id) => (
              <button
                key={id}
                onClick={() => vote.onPick(id)}
                className={`rounded-lg border-2 px-2 py-1.5 text-sm font-bold transition ${vote.pickId === id ? 'border-felt bg-felt-light' : 'border-ink/10 bg-white hover:border-ink/30'}`}
              >
                {nick(id)}
              </button>
            ))}
          </div>
          <button disabled={!vote.pickId || busy} onClick={confirm} className="rounded-xl bg-red-600 py-2.5 font-bold text-white shadow hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40">
            {vote.pickId ? `Votar em ${nick(vote.pickId)}` : 'Escolha alguém para votar'}
          </button>
        </>
      ) : v.myVote ? (
        <p className="text-sm font-bold text-felt-dark">Voto registrado em {nick(v.myVote)}. Aguardando os outros…</p>
      ) : (
        <p className="text-sm font-semibold text-ink/70">{state.you.spectator ? 'Você é espectador: acompanhe a votação.' : 'Você está fora da partida: acompanhe a votação.'}</p>
      )}
      <p className="text-xs font-semibold text-ink/50">{v.voted.length}/{v.eligible.length} votaram</p>
    </Panel>
  );
}

function Panel({ children }) {
  return <div className="animate-pop grid gap-2 rounded-2xl bg-white/95 p-3 text-center shadow-xl ring-1 ring-ink/5">{children}</div>;
}
