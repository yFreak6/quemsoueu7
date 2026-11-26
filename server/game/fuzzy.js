// Comparação tolerante de chutes. Por padrão compara o NOME COMPLETO. Com a lista dos outros
// personagens em jogo (opts.others), também aceita uma PARTE do nome ("Remy" para "Remy
// Ratatouille"), desde que ela não valha para outro personagem da partida. Aceita:
//   - maiúsculas, acentos, pontuação e espaços diferentes;
//   - letras trocadas de lugar, faltando, sobrando ou erradas (distância de Damerau-Levenshtein);
//   - erros de grafia que soam igual (ph/f, k/c/qu, y/i, w/u, z/s, ss/ç, h mudo, letras dobradas);
//   - nomes escritos por quem não sabe a grafia: se o "esqueleto" de consoantes é o mesmo
//     (Epstein ≈ Episten), vale, desde que a distância total continue pequena.

export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chave canônica de um nome (sem espaços): usada para comparar e para achar duplicados. */
export const nameKey = (text) => normalize(text).replace(/ /g, '');

/** Distância de edição que conta a troca de duas letras vizinhas ("Eintsein") como 1 erro. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Quantos erros são aceitos conforme o tamanho do nome (sem espaços). */
export function allowedErrors(length) {
  if (length <= 3) return 0; // "Rei", "Ana": tem que ser exato
  if (length <= 5) return 1; // "Thor", "Shrek"
  if (length <= 8) return 2; // "Batman", "Epstein"
  if (length <= 12) return 3; // "Cleopatra", "Darth Vader"
  return 4; // "Albert Einstein", "Capitão América"
}

/** Aproxima a pronúncia: letras que soam parecido viram a mesma letra. */
export function phonetic(key) {
  return key
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'k')
    .replace(/sh|ch/g, 'x')
    .replace(/th/g, 't')
    .replace(/c(?=[ei])/g, 's')
    .replace(/c/g, 'k')
    .replace(/g(?=[ei])/g, 'j')
    .replace(/[wy]/g, (m) => (m === 'w' ? 'u' : 'i'))
    .replace(/z/g, 's')
    .replace(/h/g, '')
    .replace(/(.)\1+/g, '$1'); // letras dobradas: "Elvis"/"Ellvis"
}

const consonants = (key) => key.replace(/[aeiou]/g, '');

function matchesWhole(guess, answer) {
  const g = nameKey(guess);
  const a = nameKey(answer);
  if (g.length < 2 || !a) return false;
  if (g === a) return true;

  const tol = allowedErrors(a.length);
  const dist = levenshtein(g, a);

  // nomes curtos: a primeira letra tem que bater (evita "Duke" valer por "Luke")
  const firstOk = a.length > 5 || g[0] === a[0];
  if (dist <= tol && firstOk) return true;

  // soa igual: compara depois de aproximar a pronúncia
  const pg = phonetic(g);
  const pa = phonetic(a);
  if (pg === pa) return true;
  if (a.length > 3 && levenshtein(pg, pa) <= Math.max(0, tol - 1) && g[0] === a[0]) return true;

  // mesmo esqueleto de consoantes (Epstein ≈ Episten): só em nomes de 6+ letras e com poucos erros no total
  if (a.length >= 6 && g[0] === a[0] && consonants(pg).length >= 4 && consonants(pg) === consonants(pa)) {
    return dist <= Math.floor(a.length / 3) + 1;
  }
  return false;
}

// palavras que sozinhas não identificam ninguém ("de", "the"...)
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'os', 'as', 'the', 'of', 'von', 'van', 'di', 'del', 'la', 'le', 'el']);

/** O chute é um trecho contínuo e significativo do nome ("Remy" em "Remy Ratatouille")? */
export function matchesPartial(guess, answer) {
  const gw = normalize(guess).split(' ').filter(Boolean);
  const aw = normalize(answer).split(' ').filter(Boolean);
  if (!gw.length || gw.length >= aw.length) return false; // nome completo já é tratado em matchesWhole
  if (nameKey(guess).length < 3) return false;
  for (let i = 0; i + gw.length <= aw.length; i += 1) {
    const win = aw.slice(i, i + gw.length);
    if (win.every((w) => STOP.has(w))) continue;
    if (matchesWhole(guess, win.join(' '))) return true;
  }
  return false;
}

/**
 * @param opts.others nomes dos OUTROS personagens em jogo. Sem isso só vale o nome completo.
 *   Com isso, parte do nome vale se não for ambígua (se também servir para outro personagem, não vale).
 */
export function isGuessCorrect(guess, answer, opts) {
  if (matchesWhole(guess, answer)) return true;
  if (!opts || !Array.isArray(opts.others)) return false;
  if (!matchesPartial(guess, answer)) return false;
  return !opts.others.some((o) => o && (matchesWhole(guess, o) || matchesPartial(guess, o)));
}
