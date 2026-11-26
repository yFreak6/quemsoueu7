import { useState } from 'react';
import std from '../assets/modes/std.png';
import team from '../assets/modes/team.png';
import imp from '../assets/modes/imp.png';
import host from '../assets/modes/host.png';
import players from '../assets/modes/players.png';
import multi from '../assets/modes/multi.png';
import teams from '../assets/modes/teams.png';
import impElim from '../assets/modes/imp_elim.png';
import impSingle from '../assets/modes/imp_single.png';
import impMulti from '../assets/modes/imp_multi.png';
import jug from '../assets/modes/jug.png';
import judgeHuman from '../assets/modes/jug_human.png';
import judgeAi from '../assets/modes/jug_ai.png';

/** Imagens finais dos cartões (arte do próprio projeto); o texto de cada cartão já faz parte da imagem. */
const ART = { std, team, imp, host, players, multi, teams, imp_elim: impElim, imp_single: impSingle, imp_multi: impMulti, jug, judge_human: judgeHuman, judge_ai: judgeAi };
/** Todos os cartões têm o mesmo tamanho (820×361). */
const GRID = 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]';
const IMG = 'block aspect-[820/361] w-full select-none object-fill';
const GLOW = '[filter:drop-shadow(0_0_2px_#2f9e63)_drop-shadow(0_0_3px_#2f9e63)_drop-shadow(0_0_5px_#2f9e63)]';

export const MODES = {
  host: { name: 'HOST ESCOLHE', desc: 'O host monta a lista de personagens; cada jogador sugere 1 nome, que é sorteado para o host. Aceita bots.' },
  players: { name: 'CADA UM ESCOLHE', desc: 'Todos (inclusive o host) escolhem 1 personagem. Cada escolha é sorteada para outro jogador, nunca para quem a fez. Sem bots.' },
  teams: { name: 'MODO EM TIMES', desc: 'Dois times sorteados. Cada um escolhe 1 personagem, que vai para alguém do time adversário. Vence o time em que todos acertarem primeiro. 2 ou 4 a 10 jogadores. Sem bots.' },
  multi: { name: 'CADA UM ESCOLHE VÁRIOS', desc: 'Cada jogador escolhe de 1 a 3 personagens. O jogo sorteia 1 de cada seleção e distribui os sorteados: ninguém recebe o sorteado da própria seleção. Sem bots.' },
  imp_elim: { name: 'IMPOSTOR — ELIMINAÇÃO', desc: 'Um impostor. Rodadas de turnos (só passar a vez) e votação: o mais votado sai. Inocentes vencem eliminando o impostor; o impostor vence se restarem só 2. Sem bots.' },
  imp_single: { name: 'IMPOSTOR — VOTAÇÃO ÚNICA', desc: 'Um impostor e uma única votação decisiva: acertou, inocentes vencem; errou, o impostor vence. Empate = mais uma rodada e nova votação. Sem bots.' },
  judge_human: { name: 'O JULGADOR', desc: 'Um jogador (sorteado ou escolhido pelo host) vira o Julgador: escreve o tema, lê as respostas anônimas dos outros e escolhe a melhor. Quem escreveu a vencedora ganha 1 ponto. Sem bots.' },
  judge_ai: { name: 'O JULGADOR (IA)', desc: 'Uma IA cria o tema de cada rodada, analisa as respostas anônimas de todos e escolhe a melhor, com uma justificativa breve. Exige a IA configurada no servidor. Sem bots.' },
  imp_multi: { name: 'IMPOSTORES — MÚLTIPLOS', desc: 'O host escolhe quantos impostores. A cada votação um jogador sai. Inocentes vencem sem impostores; impostores vencem ao igualar os inocentes. Sem bots.' },
};

/** O seletor agrupa os modos em três categorias. */
/** Rótulo curto dos cartões: dentro da categoria MODOS DE IMPOSTOR a palavra "impostor" não se repete. */
export const MODE_LABEL = {
  host: 'HOST ESCOLHE', players: 'CADA UM ESCOLHE', multi: 'CADA UM ESCOLHE VÁRIOS', teams: 'MODO EM TIMES',
  imp_elim: 'ELIMINAÇÃO', imp_single: 'VOTAÇÃO ÚNICA', imp_multi: 'MÚLTIPLOS',
  judge_human: 'O JULGADOR', judge_ai: 'O JULGADOR (IA)',
};

