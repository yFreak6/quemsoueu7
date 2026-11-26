import { useEffect } from 'react';
import { COLORS, FACES, HATS, NECKS, OUTFITS, OUTFIT_COLORS, colorHex, outfitHex } from '../game/look.js';

/** Pré-visualização 2D (SVG) do boneco, sem WebGL: funciona mesmo em aparelho fraco. */
function Preview({ look }) {
  const skin = colorHex(look.color);
  const cloth = outfitHex(look.outfitColor);
  const stroke = '#00000026';
  // bilhete na testa, na frente do chapéu; com óculos sobe um pouco para não cobrir os olhos
  const py = look.face === 'glasses' || look.face === 'sunglasses' ? 20 : 30;
  const sleeve = look.outfit === 'hoodie' || look.outfit === 'suit' ? 42 : look.outfit === 'tee' ? 18 : 0;
  const body = ['tee', 'hoodie', 'suit'].includes(look.outfit);
  return (
    <svg viewBox="0 -10 120 160" className="mx-auto h-48 w-auto" role="img" aria-label="Pré-visualização do seu boneco">
      <ellipse cx="60" cy="142" rx="34" ry="6" fill="#00000018" />
      <rect x="32" y="78" width="56" height="58" rx="26" fill={skin} stroke={stroke} />
      <rect x="16" y="82" width="16" height="42" rx="8" fill={skin} stroke={stroke} />
      <rect x="88" y="82" width="16" height="42" rx="8" fill={skin} stroke={stroke} />
      {body && <rect x="32" y={look.outfit === 'tee' ? 86 : 78} width="56" height={look.outfit === 'tee' ? 50 : 58} rx="24" fill={cloth} stroke={stroke} />}
      {sleeve > 0 && (
        <g fill={cloth} stroke={stroke}>
          <rect x="16" y="82" width="16" height={sleeve} rx="8" />
          <rect x="88" y="82" width="16" height={sleeve} rx="8" />
        </g>
      )}
      {look.outfit === 'hoodie' && (
        <g fill={cloth} stroke={stroke}>
          <ellipse cx="60" cy="78" rx="24" ry="8" />
          <rect x="46" y="112" width="28" height="12" rx="4" />
        </g>
      )}
      {look.outfit === 'suit' && (
        <g stroke={stroke}>
          <path d="M50 78 L60 92 L70 78 Z" fill="#f4f4f0" />
          <rect x="57" y="90" width="6" height="30" rx="2" fill="#b3262e" />
        </g>
      )}
      {look.outfit === 'apron' && (
        <g fill={cloth} stroke={stroke}>
          <rect x="43" y="94" width="34" height="42" rx="4" />
          <rect x="56" y="78" width="8" height="18" />
        </g>
      )}
      <circle cx="60" cy="50" r="27" fill={skin} stroke={stroke} />
      {look.face === 'glasses' && (
        <g fill="none" stroke="#222" strokeWidth="2">
          <circle cx="49" cy="50" r="7" />
          <circle cx="71" cy="50" r="7" />
          <path d="M56 50 H64" />
        </g>
      )}
      {look.face === 'sunglasses' && (
        <g fill="#0d0d10" stroke="#222" strokeWidth="1.5">
          <ellipse cx="49" cy="50" rx="8" ry="6" />
          <ellipse cx="71" cy="50" rx="8" ry="6" />
          <path d="M57 49 H63" />
        </g>
      )}
      {look.face === 'mustache' && <path d="M48 62 Q54 56 60 61 Q66 56 72 62 Q66 66 60 64 Q54 66 48 62 Z" fill="#3a2a1a" />}
      {look.neck === 'scarf' && (
        <g fill="#e0a526" stroke="#0002">
          <rect x="34" y="74" width="52" height="12" rx="6" />
          <rect x="68" y="80" width="12" height="28" rx="3" />
        </g>
      )}
      {look.neck === 'bowtie' && (
        <g fill="#c0392b" stroke="#0002">
          <path d="M60 84 L44 76 L44 92 Z" />
          <path d="M60 84 L76 76 L76 92 Z" />
          <circle cx="60" cy="84" r="4" />
        </g>
      )}
      {look.hat === 'cap' && (
        <g fill="#d6453d" stroke="#0002">
          <path d="M33 38 A27 27 0 0 1 87 38 Z" />
          <rect x="78" y="34" width="26" height="5" rx="2.5" />
        </g>
      )}
      {look.hat === 'beanie' && (
        <g fill="#3b6fd6" stroke="#0002">
          <path d="M32 40 A28 28 0 0 1 88 40 Z" />
          <circle cx="60" cy="10" r="6" fill="#f4f1e8" />
        </g>
      )}
      {look.hat === 'tophat' && (
        <g fill="#1d1d22">
          <rect x="30" y="26" width="60" height="6" rx="3" />
          <rect x="42" y="2" width="36" height="26" rx="2" />
          <rect x="42" y="19" width="36" height="5" fill="#c0392b" />
        </g>
      )}
      {look.hat === 'crown' && <path d="M38 30 L38 12 L49 22 L60 8 L71 22 L82 12 L82 30 Z" fill="#e8b923" stroke="#0003" />}
      {look.hat === 'party' && <path d="M60 -4 L74 30 L46 30 Z" fill="#e84fa0" stroke="#0003" transform="rotate(10 60 30)" />}
      {/* bilhete com o personagem: sempre na frente do chapéu */}
      <g>
        <rect x="38" y={py} width="44" height="22" rx="3" fill="#fff176" stroke="#0002" />
        <rect x="45" y={py + 9} width="30" height="3" rx="1.5" fill="#1f2a24" opacity=".45" />
      </g>
    </svg>
  );
}

