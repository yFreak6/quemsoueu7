// Visual (cosmético) do boneco de cada jogador. Dado público: todos veem o boneco dos outros.
// O servidor só aceita ids da lista abaixo; nada vindo do cliente vira cor/URL/texto livre.

export const LOOK_COLORS = ['white', 'gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];
export const LOOK_HATS = ['none', 'cap', 'beanie', 'tophat', 'crown', 'party'];
export const LOOK_NECKS = ['none', 'scarf', 'bowtie'];

export const LOOK_OUTFITS = ['none', 'tee', 'hoodie', 'suit', 'apron'];
export const LOOK_OUTFIT_COLORS = ['black', 'white', 'gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'navy', 'purple', 'pink'];
export const LOOK_FACES = ['none', 'glasses', 'sunglasses', 'mustache'];

export const DEFAULT_LOOK = Object.freeze({ color: 'white', hat: 'none', neck: 'none', outfit: 'none', outfitColor: 'blue', face: 'none' });

/** Valida um visual. Lança Error com mensagem em PT-BR se qualquer campo for desconhecido. */
export function parseLook(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Visual inválido.');
  const out = { ...DEFAULT_LOOK };
  const check = (key, list, label) => {
    if (raw[key] === undefined) return;
    if (typeof raw[key] !== 'string' || !list.includes(raw[key])) throw new Error(`${label} inválido.`);
    out[key] = raw[key];
  };
  check('color', LOOK_COLORS, 'Cor');
  check('hat', LOOK_HATS, 'Chapéu');
  check('neck', LOOK_NECKS, 'Acessório');
  check('outfit', LOOK_OUTFITS, 'Roupa');
  check('outfitColor', LOOK_OUTFIT_COLORS, 'Cor da roupa');
  check('face', LOOK_FACES, 'Rosto');
  return out;
}
