// Sorteios do modo CADA UM ESCOLHE VÁRIOS (funções puras, testáveis sem sala).
import { nameKey } from './fuzzy.js';

export const shuffled = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * 1º sorteio: exatamente 1 personagem da lista de cada jogador, sem repetir personagem entre jogadores.
 * Busca com retrocesso em ordem aleatória: se existir alguma combinação válida, ela é encontrada.
 * lists: array (um por jogador) de arrays de nomes. Retorna array de índices (item sorteado de cada lista) ou null.
 */
export function drawOnePerPlayer(lists) {
  const n = lists.length;
  const order = shuffled(lists.map((_, i) => i));
  const chosen = new Array(n).fill(-1);
  const used = new Set();
  const go = (k) => {
    if (k === n) return true;
    const p = order[k];
    for (const idx of shuffled(lists[p].map((_, i) => i))) {
      const key = nameKey(lists[p][idx]);
      if (used.has(key)) continue;
      used.add(key);
      chosen[p] = idx;
      if (go(k + 1)) return true;
      used.delete(key);
    }
    return false;
  };
  return go(0) ? chosen : null;
}

/**
 * 2º sorteio: distribui os n personagens sorteados entre os n jogadores, um para cada, sem repetir,
 * de modo que ninguém receba o personagem sorteado da própria seleção (regra obrigatória).
 * Regra extra (quando possível): ninguém recebe um nome que esteja na própria lista, mesmo que ele tenha
 * sido sorteado da lista de outro jogador (senão a pessoa saberia a resposta). Se isso for impossível,
 * cai para a regra obrigatória, que sempre tem solução para n >= 2.
 * Retorna array: assign[i] = índice (0..n-1) do jogador cujo sorteado vai para o jogador i.
 */
export function distribute(drawnKeys, ownKeySets) {
  const n = drawnKeys.length;
  if (n < 2) return null;
  const attempt = (forbidden, budget) => {
    const assign = new Array(n).fill(-1);
    const taken = new Array(n).fill(false);
    let nodes = 0;
    const go = (i) => {
      if (i === n) return true;
      if (++nodes > budget) return false;
      for (const src of shuffled([...Array(n).keys()])) {
        if (taken[src] || forbidden(i, src)) continue;
        taken[src] = true;
        assign[i] = src;
        if (go(i + 1)) return true;
        taken[src] = false;
      }
      return false;
    };
    return go(0) ? assign : null;
  };
  return (
    attempt((i, src) => src === i || ownKeySets[i].has(drawnKeys[src]), 20000) ||
    attempt((i, src) => src === i, 20000)
  );
}

/** Há pelo menos uma combinação válida de 1º sorteio? (usado para avisar o host antes de iniciar) */
export const canDrawOnePerPlayer = (lists) => drawOnePerPlayer(lists) !== null;

export const keysOf = (list) => new Set(list.map(nameKey));
