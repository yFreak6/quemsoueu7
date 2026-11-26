// Regras puras do modo JULGAMENTO (sem estado, sem timers, sem rede): fáceis de testar isoladamente.
// A orquestração (fases, tempos, anonimato, pontuação) fica em judgmentRoom.js e Room.js.

import { nameKey } from './fuzzy.js';

export const JUDGMENT_MODES = ['judge_human', 'judge_ai'];
export const isJudgmentMode = (mode) => JUDGMENT_MODES.includes(mode);

export const DEFAULT_JUDGMENT = {
  pick: 'random', // como o Julgador humano é escolhido: 'random' (sorteio) | 'host' (o host escolhe)
  rounds: 3, // rodadas normais (sem contar as de desempate)
};
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 10;

/** Mínimo de jogadores na sala (incluindo o host). Com Julgador humano ele não responde, então precisam sobrar 2 respondendo. */
export const MIN_PLAYERS = { judge_human: 3, judge_ai: 2 };

export const THEME_MIN = 3;
export const THEME_MAX = 120;
export const ANSWER_MAX = 80;

/**
 * Visual fixo do Julgador (ANEXO 3: boneco amarelo-claro com coroa dourada). É o que TODOS veem enquanto
 * ele exerce o papel; o visual personalizado do jogador (`player.look`) nunca é alterado nem apagado.
 * Os ids 'judge' só existem aqui: o servidor não os aceita em `parseLook`, então nenhum jogador escolhe isso.
 */
export const JUDGE_LOOK = Object.freeze({ color: 'judge', hat: 'judge', neck: 'none', outfit: 'none', outfitColor: 'blue', face: 'none' });

/** Letras das respostas anônimas: A, B, C… (no máximo 10 jogadores na sala). */
export const labelFor = (i) => String.fromCharCode(65 + i);

export function shuffled(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sorteio do Julgador: todos têm a mesma chance. */
export function pickJudge(ids, rnd = Math.random) {
  if (!ids.length) return null;
  return ids[Math.min(ids.length - 1, Math.floor(rnd() * ids.length))];
}

/** Texto livre de resposta/tema: espaços normalizados e tamanho limitado (sem HTML: o cliente só renderiza como texto). */
export function cleanText(raw, max) {
  return String(raw ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Monta a lista anônima de uma rodada: embaralha as respostas e dá a cada uma uma letra.
 * Devolve { order:[{label, playerId, text}] } — `playerId` NUNCA deve sair do servidor antes da revelação.
 */
export function buildAnonymous(answers, rnd = Math.random) {
  const entries = shuffled(Object.entries(answers), rnd);
  return entries.map(([playerId, text], i) => ({ label: labelFor(i), playerId, text }));
}

/** Quem lidera o placar entre `ids` (todos os empatados no maior número de pontos). */
export function leaders(scores, ids) {
  if (!ids.length) return [];
  const max = Math.max(...ids.map((id) => scores[id] ?? 0));
  return ids.filter((id) => (scores[id] ?? 0) === max);
}

/** O tema novo repete algum já usado nesta partida? (compara pelo nameKey: sem acento/caixa/pontuação) */
export function repeatsTheme(theme, used) {
  const k = nameKey(theme);
  return used.some((t) => nameKey(t) === k);
}

/** Valida a configuração (pura) e devolve os motivos que impedem o início. */
export function validateJudgment(mode, cfg, { n, judgeId, ids, aiAvailable }) {
  const out = [];
  const min = MIN_PLAYERS[mode];
  if (n < min) {
    out.push(
      mode === 'judge_human'
        ? `O modo O JULGADOR precisa de pelo menos ${min} jogadores (1 julga e 2 respondem). Agora há ${n}.`
        : `O modo O JULGADOR (IA) precisa de pelo menos ${min} jogadores. Agora há ${n}.`,
    );
  }
  if (mode === 'judge_human' && cfg.pick === 'host') {
    if (!judgeId) out.push('Escolha quem será o Julgador.');
    else if (!ids.includes(judgeId)) out.push('O jogador escolhido como Julgador não está mais na sala. Escolha outro.');
  }
  if (mode === 'judge_ai' && !aiAvailable) {
    out.push('A IA não está configurada neste servidor: defina a variável de ambiente ANTHROPIC_API_KEY no servidor e reinicie-o.');
  }
  return out;
}
