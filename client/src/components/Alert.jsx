const TONES = {
  error: 'bg-red-50 text-red-800 border-red-200',
  warn: 'bg-amber-50 text-amber-900 border-amber-200',
  info: 'bg-felt-light text-felt-dark border-felt/30',
};

export default function Alert({ tone = 'error', children, onClose }) {
  return (
    <div role="alert" className={`animate-pop flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${TONES[tone]}`}>
      <span>{children}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Fechar aviso" className="-mr-1 rounded px-1 text-lg leading-none opacity-60 hover:opacity-100">
          ×
        </button>
      )}
    </div>
  );
}
