import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../game/GameContext.jsx';

const PAPER = {
  backgroundColor: '#fbf7ea',
  backgroundImage:
    'linear-gradient(to right, transparent 34px, rgba(214,90,80,.55) 34px, rgba(214,90,80,.55) 36px, transparent 36px), repeating-linear-gradient(to bottom, transparent 0 27px, rgba(80,120,170,.28) 27px 28px)',
  backgroundPosition: '0 8px',
};

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? {};
  } catch {
    return {};
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: as notas valem só enquanto a aba estiver aberta */
  }
}

/**
 * Caderneta pessoal: páginas pautadas, espiral, abas. As anotações são só suas
 * (ficam neste navegador, nunca vão para o servidor) e persistem ao fechar, recarregar e reconectar.
 */
export default function Notebook() {
  const { state } = useGame();
  // A chave inclui o número da partida: ao iniciar outra partida, a caderneta começa em branco.
  // Recarregar a página no meio da partida mantém as anotações (mesma chave).
  const prefix = `qse:notes:${state.code}:${state.you.id}:`;
  const storeKey = `${prefix}${state.gameNo ?? 0}`;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('pistas');
  const [notes, setNotes] = useState(() => load(storeKey));
  const saveTimer = useRef(null);

  useEffect(() => {
    setNotes(load(storeKey));
    // apaga anotações de partidas anteriores desta sala
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix) && k !== storeKey) localStorage.removeItem(k);
      }
    } catch {
      /* sem armazenamento */
    }
  }, [storeKey, prefix]);
  const update = (k, v) => {
    setNotes((prev) => {
      const next = { ...prev, [k]: v };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(storeKey, next), 250);
      return next;
    });
  };
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const others = useMemo(() => state.players.filter((p) => p.id !== state.you.id), [state.players, state.you.id]);
  const tabs = [{ id: 'pistas', label: 'Pistas' }, { id: 'jogadores', label: 'Jogadores' }];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir caderneta"
        className="group flex items-center gap-2 rounded-xl border-l-8 border-felt-dark bg-cream px-3 py-2 text-sm font-bold shadow-lg ring-1 ring-ink/10 hover:-translate-y-0.5"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6z" />
          <path d="M9 8h6M9 12h6" />
        </svg>
        Caderneta
      </button>
    );
  }

  return (
    <div className="animate-pop relative max-h-[42vh] md:max-h-[50vh]">
      {/* abas */}
      <div className="absolute -top-7 left-6 flex gap-1" role="tablist" aria-label="Seções da caderneta">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-3 py-1 text-xs font-extrabold shadow ${tab === t.id ? 'bg-cream text-ink' : 'bg-felt-dark/90 text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative flex max-h-[inherit] flex-col overflow-hidden rounded-xl bg-cream shadow-2xl ring-1 ring-ink/15" style={{ boxShadow: '0 14px 30px rgba(22,36,28,.35), inset 0 0 22px rgba(120,90,40,.12)' }}>
        {/* espiral */}
        <div className="flex justify-around bg-gradient-to-b from-stone-300 to-stone-200 px-3 py-1" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="h-3 w-1.5 rounded-full bg-stone-500 shadow-inner ring-1 ring-stone-600/50" />
          ))}
        </div>
        <button onClick={() => setOpen(false)} aria-label="Fechar caderneta" className="absolute right-2 top-5 z-10 rounded-md bg-white/70 px-2 text-lg font-bold leading-6 hover:bg-white">
          ×
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto p-0" style={PAPER}>
          {tab === 'pistas' ? (
            <textarea
              aria-label="Suas anotações"
              value={notes.pistas ?? ''}
              onChange={(e) => update('pistas', e.target.value)}
              placeholder="Anote o que você descobrir…"
              rows={7}
              className="block w-full resize-none bg-transparent py-2 pl-11 pr-3 font-hand text-[22px] leading-[28px] text-slate-800 outline-none"
              style={{ minHeight: 168 }}
            />
          ) : (
            <ul className="py-2 pl-11 pr-3">
              {others.map((p) => (
                <li key={p.id} className="flex items-center gap-2 leading-[28px]">
                  <span className={`w-20 flex-none truncate font-hand text-[20px] font-semibold ${p.eliminated ? 'line-through opacity-50' : ''}`}>{p.nickname}</span>
                  <input
                    aria-label={`Palpite sobre as pistas de ${p.nickname}`}
                    value={notes[`p:${p.id}`] ?? ''}
                    onChange={(e) => update(`p:${p.id}`, e.target.value)}
                    placeholder="…"
                    className="min-w-0 flex-1 bg-transparent font-hand text-[20px] text-slate-800 outline-none"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
