// Cenários 3D da partida. O SERVIDOR sorteia um por partida (em Room.start) e o envia no estado da sala:
// por isso todos veem o mesmo, a escolha não muda em re-renderizações, trocas de turno nem em recargas/reconexões.
//
// Para adicionar um cenário novo: 1) acrescente o id aqui; 2) registre o id no cliente em
// client/src/three/scenery/index.js (um componente que desenha o ambiente). Mais nada muda.
export const SCENERIES = ['bar', 'truck'];
export const DEFAULT_SCENERY = 'bar';

export const isScenery = (id) => SCENERIES.includes(id);

/**
 * Sorteia um cenário. `random` é injetável nos testes.
 * Variável de ambiente QSE_SCENERY=<id> força um cenário (útil para desenvolver/depurar um deles).
 */
export function pickScenery({ random = Math.random, env = process.env } = {}) {
  const forced = env?.QSE_SCENERY;
  if (forced && isScenery(forced)) return forced;
  const i = Math.min(SCENERIES.length - 1, Math.floor(random() * SCENERIES.length));
  return SCENERIES[i];
}