export const CATEGORIES = [
  { id: 'std', title: 'MODOS PADRÃO', label: 'MODOS\nPADRÃO', theme: ['#c58fd0', '#8f6a9e'], modes: ['host', 'players', 'multi'] },
  { id: 'team', title: 'MODOS DE TIME', label: 'MODOS DE\nTIME', theme: ['#9a9bd3', '#6d6fa6'], modes: ['teams'] },
  { id: 'imp', title: 'MODOS DE IMPOSTOR', label: 'MODOS DE\nIMPOSTOR', theme: ['#d0707a', '#a14852'], modes: ['imp_elim', 'imp_single', 'imp_multi'] },
  { id: 'jug', title: 'JULGAMENTO', label: 'JULGAMENTO', theme: ['#857f5a', '#55503a'], modes: ['judge_human', 'judge_ai'] },
];
export const isImpMode = (m) => typeof m === 'string' && m.startsWith('imp_');
export const isJudgeMode = (m) => typeof m === 'string' && m.startsWith('judge_');

export const categoryOf = (mode) => CATEGORIES.find((c) => c.modes.includes(mode)) ?? CATEGORIES[0];

const bg = ([light, dark]) => ({ background: `linear-gradient(to top right, ${dark} 0 50%, ${light} 50% 100%)` });

/** Seletor de modo: grandes cartões ilustrados de categoria; ao clicar, os modos da categoria aparecem abaixo. */
export function ModePicker({ value, onChange, disabled = false, playerCount = null, view: viewProp, onViewChange }) {
  // null = tela das categorias; id = "aba" com os modos daquela categoria
  // Controlado pelo pai (ex.: o botão "Voltar" da tela inicial) quando `onViewChange` é passado; senão, estado interno.
  const controlled = typeof onViewChange === 'function';
  const [inner, setInner] = useState(null);
  const view = controlled ? (viewProp ?? null) : inner;
  const setView = controlled ? onViewChange : setInner;
  const cat = CATEGORIES.find((c) => c.id === view) ?? null;
  const activeCat = categoryOf(value).id;

  const summary = (
    <p className="rounded-xl bg-felt-light px-3 py-2 text-xs font-medium text-ink/70" aria-live="polite">
      <b className="text-ink">{MODE_LABEL[value]}:</b> {MODES[value].desc}
    </p>
  );

  if (!cat) {
    return (
      <fieldset className="grid gap-3" disabled={disabled}>
        <legend className="mb-1 text-sm font-bold">Modo de partida</legend>
        <div className={`qse-fade ${GRID}`} role="group" aria-label="Categorias de modo">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={c.title}
              onClick={() => setView(c.id)}
              className={`relative block w-full transition duration-200 hover:-translate-y-0.5 ${activeCat === c.id ? GLOW : ''}`}
            >
              <img src={ART[c.id]} alt="" draggable="false" className={IMG} />
              {activeCat === c.id && <span className="absolute right-2 top-1.5 rounded-full bg-[#1d1626] px-2 py-0.5 text-[10px] font-extrabold text-white">ATIVO</span>}
            </button>
          ))}
        </div>
        {summary}
      </fieldset>
    );
  }

  return (
    <fieldset className="grid gap-3" disabled={disabled}>
      <legend className="mb-1 text-sm font-bold">Modo de partida</legend>
      {controlled ? (
        <span className="text-sm font-bold">{cat.title}</span>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView(null)}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#2a2030] bg-white px-4 py-1.5 text-sm font-extrabold text-[#1d1626] transition hover:-translate-x-0.5"
          >
            <span aria-hidden="true">←</span> Voltar
          </button>
          <span className="text-sm font-bold">{cat.title}</span>
        </div>
      )}

      <div id="mode-cards" role="radiogroup" aria-label={cat.title} className={`qse-fade ${GRID}`}>
        {cat.modes.map((key) => {
          const sel = value === key;
          // em times não funciona com 1 ou 3 jogadores: a opção fica desabilitada (a menos que já esteja escolhida)
          const off = key === 'teams' && value !== 'teams' && (playerCount === 1 || playerCount === 3);
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={sel}
              aria-label={MODE_LABEL[key]}
              disabled={off}
              onClick={() => onChange(key)}
              title={off ? 'Indisponível com 1 ou 3 jogadores' : undefined}
              className={`relative block w-full transition duration-200 ${off ? 'cursor-not-allowed opacity-45 grayscale' : 'cursor-pointer hover:-translate-y-0.5'} ${sel ? GLOW : ''}`}
            >
              <img src={ART[key]} alt="" draggable="false" className={IMG} />
              {sel && <span className="absolute right-2.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-felt text-sm font-black text-white" aria-hidden="true">✓</span>}
              {off && <span className="absolute bottom-2 left-3 rounded bg-white/85 px-1.5 text-[11px] font-bold text-[#1d1626]">Indisponível com {playerCount} jogador{playerCount === 1 ? '' : 'es'}</span>}
            </button>
          );
        })}
      </div>
      {summary}
    </fieldset>
  );
}
