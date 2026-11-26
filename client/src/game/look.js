// Opções de visual do boneco (espelho de server/game/look.js: o servidor só aceita estes ids).
export const COLORS = [
  { id: 'white', name: 'Branco', hex: '#f6f6f3' },
  { id: 'gray', name: 'Cinza', hex: '#9aa3a0' },
  { id: 'red', name: 'Vermelho', hex: '#e5534b' },
  { id: 'orange', name: 'Laranja', hex: '#f08a3c' },
  { id: 'yellow', name: 'Amarelo', hex: '#f2c744' },
  { id: 'green', name: 'Verde', hex: '#4cae6a' },
  { id: 'teal', name: 'Turquesa', hex: '#3bb3a8' },
  { id: 'blue', name: 'Azul', hex: '#4f8fe0' },
  { id: 'purple', name: 'Roxo', hex: '#8b6bd6' },
  { id: 'pink', name: 'Rosa', hex: '#e87fae' },
];
export const HATS = [
  { id: 'none', name: 'Sem chapéu' },
  { id: 'cap', name: 'Boné' },
  { id: 'beanie', name: 'Gorro' },
  { id: 'tophat', name: 'Cartola' },
  { id: 'crown', name: 'Coroa' },
  { id: 'party', name: 'Chapéu de festa' },
];
export const NECKS = [
  { id: 'none', name: 'Nenhum' },
  { id: 'scarf', name: 'Cachecol' },
  { id: 'bowtie', name: 'Gravata-borboleta' },
];
export const OUTFITS = [
  { id: 'none', name: 'Sem roupa' },
  { id: 'tee', name: 'Camiseta' },
  { id: 'hoodie', name: 'Moletom' },
  { id: 'suit', name: 'Terno' },
  { id: 'apron', name: 'Avental' },
];
export const OUTFIT_COLORS = [
  { id: 'black', name: 'Preto', hex: '#2a2a30' },
  { id: 'white', name: 'Branco', hex: '#ececea' },
  { id: 'gray', name: 'Cinza', hex: '#8a9390' },
  { id: 'red', name: 'Vermelho', hex: '#d64545' },
  { id: 'orange', name: 'Laranja', hex: '#e8803a' },
  { id: 'yellow', name: 'Amarelo', hex: '#e8bf3c' },
  { id: 'green', name: 'Verde', hex: '#3f9d5f' },
  { id: 'teal', name: 'Turquesa', hex: '#2fa59a' },
  { id: 'blue', name: 'Azul', hex: '#3f7fd6' },
  { id: 'navy', name: 'Azul-marinho', hex: '#233a66' },
  { id: 'purple', name: 'Roxo', hex: '#7a5bc8' },
  { id: 'pink', name: 'Rosa', hex: '#de6f9f' },
];
export const FACES = [
  { id: 'none', name: 'Nenhum' },
  { id: 'glasses', name: 'Óculos' },
  { id: 'sunglasses', name: 'Óculos escuros' },
  { id: 'mustache', name: 'Bigode' },
];
export const DEFAULT_LOOK = { color: 'white', hat: 'none', neck: 'none', outfit: 'none', outfitColor: 'blue', face: 'none' };
export const outfitHex = (id) => (OUTFIT_COLORS.find((c) => c.id === id) ?? OUTFIT_COLORS[8]).hex;
/** Corpo do Julgador (modo JULGAMENTO): visual fixo, só enviado pelo servidor; nunca aparece nos menus de escolha. */
export const JUDGE_HEX = '#e0f04a';
export const colorHex = (id) => (id === 'judge' ? JUDGE_HEX : (COLORS.find((c) => c.id === id) ?? COLORS[0]).hex);

const KEY = 'qse-look';
/** Visual salvo neste navegador (ou null). Valida contra as listas: lixo no storage é ignorado. */
export function loadSavedLook() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw) return null;
    return {
      color: COLORS.some((c) => c.id === raw.color) ? raw.color : 'white',
      hat: HATS.some((h) => h.id === raw.hat) ? raw.hat : 'none',
      neck: NECKS.some((n) => n.id === raw.neck) ? raw.neck : 'none',
      outfit: OUTFITS.some((o) => o.id === raw.outfit) ? raw.outfit : 'none',
      outfitColor: OUTFIT_COLORS.some((c) => c.id === raw.outfitColor) ? raw.outfitColor : 'blue',
      face: FACES.some((f) => f.id === raw.face) ? raw.face : 'none',
    };
  } catch {
    return null;
  }
}
export function saveLook(look) {
  try {
    localStorage.setItem(KEY, JSON.stringify(look));
  } catch { /* armazenamento bloqueado: só não lembra */ }
}
export const sameLook = (a, b) => ['color', 'hat', 'neck', 'outfit', 'outfitColor', 'face'].every((k) => (a?.[k] ?? DEFAULT_LOOK[k]) === (b?.[k] ?? DEFAULT_LOOK[k]));
