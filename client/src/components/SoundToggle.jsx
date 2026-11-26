import { useEffect, useState } from 'react';
import { isSoundEnabled, setSoundEnabled, subscribeSound } from '../audio/sfx.js';

export default function SoundToggle({ className = '' }) {
  const [on, setOn] = useState(isSoundEnabled);
  useEffect(() => subscribeSound(setOn), []);

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Desativar efeitos sonoros' : 'Ativar efeitos sonoros'}
      title={on ? 'Som ligado' : 'Som desligado'}
      onClick={() => setSoundEnabled(!on)}
      className={`grid h-9 w-9 place-items-center rounded-xl bg-white/85 text-ink shadow transition hover:bg-white active:scale-95 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
        {on ? (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </>
        ) : (
          <>
            <path d="m16 9 5 6" />
            <path d="m21 9-5 6" />
          </>
        )}
      </svg>
    </button>
  );
}
