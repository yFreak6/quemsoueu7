import { useGame } from '../game/GameContext.jsx';

const TONES = {
  info: 'bg-ink text-white',
  warn: 'bg-amber-500 text-white',
  error: 'bg-red-600 text-white',
};

export default function Toasts() {
  const { toasts } = useGame();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div key={t.id} className={`animate-pop max-w-md rounded-xl px-4 py-2 text-sm font-medium shadow-lg ${TONES[t.tone] ?? TONES.info}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
