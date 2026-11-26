import { useEffect, useState } from 'react';
import { useGame } from '../game/GameContext.jsx';

const STEPS = [
  { title: '1º sorteio', text: 'Sorteando 1 personagem da seleção de cada jogador…', ms: 2400 },
  { title: '2º sorteio', text: 'Distribuindo os personagens sorteados entre os jogadores…', ms: 2600 },
  { title: 'Pronto!', text: 'Todos receberam 1 personagem, e ninguém ficou com o sorteado da própria seleção. Olhe a mesa: você vê o papel dos outros, nunca o seu.', ms: 3200 },
];

/**
 * Apresentação dos dois sorteios do modo CADA UM ESCOLHE VÁRIOS. É só visual: o resultado real
 * já foi decidido no servidor e nunca passa por aqui (nenhum personagem é mostrado), então a animação
 * não revela nada. Aparece uma vez por partida e pode ser pulada.
 */
export default function DrawIntro() {
  const { state, lastEvent } = useGame();
  const [shown, setShown] = useState(null); // id do evento já apresentado/fechado
  const [step, setStep] = useState(0);
  const active = lastEvent?.type === 'game-start' && lastEvent.mode === 'multi' && state.phase === 'playing' && shown !== lastEvent.id;

  useEffect(() => {
    if (!active) return undefined;
    setStep(0);
    const t1 = setTimeout(() => setStep(1), STEPS[0].ms);
    const t2 = setTimeout(() => setStep(2), STEPS[0].ms + STEPS[1].ms);
    const t3 = setTimeout(() => setShown(lastEvent.id), STEPS[0].ms + STEPS[1].ms + STEPS[2].ms);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, [active, lastEvent?.id]);

  if (!active) return null;
  const s = STEPS[step];
  return (
    <div role="dialog" aria-label="Sorteio dos personagens" className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-ink/80 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 text-center shadow-2xl">
        <p className="text-xs font-extrabold uppercase tracking-widest text-felt">{s.title}</p>
        <p className="mt-1 min-h-[3.5rem] text-base font-bold text-ink">{s.text}</p>

        <div className="my-5 flex flex-wrap justify-center gap-3" style={{ perspective: 600 }}>
          {state.players.map((p, i) => (
            <div
              key={p.id}
              className={`grid h-24 w-20 place-items-center rounded-xl border-2 border-felt bg-felt-light px-1 ${step === 0 ? 'animate-card-flip' : step === 1 ? 'animate-card-shuffle' : 'animate-pop'}`}
              style={{ animationDelay: `${i * 0.08}s`, '--dx': `${i % 2 ? -22 : 22}px` }}
            >
              <span className="text-3xl font-black text-felt">{step === 2 ? '✓' : '?'}</span>
              <span className="w-full truncate text-[11px] font-bold">{p.nickname}</span>
            </div>
          ))}
        </div>

        <div className="mb-3 flex justify-center gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 w-8 rounded-full ${i <= step ? 'bg-felt' : 'bg-ink/15'}`} />
          ))}
        </div>
        <button onClick={() => setShown(lastEvent.id)} className="text-sm font-bold text-ink/60 underline hover:text-ink">
          {step === 2 ? 'Começar' : 'Pular'}
        </button>
      </div>
    </div>
  );
}
