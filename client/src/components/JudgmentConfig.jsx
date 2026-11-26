import { useGame } from '../game/GameContext.jsx';

const Radio = ({ name, checked, onChange, title, desc, disabled = false }) => (
  <label className={`flex items-start gap-3 rounded-xl border-2 px-4 py-2.5 transition ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'} ${checked ? 'border-felt bg-felt-light' : 'border-ink/10 bg-white hover:border-felt/50'}`}>
    <input type="radio" name={name} className="mt-1 accent-felt" checked={checked} disabled={disabled} onChange={onChange} />
    <span>
      <span className="block text-sm font-bold">{title}</span>
      {desc && <span className="block text-xs text-ink/60">{desc}</span>}
    </span>
  </label>
);

/** Número de rodadas (1–10): vale para as duas vertentes. */
function Rounds({ value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-ink/5 px-4 py-3">
      <span className="text-sm font-bold">
        Rodadas <span className="font-semibold text-ink/50">(sem contar desempates)</span>
      </span>
      <span className="flex items-center gap-3">
        <button type="button" aria-label="Menos uma rodada" disabled={value <= 1} onClick={() => onChange(value - 1)} className="h-8 w-8 rounded-lg bg-white text-lg font-black shadow-sm hover:bg-felt-light disabled:opacity-30">−</button>
        <b className="w-6 text-center text-xl tabular-nums">{value}</b>
        <button type="button" aria-label="Mais uma rodada" disabled={value >= 10} onClick={() => onChange(value + 1)} className="h-8 w-8 rounded-lg bg-white text-lg font-black shadow-sm hover:bg-felt-light disabled:opacity-30">+</button>
      </span>
    </div>
  );
}

/**
 * Configuração do modo JULGAMENTO (só o host). O servidor valida tudo; aqui só se pede e mostra o que falta.
 * - O JULGADOR: sorteio ou escolha manual (a lista inclui o próprio host).
 * - O JULGADOR (IA): avisa quando o servidor não tem a IA configurada.
 */
export default function JudgmentConfig({ run }) {
  const { state, setSettings } = useGame();
  const mode = state.settings.mode;
  const cfg = state.settings.judgment;
  const judgeId = state.lobby.judgmentSetup?.judgeId ?? null;
  const set = (patch) => run(() => setSettings({ judgment: patch }));

  return (
    <div className="grid gap-4 rounded-2xl border-2 border-ink/10 bg-white/60 p-4">
      <h3 className="text-base font-extrabold">Configuração do julgamento</h3>

      {mode === 'judge_human' ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-bold">Como o Julgador é escolhido?</legend>
          <Radio name="jpick" checked={cfg.pick === 'random'} onChange={() => set({ pick: 'random' })} title="Sorteio" desc="O servidor sorteia entre todos os jogadores da sala, inclusive você. Todos têm a mesma chance." />
          <Radio name="jpick" checked={cfg.pick === 'host'} onChange={() => set({ pick: 'host' })} title="Escolher o Julgador" desc="Você escolhe qualquer jogador da sala (inclusive você) antes de iniciar." />
          {cfg.pick === 'host' && (
            <ul className="grid gap-1.5 pl-2" aria-label="Escolha o Julgador">
              {state.players.map((p) => (
                <li key={p.id}>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-1.5 text-sm font-bold transition ${judgeId === p.id ? 'border-felt bg-felt-light' : 'border-ink/10 bg-white hover:border-felt/50'}`}>
                    <input type="radio" name="jjudge" className="accent-felt" checked={judgeId === p.id} onChange={() => set({ judgeId: p.id })} />
                    {p.nickname}
                    {p.id === state.you.id && <span className="text-xs font-semibold text-ink/50">(você)</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink/60">O Julgador não responde: ele escreve o tema e escolhe a melhor resposta. Aparece com o visual fixo de Julgador (coroa), sem a customização dele.</p>
        </fieldset>
      ) : (
        <div className="grid gap-2">
          {state.features?.judgeAI ? (
            <p className="rounded-xl bg-felt-light px-4 py-2.5 text-sm font-semibold text-felt-dark">A IA cria um tema novo a cada rodada e julga as respostas de todos (inclusive a sua).</p>
          ) : (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800">
              A IA não está configurada neste servidor. Quem hospeda o jogo precisa definir a variável de ambiente <code>ANTHROPIC_API_KEY</code> no servidor e reiniciá-lo. Enquanto isso, este modo não pode ser iniciado.
            </p>
          )}
        </div>
      )}

      <Rounds value={cfg.rounds} onChange={(n) => set({ rounds: n })} />
    </div>
  );
}