function Chip({ active, children, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...rest}
      className={`rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition ${active ? 'border-felt bg-felt-light' : 'border-ink/10 bg-white hover:border-felt/50'}`}
    >
      {children}
    </button>
  );
}

/** Menu de personalização do boneco. Cada escolha vai direto ao servidor (todos veem na hora). */
export default function LookMenu({ look, onChange, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (patch) => onChange({ ...look, ...patch });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Personalizar boneco" className="my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-extrabold">Seu boneco</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xl font-bold text-ink/50 hover:text-ink" aria-label="Fechar">✕</button>
        </div>

        <Preview look={look} />

        <p className="mb-2 mt-4 text-sm font-bold">Cor</p>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={c.name}
              title={c.name}
              aria-pressed={look.color === c.id}
              onClick={() => set({ color: c.id })}
              className={`h-9 w-9 rounded-full border-2 transition ${look.color === c.id ? 'scale-110 border-ink ring-2 ring-felt' : 'border-ink/20 hover:scale-105'}`}
              style={{ background: c.hex }}
            />
          ))}
        </div>

        <p className="mb-2 mt-4 text-sm font-bold">Chapéu</p>
        <div className="flex flex-wrap gap-2">
          {HATS.map((h) => (
            <Chip key={h.id} active={look.hat === h.id} onClick={() => set({ hat: h.id })}>{h.name}</Chip>
          ))}
        </div>

        <p className="mb-2 mt-4 text-sm font-bold">Roupa</p>
        <div className="flex flex-wrap gap-2">
          {OUTFITS.map((o) => (
            <Chip key={o.id} active={look.outfit === o.id} onClick={() => set({ outfit: o.id })}>{o.name}</Chip>
          ))}
        </div>
        {look.outfit !== 'none' && (
          <>
            <p className="mb-2 mt-4 text-sm font-bold">Cor da roupa</p>
            <div className="flex flex-wrap gap-2">
              {OUTFIT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={c.name}
                  title={c.name}
                  aria-pressed={look.outfitColor === c.id}
                  onClick={() => set({ outfitColor: c.id })}
                  className={`h-9 w-9 rounded-full border-2 transition ${look.outfitColor === c.id ? 'scale-110 border-ink ring-2 ring-felt' : 'border-ink/20 hover:scale-105'}`}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          </>
        )}

        <p className="mb-2 mt-4 text-sm font-bold">Rosto</p>
        <div className="flex flex-wrap gap-2">
          {FACES.map((f) => (
            <Chip key={f.id} active={look.face === f.id} onClick={() => set({ face: f.id })}>{f.name}</Chip>
          ))}
        </div>

        <p className="mb-2 mt-4 text-sm font-bold">Pescoço</p>
        <div className="flex flex-wrap gap-2">
          {NECKS.map((n) => (
            <Chip key={n.id} active={look.neck === n.id} onClick={() => set({ neck: n.id })}>{n.name}</Chip>
          ))}
        </div>

        <button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-ink px-4 py-3 font-extrabold text-white hover:bg-black">Pronto</button>
      </div>
    </div>
  );
}
