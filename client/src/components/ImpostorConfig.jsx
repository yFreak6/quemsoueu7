import { useEffect, useState } from 'react';
import { useGame } from '../game/GameContext.jsx';

const Radio = ({ name, checked, onChange, title, desc, disabled = false }) => (
  <label className={`flex items-start gap-3 rounded-xl border-2 px-4 py-2.5 transition ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'} ${checked ? 'border-felt bg-felt-light' : 'border-ink/10 bg-white hover:border-felt/50'}`}>
    <input type="radio" name={name} className="mt-1 accent-felt" checked={checked} disabled={disabled} onChange={onChange} />
    <span>
      <span className="block text-sm font-bold">{title}</span>
      <span className="block text-xs text-ink/60">{desc}</span>
    </span>
  </label>
);

/** Campo de texto que só envia ao servidor ao sair do campo ou apertar Enter (evita uma mensagem por tecla). */
function SecretField({ label, value, onSave, placeholder }) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const save = () => text.trim() !== (value ?? '') && onSave(text);
  return (
    <label className="grid gap-1">
      <span className="text-xs font-bold text-ink/70">{label}</span>
      <input
        value={text}
        maxLength={40}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), save())}
        className="w-full rounded-xl border-2 border-ink/10 bg-white px-3 py-2 text-base outline-none focus:border-felt focus:ring-4 focus:ring-felt/15"
      />
    </label>
  );
}

/**
 * Configuração dos três modos de impostor. Só mostra o que faz sentido para o modo escolhido
 * e desabilita combinações incompatíveis (ex.: aliados só com folha de personagem no modo múltiplo).
 */
