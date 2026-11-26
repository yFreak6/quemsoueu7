import { useState } from 'react';
import Alert from '../components/Alert.jsx';
import { useGame } from '../game/GameContext.jsx';
import { MODES, ModePicker } from '../components/ModePicker.jsx';

const inputCls =
  'w-full rounded-2xl border-2 border-ink/10 bg-white px-4 py-3.5 text-lg shadow-sm outline-none transition placeholder:text-ink/30 focus:border-felt focus:ring-4 focus:ring-felt/15';

/** Vista de cima da mesa: o logotipo do jogo. Os jogadores (com a etiqueta na testa) giram devagar em volta da mesa. */
function TableMark() {
  const seats = 8;
  return (
    <div className="relative mx-auto h-32 w-32" aria-hidden="true">
      <div className="absolute inset-3 rounded-full bg-felt/25 blur-xl" />
      <svg viewBox="0 0 140 140" className="relative h-full w-full drop-shadow-lg">
        <g className="origin-center animate-spin-slow" style={{ transformOrigin: '70px 70px' }}>
          {Array.from({ length: seats }, (_, i) => {
            const a = (i / seats) * Math.PI * 2;
            const x = 70 + Math.sin(a) * 58;
            const y = 70 - Math.cos(a) * 58;
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="10.5" fill="#fff" stroke="#16241c" strokeOpacity=".14" />
                <rect x={x - 5.5} y={y - 3.2} width="11" height="6.4" rx="1.6" fill={i % 2 ? '#f2a100' : '#2f9e63'} />
              </g>
            );
          })}
        </g>
        <circle cx="70" cy="70" r="40" fill="#237a4c" />
        <circle cx="70" cy="70" r="38" fill="#2f9e63" />
        <circle cx="70" cy="70" r="38" fill="none" stroke="#e9f5ee" strokeWidth="2.5" />
        <circle cx="70" cy="70" r="31" fill="none" stroke="#fff" strokeOpacity=".22" strokeDasharray="2 5" />
        <text x="70" y="85" textAnchor="middle" fontSize="44" fontWeight="900" fill="#fff" fontFamily="Inter, system-ui, sans-serif">?</text>
      </svg>
    </div>
  );
}

const Icon = ({ d, className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d={d} />
  </svg>
);
const PLUS = 'M12 5v14M5 12h14';
const ENTER = 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3';

export default function Home() {
  const { create, join, notice, setNotice } = useGame();
  const prefill = new URLSearchParams(window.location.search).get('sala') ?? '';
  const [mode, setMode] = useState(prefill ? 'join' : null); // null | 'create' | 'join'
  const [pickView, setPickView] = useState(null); // categoria aberta no seletor de modos (null = lista de categorias)
  const [code, setCode] = useState(prefill.toUpperCase().slice(0, 4));
  const [nick, setNick] = useState('');
  const [gameMode, setGameMode] = useState('host');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice(null);
    const res = mode === 'create' ? await create(nick, gameMode) : await join(code, nick);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else window.history.replaceState(null, '', window.location.pathname);
  };

  const back = () => {
    setMode(null);
    setPickView(null);
    setError('');
  };

  return (
    <main className="relative grid h-full place-items-center overflow-y-auto bg-[radial-gradient(ellipse_at_top,#f7f1e5,#e9e3d6_60%,#d9d2c1)] p-4">
      {/* decoração suave: círculos de feltro ao fundo */}
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-felt/10" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 bottom-8 h-80 w-80 rounded-full bg-felt/10" aria-hidden="true" />
      <div className="pointer-events-none absolute right-[12%] top-[8%] h-24 w-24 rounded-full border-4 border-dashed border-felt/20" aria-hidden="true" />

      <div className="relative w-full max-w-md overflow-hidden rounded-[32px] bg-white/85 p-8 shadow-2xl ring-1 ring-ink/5">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-felt-dark via-felt to-amber-400" aria-hidden="true" />
        <div className="mb-8 text-center">
          <TableMark />
          <h1 className="mt-4 text-[2.6rem] font-black leading-none tracking-tight">
            Quem Sou Eu<span className="text-felt">?</span>
          </h1>
          <p className="mt-2 text-ink/60">Descubra o nome colado na sua testa.</p>
          <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-felt-light px-3 py-1 text-xs font-bold uppercase tracking-wider text-felt-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-felt" /> Multiplayer · 2 a 10 jogadores
          </p>
        </div>

        {notice && (
          <div className="mb-4">
            <Alert tone={notice.tone} onClose={() => setNotice(null)}>
              {notice.text}
            </Alert>
          </div>
        )}

        {mode === null ? (
          <div className="grid gap-3">
            <button onClick={() => setMode('create')} className="flex items-center justify-center gap-2 rounded-2xl bg-felt py-4 text-lg font-extrabold text-white shadow-lg shadow-felt/30 ring-1 ring-inset ring-white/20 transition hover:-translate-y-0.5 hover:bg-felt-dark hover:shadow-xl">
              <Icon d={PLUS} /> Criar Sala
            </button>
            <button onClick={() => setMode('join')} className="flex items-center justify-center gap-2 rounded-2xl bg-ink py-4 text-lg font-extrabold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-black hover:shadow-xl">
              <Icon d={ENTER} /> Juntar à Sala
            </button>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={submit} noValidate>
            <h2 className="text-center text-sm font-extrabold uppercase tracking-widest text-felt">{mode === 'create' ? 'Criar sala' : 'Juntar à sala'}</h2>

            {mode === 'join' && (
              <label className="grid gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ink/70" htmlFor="code">
                Código da sala
                <input
                  id="code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4));
                    setError('');
                  }}
                  placeholder="ABCD"
                  className={`${inputCls} text-center font-mono tracking-[0.4em]`}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  autoFocus={!prefill}
                />
              </label>
            )}

            <label className="grid gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ink/70" htmlFor="nick">
              Seu nickname
              <input
                id="nick"
                value={nick}
                onChange={(e) => {
                  setNick(e.target.value.slice(0, 16));
                  setError('');
                }}
                placeholder="Como você quer ser chamado"
                className={inputCls}
                autoComplete="off"
                autoFocus={mode === 'create' || !!prefill}
              />
            </label>

            {mode === 'create' && <ModePicker value={gameMode} onChange={setGameMode} view={pickView} onViewChange={setPickView} />}

            {error && <Alert tone="error">{error}</Alert>}

            <button
              disabled={busy || nick.trim().length < 2 || (mode === 'join' && code.length < 4)}
              className="rounded-2xl bg-felt py-4 text-lg font-extrabold text-white shadow-lg shadow-felt/30 ring-1 ring-inset ring-white/20 transition hover:-translate-y-0.5 hover:bg-felt-dark disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? 'Aguarde…' : mode === 'create' ? 'Criar sala' : 'Entrar'}
            </button>
            <button type="button" onClick={mode === 'create' && pickView ? () => setPickView(null) : back} className="text-sm font-semibold text-ink/60 hover:text-ink hover:underline">
              Voltar
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
