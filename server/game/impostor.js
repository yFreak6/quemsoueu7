// Regras puras dos MODOS DE IMPOSTOR (sem estado, sem timers): fáceis de testar isoladamente.
// A orquestração (turnos, votação, visão privada) fica em Room.js.

import { nameKey } from './fuzzy.js';

export const IMPOSTOR_MODES = ['imp_elim', 'imp_single', 'imp_multi'];
export const isImpostorMode = (mode) => IMPOSTOR_MODES.includes(mode);

/** Mínimo de jogadores PARTICIPANTES (o host espectador não conta). Com 2 a partida já nasceria decidida. */
export const MIN_PARTICIPANTS = 3;

export const DEFAULT_IMPOSTOR = {
  innocents: 'ai', // quem escolhe o personagem dos inocentes: 'ai' (host joga) | 'host' (host espectador)
  sheet: 'word', // o que o impostor recebe: 'word' (a palavra IMPOSTOR) | 'character' (outro personagem)
  pick: 'random', // quem é o impostor (modos de 1 impostor): 'random' | 'host'
  count: 1, // quantidade de impostores (só IMPOSTORES — MÚLTIPLOS)
  alliesKnow: false, // impostores sabem quem são os aliados (só múltiplos + folha com personagem)
  rounds: 1, // rodadas de turnos completas antes de CADA votação
};
export const MAX_ROUNDS = 5;

export const IMPOSTOR_WORD = 'IMPOSTOR';

/** Personagens que a "IA" (o servidor) pode sortear. Conhecidos por qualquer grupo; nenhum é secreto. */
export const POOL = [
  'Homem-Aranha', 'Batman', 'Super-Homem', 'Mulher-Maravilha', 'Homem de Ferro', 'Capitão América', 'Thor', 'Hulk',
  'Goku', 'Naruto', 'Luffy', 'Pikachu', 'Mario', 'Luigi', 'Sonic', 'Link', 'Donkey Kong', 'Pac-Man',
  'Mickey Mouse', 'Pato Donald', 'Bob Esponja', 'Patrick Estrela', 'Shrek', 'Elsa', 'Simba', 'Woody', 'Buzz Lightyear',
  'Harry Potter', 'Hermione Granger', 'Darth Vader', 'Luke Skywalker', 'Yoda', 'Frodo', 'Gandalf', 'Jack Sparrow',
  'Sherlock Holmes', 'Albert Einstein', 'Cleópatra', 'Napoleão', 'Leonardo da Vinci', 'Pelé', 'Neymar', 'Messi',
  'Cristiano Ronaldo', 'Michael Jackson', 'Elvis Presley', 'Silvio Santos', 'Chaves', 'Chapolin', 'Turma da Mônica',
  'Cebolinha', 'Cascão', 'Papai Noel', 'Branca de Neve', 'Cinderela', 'Chapeuzinho Vermelho', 'Pinóquio', 'Peter Pan',
  'Dom Quixote', 'Tarzan', 'Aladdin', 'Moana', 'Nemo', 'Dory', 'Scooby-Doo', 'Tom', 'Jerry', 'Garfield', 'Snoopy',
];

/** Sorteia um personagem do pool que não seja nenhum dos `avoid` (compara pelo nameKey). */
export function aiPick(avoid = [], rnd = Math.random) {
  const bad = new Set(avoid.filter(Boolean).map(nameKey));
  const ok = POOL.filter((c) => !bad.has(nameKey(c)));
  return ok[Math.floor(rnd() * ok.length)];
}

/** Maior quantidade de impostores permitida com n participantes: inocentes sempre em maioria estrita. */
export const maxImpostors = (n) => Math.max(0, Math.floor((n - 1) / 2));

/**
 * Quem leva a votação? Devolve { ids|null, eliminated|null, tie, counts }.
 * Só elimina quem tem MAIS votos que qualquer outro (sem empate no topo). Zero votos = sem eliminação.
 */
export function tally(votes, eligibleIds) {
  const counts = Object.fromEntries(eligibleIds.map((id) => [id, 0]));
  for (const target of Object.values(votes)) if (target in counts) counts[target] += 1;
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter((id) => counts[id] === max);
  if (max === 0 || top.length !== 1) return { eliminated: null, tie: true, counts, top };
  return { eliminated: top[0], tie: false, counts, top };
}

/**
 * Vitória depois de uma eliminação/saída. `alive` = { impostors, innocents } (contagens dos ativos).
 * `gone` = papel de quem acabou de sair ('impostor'|'innocent'|null). Devolve 'innocents'|'impostors'|null.
 *  - imp_elim:   impostor eliminado → inocentes; restam 2 (1 impostor + 1 inocente) → impostor.
 *  - imp_single: impostor eliminado → inocentes; inocente eliminado → impostor.
 *  - imp_multi:  sem impostores → inocentes; impostores >= inocentes → impostores.
 */
export function winner(mode, alive, gone = null) {
  if (alive.impostors <= 0) return 'innocents';
  if (mode === 'imp_single' && gone === 'innocent') return 'impostors';
  if (alive.impostors >= alive.innocents) return 'impostors'; // imp_elim: 1 impostor + 1 inocente restantes
  return null;
}

/**
 * Valida a configuração (pura) e devolve a lista de motivos que impedem o início.
 * `n` = participantes (host espectador fora), `ids` = ids dos participantes.
 */
export function validateConfig(mode, cfg, { n, ids, innocentChar, impostorChar, impostorId }) {
  const out = [];
  if (n < MIN_PARTICIPANTS) {
    out.push(`Os modos de impostor precisam de pelo menos ${MIN_PARTICIPANTS} jogadores participando (agora há ${n}${cfg.innocents === 'host' ? ', sem contar você, que é espectador' : ''}).`);
  }
  if (cfg.innocents === 'host' && !String(innocentChar ?? '').trim()) out.push('Digite o personagem que os inocentes vão receber.');
  if (cfg.sheet === 'character' && cfg.innocents === 'host') {
    if (!String(impostorChar ?? '').trim()) out.push('Digite o personagem que o impostor vai receber.');
    else if (nameKey(impostorChar) === nameKey(innocentChar)) out.push('O personagem do impostor precisa ser diferente do personagem dos inocentes.');
  }
  const k = mode === 'imp_multi' ? cfg.count : 1;
  if (n >= MIN_PARTICIPANTS && k > maxImpostors(n)) {
    out.push(
      `Com ${n} jogadores participando, no máximo ${maxImpostors(n)} impostor(es): os inocentes precisam ser maioria (agora seriam ${n - k} inocente(s) para ${k} impostor(es)).`,
    );
  }
  if (mode !== 'imp_multi' && cfg.pick === 'host') {
    if (!impostorId) out.push('Escolha qual jogador será o impostor.');
    else if (!ids.includes(impostorId)) out.push('O jogador escolhido como impostor não está mais na partida. Escolha outro.');
  }
  return out;
}