export default function ImpostorConfig({ run }) {
  const { state, setSettings } = useGame();
  const mode = state.settings.mode;
  const cfg = state.settings.impostor;
  const secret = state.lobby.impostorSetup ?? {};
  const parts = state.players.filter((p) => !p.spectator);
  const n = parts.length;
  const multi = mode === 'imp_multi';
  const maxCount = Math.max(1, Math.floor((n - 1) / 2));
  const set = (patch) => run(() => setSettings({ impostor: patch }));
  const hostPicks = cfg.innocents === 'host';

  return (
    <div className="grid gap-4 rounded-2xl border-2 border-ink/10 bg-white/60 p-4">
      <div>
        <h3 className="text-base font-extrabold">Configuração do impostor</h3>
        <p className="text-xs text-ink/60">{n} jogador{n === 1 ? '' : 'es'} participando{hostPicks ? ' (você é espectador)' : ''}.</p>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-bold">Quem escolhe o personagem dos inocentes?</legend>
        <Radio name="innocents" checked={cfg.innocents === 'ai'} onChange={() => set({ innocents: 'ai' })} title="IA escolhe" desc="O jogo sorteia o personagem. Você joga normalmente e pode até ser o impostor." />
        <Radio name="innocents" checked={hostPicks} onChange={() => set({ innocents: 'host' })} title="Host escolhe" desc="Você digita o personagem e fica como espectador: sem papel, sem turnos, sem voto." />
        {hostPicks && <SecretField label="Personagem dos inocentes" value={secret.innocentChar} placeholder="Ex.: Homem-Aranha" onSave={(v) => set({ innocentChar: v })} />}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-bold">O que o impostor recebe?</legend>
        <Radio name="sheet" checked={cfg.sheet === 'word'} onChange={() => set({ sheet: 'word' })} title='A palavra "IMPOSTOR"' desc="Ele sabe que é o impostor." />
        <Radio name="sheet" checked={cfg.sheet === 'character'} onChange={() => set({ sheet: 'character' })} title="Outro personagem" desc="Ele acha que só recebeu um personagem diferente e não sabe que é o impostor. Exige mais inocentes que impostores." />
        {cfg.sheet === 'character' && hostPicks && <SecretField label="Personagem do impostor (diferente do dos inocentes)" value={secret.impostorChar} placeholder="Ex.: Batman" onSave={(v) => set({ impostorChar: v })} />}
        {cfg.sheet === 'character' && !hostPicks && <p className="text-xs text-ink/60">A IA escolhe um personagem diferente para o impostor.</p>}
      </fieldset>

      <div className="flex items-center justify-between gap-3 rounded-xl bg-ink/5 px-4 py-3">
        <span className="text-sm font-bold">Rodadas de turnos antes de cada votação</span>
        <span className="flex items-center gap-3">
          <button aria-label="Menos uma rodada" disabled={cfg.rounds <= 1} onClick={() => set({ rounds: cfg.rounds - 1 })} className="h-8 w-8 rounded-lg bg-white text-lg font-black shadow-sm hover:bg-felt-light disabled:opacity-30">−</button>
          <b className="w-6 text-center text-xl tabular-nums">{cfg.rounds}</b>
          <button aria-label="Mais uma rodada" disabled={cfg.rounds >= 5} onClick={() => set({ rounds: cfg.rounds + 1 })} className="h-8 w-8 rounded-lg bg-white text-lg font-black shadow-sm hover:bg-felt-light disabled:opacity-30">+</button>
        </span>
      </div>

      {!multi && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-bold">Quem será o impostor?</legend>
          <Radio name="pick" checked={cfg.pick === 'random'} onChange={() => set({ pick: 'random' })} title="Sorteio automático" desc={hostPicks ? 'O servidor sorteia entre os jogadores.' : 'O servidor sorteia entre todos, inclusive você.'} />
          <Radio name="pick" checked={cfg.pick === 'host'} onChange={() => set({ pick: 'host' })} title="Host escolhe" desc="Você indica o jogador (só você sabe)." />
          {cfg.pick === 'host' && (
            <select
              value={secret.impostorId ?? ''}
              onChange={(e) => set({ impostorId: e.target.value || null })}
              className="w-full rounded-xl border-2 border-ink/10 bg-white px-3 py-2 text-base outline-none focus:border-felt"
              aria-label="Jogador impostor"
            >
              <option value="">Escolha o impostor…</option>
              {parts.map((p) => (
                <option key={p.id} value={p.id}>{p.nickname}{p.id === state.you.id ? ' (você)' : ''}</option>
              ))}
            </select>
          )}
        </fieldset>
      )}

      {multi && (
        <>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-ink/5 px-4 py-3">
            <span className="text-sm font-bold">Quantidade de impostores</span>
            <span className="flex items-center gap-3">
              <button aria-label="Menos um impostor" disabled={cfg.count <= 1} onClick={() => set({ count: cfg.count - 1 })} className="h-8 w-8 rounded-lg bg-white text-lg font-black shadow-sm hover:bg-felt-light disabled:opacity-30">−</button>
              <b className="w-6 text-center text-xl tabular-nums">{cfg.count}</b>
              <button aria-label="Mais um impostor" disabled={cfg.count >= maxCount} onClick={() => set({ count: cfg.count + 1 })} className="h-8 w-8 rounded-lg bg-white text-lg font-black shadow-sm hover:bg-felt-light disabled:opacity-30">+</button>
            </span>
          </div>
          <p className="-mt-2 text-xs text-ink/50">Máximo com {n} jogadores: {n >= 3 ? maxCount : 0} (os inocentes precisam ser maioria). O servidor sorteia quem são.</p>
          <label className={`flex items-start gap-3 rounded-xl border-2 px-4 py-2.5 ${cfg.sheet === 'word' ? 'cursor-not-allowed border-ink/10 opacity-45' : 'cursor-pointer border-ink/10 bg-white'}`}>
            <input type="checkbox" className="mt-1 accent-felt" checked={cfg.alliesKnow} disabled={cfg.sheet === 'word'} onChange={(e) => set({ alliesKnow: e.target.checked })} />
            <span>
              <span className="block text-sm font-bold">IMPOSTORES SABEM QUEM SÃO SEUS ALIADOS?</span>
              <span className="block text-xs text-ink/60">
                {cfg.sheet === 'word' ? 'Indisponível com a palavra IMPOSTOR: os impostores não recebem informação sobre os outros.' : 'Sim: cada impostor recebe, em privado, o nome dos outros impostores. Não: só vê a própria folha.'}
              </span>
            </span>
          </label>
        </>
      )}
    </div>
  );
}
