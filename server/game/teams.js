// MODO EM TIMES: divisão em dois times e distribuição dos personagens entre adversários (funções puras).
import { shuffled } from './draw.js';

/** Modo disponível para essa quantidade de jogadores? (2, 4, 5, ..., 10; nunca 1 ou 3) */
export const teamsAvailable = (n) => n === 2 || (n >= 4 && n <= 10);

/**
 * Divide os ids em 2 times equilibrados, ao acaso. Quantidade ímpar: sorteia qual time fica com 1 a mais.
 * Retorna { 1: [ids], 2: [ids] } (a ordem dentro do time também é aleatória e define a ordem dos turnos) ou null.
 */
export function splitTeams(ids) {
  const n = ids.length;
  if (!teamsAvailable(n)) return null;
  const sh = shuffled(ids);
  const small = Math.floor(n / 2);
  const bigIsOne = n % 2 === 1 ? Math.random() < 0.5 : false;
  const size1 = n % 2 === 0 ? n / 2 : bigIsOne ? small + 1 : small;
  return { 1: sh.slice(0, size1), 2: sh.slice(size1) };
}

/**
 * Distribuição inicial. Os personagens escolhidos por um time vão para jogadores do time ADVERSÁRIO.
 * Se o time de origem tem mais escolhas que o adversário tem jogadores, o excedente é descartado (ao acaso).
 * Se tem menos, sobram jogadores sem personagem (no máximo 1, no time maior): `missing`.
 * pickOf(id) -> personagem escolhido pelo jogador.
 * Retorna { assigned: Map(id -> personagem), missing: [ids], discarded: [personagens] }.
 */
export function distributeTeams(teams, pickOf) {
  const assigned = new Map();
  const missing = [];
  const discarded = [];
  for (const [from, to] of [[1, 2], [2, 1]]) {
    const chars = shuffled(teams[from].map(pickOf));
    const receivers = shuffled(teams[to]);
    const k = Math.min(chars.length, receivers.length);
    for (let i = 0; i < k; i++) assigned.set(receivers[i], chars[i]);
    receivers.slice(k).forEach((id) => missing.push(id));
    discarded.push(...chars.slice(k));
  }
  return { assigned, missing, discarded };
}
