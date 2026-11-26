import { useEffect, useRef, useState } from 'react';
import { useCountdown, useGame } from '../game/GameContext.jsx';

/**
 * Interface do modo JULGAMENTO. Cada etapa tem a sua tela (key={stage} reinicia a animação de entrada).
 * Nada aqui decide regra: o servidor valida quem responde, quando e o que cada um pode ver.
 */

const panel = 'pointer-events-auto qse-fade w-full rounded-3xl bg-white/95 p-5 shadow-2xl ring-1 ring-ink/5';
const REASON = {
  'theme-timeout': 'O tema não foi enviado a tempo.',
  'no-answers': 'Ninguém respondeu a tempo.',
  'judge-timeout': 'O Julgador não escolheu a tempo.',
};

const nickOf = (state, id) => state.players.find((p) => p.id === id)?.nickname ?? '?';

export function Timer({ deadline, duration }) {
  const left = useCountdown(deadline);
  if (!deadline) return null;
  const urgent = left <= 5;
  const frac = duration ? Math.min(1, (left * 1000) / duration) : 0;
  return (
    <span role="timer" aria-label={`${left} segundos restantes`} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-black tabular-nums ${urgent ? 'bg-red-100 text-red-700' : 'bg-ink/5 text-ink/70'}`}>
      <span className="relative h-2 w-16 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
        <span className={`absolute inset-y-0 left-0 rounded-full ${urgent ? 'bg-red-500' : 'bg-felt'}`} style={{ width: `${frac * 100}%`, transition: 'width .25s linear' }} />
      </span>
      {left}s
    </span>
  );
}

/** Faixa do topo: rodada, Julgador(a), rodadas que faltam e placar atual. */
export function JudgmentBanner() {
  const { state } = useGame();
  const jg = state.jg;
  if (!jg) return null;
  const isAi = jg.mode === 'judge_ai';
  const current = Math.min(jg.total, jg.stage === 'reveal' ? jg.played : jg.played + 1); // rodada em andamento (ou a que acabou de ser julgada)
  const scores = state.players.filter((p) => p.id !== jg.judgeId).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return (
    <div className="pointer-events-auto flex max-w-full flex-col items-center gap-1 rounded-2xl bg-white/95 px-4 py-2 shadow-lg" aria-label="Estado do julgamento">
      <p className="text-center text-xs font-extrabold uppercase tracking-widest text-ink/50">
        {jg.tiebreak ? 'Rodada de desempate' : `Rodada ${current} de ${jg.total} · ${jg.total - current === 0 ? 'última' : `faltam ${jg.total - current}`}`}
      </p>
      <p className="text-sm font-bold">
        {isAi ? '🤖 Julgadora: IA' : <>👑 Julgador: {nickOf(state, jg.judgeId)}{jg.judgeId === state.you.id && <span className="ml-1 text-felt">(você)</span>}</>}
      </p>
      <p className="flex flex-wrap justify-center gap-x-3 text-xs font-semibold text-ink/70" aria-label="Placar">
        {scores.map((p) => (
          <span key={p.id} className={p.id === state.you.id ? 'font-black text-ink' : ''}>
            {p.nickname}: <b className="tabular-nums">{p.score ?? 0}</b>
          </span>
        ))}
      </p>
    </div>
  );
}

/** Lista lateral de jogadores com o placar (e quem já respondeu durante o envio). */
export function JudgmentStrip() {
  const { state } = useGame();
  const jg = state.jg;
  const sorted = [...state.players].sort((a, b) => (a.id === jg.judgeId ? -1 : b.id === jg.judgeId ? 1 : (b.score ?? 0) - (a.score ?? 0)));
  return (
    <ul className="pointer-events-auto hidden max-h-[40vh] min-w-48 gap-1 overflow-y-auto rounded-2xl bg-white/90 p-2 shadow sm:grid" aria-label="Placar dos jogadores">
      {sorted.map((p) => {
        const judge = p.id === jg.judgeId;
        const sent = jg.stage === 'answer' && jg.eligible.includes(p.id) ? jg.submitted.includes(p.id) : null;
        const out = jg.eligible.length > 0 && !judge && !jg.eligible.includes(p.id) && jg.tiebreak;
        return (
          <li key={p.id} className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-sm ${p.eliminated ? 'opacity-50' : ''} ${out ? 'opacity-60' : ''}`}>
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-felt' : 'bg-amber-400'}`} title={p.connected ? 'online' : 'reconectando'} />
              <span className={p.eliminated ? 'line-through' : ''}>{p.nickname}</span>
              {p.id === state.you.id && <span className="text-[10px] text-ink/50">você</span>}
              {judge && <span className="text-[10px] font-extrabold text-amber-700">👑 JULGADOR</span>}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-bold">
              {sent !== null && (sent ? <span className="text-felt-dark" title="já respondeu">✓</span> : <span className="text-ink/40" title="respondendo">…</span>)}
              {!judge && <span className="rounded-full bg-amber-100 px-2 py-0.5 tabular-nums text-amber-900">{p.score ?? 0} pt</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ThemeTitle({ theme, tiebreak }) {
  return (
    <div className="mb-3 text-center">
      <p className="text-xs font-extrabold uppercase tracking-widest text-ink/50">{tiebreak ? 'Tema do desempate' : 'Tema'}</p>
      <h2 className="text-2xl font-black uppercase leading-tight tracking-tight">{theme}</h2>
    </div>
  );
}

function Spinner({ label }) {
  return (
    <div className="flex items-center justify-center gap-3 py-3" role="status">
      <span className="h-6 w-6 animate-spin rounded-full border-4 border-felt/25 border-t-felt" aria-hidden="true" />
      <span className="text-sm font-bold text-ink/70">{label}</span>
    </div>
  );
}

// ------------------------------------------------------------------ etapa: tema
function ThemeStage({ jg }) {
  const { state, submitTheme, notify } = useGame();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const isAi = jg.mode === 'judge_ai';
  const iAmJudge = jg.judgeId === state.you.id;

  if (isAi) {
    return (
      <div className={panel}>
        <p className="text-center text-xs font-extrabold uppercase tracking-widest text-ink/50">Nova rodada</p>
        <Spinner label="A IA está criando o tema…" />
        <div className="flex justify-center"><Timer deadline={jg.deadline} duration={jg.duration} /></div>
      </div>
    );
  }
  if (!iAmJudge) {
    return (
      <div className={panel}>
        <p className="text-center text-xs font-extrabold uppercase tracking-widest text-ink/50">Nova rodada</p>
        <Spinner label={`${nickOf(state, jg.judgeId)} está escolhendo o tema…`} />
        <div className="flex justify-center"><Timer deadline={jg.deadline} duration={jg.duration} /></div>
      </div>
    );
  }
  const send = async () => {
    if (busy || text.trim().length < 3) return;
    setBusy(true);
    const res = await submitTheme(text);
    setBusy(false);
    if (!res.ok) notify(res.error, 'error');
  };
  return (
    <div className={panel}>
      <p className="text-center text-xs font-extrabold uppercase tracking-widest text-felt">Você é o Julgador 👑</p>
      <h2 className="mt-1 text-center text-xl font-black">Escreva o tema da rodada</h2>
      <p className="mb-3 text-center text-sm text-ink/60">Ex.: “Personagem mais forte”. Depois de enviado, o tema não muda.</p>
      <div className="flex gap-2">
        <input
          autoFocus
          value={text}
          maxLength={120}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Tema da rodada"
          aria-label="Tema da rodada"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-xl border-2 border-ink/10 bg-white px-3 py-2.5 text-base outline-none focus:border-felt focus:ring-4 focus:ring-felt/15"
        />
        <button onClick={send} disabled={busy || text.trim().length < 3} className="rounded-xl bg-felt px-5 font-bold text-white shadow hover:bg-felt-dark disabled:opacity-40">
          Enviar tema
        </button>
      </div>
      <div className="mt-3 flex justify-center"><Timer deadline={jg.deadline} duration={jg.duration} /></div>
    </div>
  );
}

// ------------------------------------------------------------------ etapa: respostas
function AnswerStage({ jg }) {
  const { state, submitAnswer, notify } = useGame();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const me = state.you.id;
  const iAmJudge = jg.judgeId === me;
  const participates = jg.eligible.includes(me);
  const sent = jg.myAnswer != null || jg.submitted.includes(me);
  const waiting = jg.eligible.filter((id) => !jg.submitted.includes(id));

  const send = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    const res = await submitAnswer(text);
    setBusy(false);
    if (!res.ok && res.code !== 'DUPLICATE') notify(res.error, 'error');
  };

  return (
    <div className={panel}>
      <ThemeTitle theme={jg.theme} tiebreak={jg.tiebreak} />
      {participates && !sent && (
        <div className="flex gap-2">
          <input
            autoFocus
            value={text}
            maxLength={80}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Escreva a sua resposta"
            aria-label="Sua resposta"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border-2 border-ink/10 bg-white px-3 py-2.5 text-base outline-none focus:border-felt focus:ring-4 focus:ring-felt/15"
          />
          <button onClick={send} disabled={busy || !text.trim()} className="rounded-xl bg-felt px-5 font-bold text-white shadow hover:bg-felt-dark disabled:opacity-40">
            Enviar
          </button>
        </div>
      )}
      {participates && sent && (
        <p className="rounded-xl bg-felt-light px-4 py-2.5 text-center text-sm font-bold text-felt-dark">
          ✓ Resposta enviada{jg.myAnswer ? <>: “{jg.myAnswer}”</> : ''}. Ela não pode mais ser alterada.
        </p>
      )}
      {!participates && (
        <p className="rounded-xl bg-ink/5 px-4 py-2.5 text-center text-sm font-semibold text-ink/70">
          {iAmJudge ? 'Você é o Julgador: espere as respostas chegarem, sem ver quem escreveu o quê.' : 'Você não participa desta rodada de desempate. Acompanhe!'}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-ink/70" aria-live="polite">
          {jg.submitted.length}/{jg.eligible.length} responderam
          {waiting.length > 0 && <> · faltam: {waiting.map((id) => nickOf(state, id)).join(', ')}</>}
        </span>
        <Timer deadline={jg.deadline} duration={jg.duration} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ cartões de resposta (anônimos / revelados)
function AnswerCard({ a, state, winner = false, showAuthor = false, onPick, canPick = false, dim = false }) {
  const author = showAuthor && a.playerId ? nickOf(state, a.playerId) : null;
  const interactive = !!onPick;
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={interactive ? () => onPick(a.label) : undefined}
      disabled={interactive ? !canPick : undefined}
      aria-label={interactive ? `Escolher a resposta ${a.label}: ${a.text}` : undefined}
      className={`relative flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition ${winner ? 'border-amber-400 bg-amber-50 shadow-lg ring-4 ring-amber-300/60' : 'border-ink/10 bg-white'} ${dim ? 'opacity-60' : ''} ${interactive ? (canPick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-felt' : 'cursor-not-allowed opacity-70') : ''}`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg font-black ${winner ? 'bg-amber-400 text-white' : 'bg-ink text-white'}`}>{a.label}</span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-base font-bold leading-snug">{a.text}</span>
        {author !== null && <span className="qse-fade block text-xs font-extrabold uppercase tracking-wide text-felt-dark">por {author}</span>}
      </span>
      {winner && <span className="text-xl" aria-label="vencedora">🏆</span>}
    </Tag>
  );
}

// ------------------------------------------------------------------ etapa: julgamento (respostas anônimas)
function JudgingStage({ jg }) {
  const { state, chooseWinner, notify, serverNow } = useGame();
  const iAmJudge = jg.judgeId === state.you.id;
  const isAi = jg.mode === 'judge_ai';
  const left = useCountdown(jg.canPickAt); // só libera a escolha depois da leitura
  const canPick = iAmJudge && !isAi && serverNow() >= (jg.canPickAt ?? 0);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(null);

  const pick = async (label) => {
    if (busy || !canPick) return;
    setBusy(true);
    setPicked(label);
    const res = await chooseWinner(label);
    setBusy(false);
    if (!res.ok) {
      setPicked(null);
      notify(res.error, 'error');
    }
  };

  return (
    <div className={panel}>
      <ThemeTitle theme={jg.theme} tiebreak={jg.tiebreak} />
      <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-ink/50">Respostas anônimas</p>
      <div className="grid max-h-[40vh] gap-2 overflow-y-auto p-1.5 sm:grid-cols-2">
        {jg.answers.map((a) => (
          <AnswerCard key={a.label} a={a} state={state} winner={picked === a.label} onPick={iAmJudge && !isAi ? pick : undefined} canPick={canPick && !busy} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {isAi ? (
          <Spinner label="A IA está analisando as respostas…" />
        ) : iAmJudge ? (
          <p className="text-sm font-bold text-ink/70" aria-live="polite">{canPick ? 'Escolha a melhor resposta.' : `Leia as respostas… a escolha libera em ${left}s`}</p>
        ) : (
          <p className="text-sm font-bold text-ink/70">{nickOf(state, jg.judgeId)} está escolhendo a melhor resposta…</p>
        )}
        {!isAi && <Timer deadline={jg.deadline} duration={jg.duration} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ etapa: revelação
/** Quantos autores já foram revelados (vencedor primeiro, depois os outros), calculado pelo relógio do servidor. */
function useRevealCount(jg, total) {
  const { serverNow } = useGame();
  const start = (jg.deadline ?? 0) - (jg.duration ?? 0);
  const at = (k) => 1100 + k * 900; // ms depois do início da revelação
  const initial = () => {
    const elapsed = serverNow() - start;
    let c = 0;
    while (c < total && elapsed >= at(c)) c += 1;
    return c;
  };
  const [count, setCount] = useState(initial);
  const ref = useRef(count);
  ref.current = count;
  useEffect(() => {
    if (count >= total) return undefined;
    const wait = Math.max(0, start + at(count) - serverNow());
    const id = setTimeout(() => setCount(count + 1), wait);
    return () => clearTimeout(id);
  }, [count, total]); // eslint-disable-line react-hooks/exhaustive-deps
  return count;
}

function RevealStage({ jg }) {
  const { state } = useGame();
  const v = jg.verdict;
  const winnerCard = jg.answers.find((a) => a.label === v.label);
  const ordered = [winnerCard, ...jg.answers.filter((a) => a.label !== v.label)];
  const count = useRevealCount(jg, ordered.length);
  const shown = new Set(ordered.slice(0, count).map((a) => a.label));
  const winnerRevealed = shown.has(v.label);
  const mine = v.winnerId === state.you.id;
  return (
    <div className={panel}>
      <ThemeTitle theme={jg.theme} tiebreak={jg.tiebreak} />
      <p className="mb-2 text-center text-lg font-black text-amber-700" aria-live="polite">
        {winnerRevealed ? (mine ? '🏆 Sua resposta venceu! +1 ponto' : `🏆 ${nickOf(state, v.winnerId)} ganhou +1 ponto`) : jg.mode === 'judge_ai' ? 'A IA decidiu…' : 'O Julgador decidiu…'}
      </p>
      <div className="grid max-h-[38vh] gap-2 overflow-y-auto p-1.5 sm:grid-cols-2">
        {jg.answers.map((a) => (
          <AnswerCard key={a.label} a={a} state={state} winner={a.label === v.label} showAuthor={shown.has(a.label)} dim={a.label !== v.label && !shown.has(a.label)} />
        ))}
      </div>
      {jg.mode === 'judge_ai' && (v.justification || v.uncertain) && (
        <div className="qse-fade mt-3 rounded-xl bg-ink/5 px-4 py-2.5 text-sm">
          {v.justification && <p><b>🤖 Justificativa:</b> {v.justification}</p>}
          <p className="mt-0.5 text-xs font-semibold text-ink/60">
            {v.kind === 'objective' ? 'Tema objetivo: julgado pelos fatos.' : 'Tema subjetivo: julgado pelo critério da IA.'}
            {v.uncertain ? ' ⚠ A IA informou incerteza nesta decisão.' : ''}
          </p>
        </div>
      )}
      <p className="mt-3 text-center text-xs font-semibold text-ink/50">
        {jg.tiebreak || jg.played < jg.total ? 'Próxima rodada em instantes…' : 'Apurando o resultado final…'}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ rodada anulada
function AnnulStage({ jg }) {
  return (
    <div className={panel}>
      <p className="text-center text-xs font-extrabold uppercase tracking-widest text-amber-700">Rodada anulada</p>
      <p className="mt-1 text-center text-base font-bold">{REASON[jg.annul?.reason] ?? 'A rodada não pôde ser concluída.'}</p>
      <p className="mt-1 text-center text-sm text-ink/60">Ela não conta ponto nem rodada. Já vamos recomeçar…</p>
    </div>
  );
}

export default function JudgmentHud() {
  const { state } = useGame();
  const jg = state.jg;
  if (!jg || state.phase !== 'playing') return null;
  const body =
    jg.stage === 'theme' ? <ThemeStage jg={jg} />
    : jg.stage === 'answer' ? <AnswerStage jg={jg} />
    : jg.stage === 'judging' ? <JudgingStage jg={jg} />
    : jg.stage === 'reveal' ? <RevealStage jg={jg} />
    : <AnnulStage jg={jg} />;
  // key: reinicia a animação suave de entrada a cada etapa/rodada
  return <div key={`${jg.round}:${jg.stage}`} className="mx-auto w-full max-w-2xl">{body}</div>;
}
