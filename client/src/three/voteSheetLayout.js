// Geometria da folha de votação (puro, sem React/THREE: testável em Node).
// Segue a imagem de referência: por jogador, um quadrado grande (retrato) com "JOGADOR" embaixo,
// uma caixa de voto menor ao lado e o texto "IMPOSTOR" ao lado da caixa. Fundo cinza, traço preto grosso.
// Coordenadas em pixels do canvas da folha (CW x CH).

export const CW = 2048;
export const CH = 1536;

export const gridFor = (n) => {
  const cols = n <= 6 ? 2 : 3;
  return { cols, rows: Math.ceil(n / cols) };
};

// pequenas variações por registro (a referência não é perfeitamente alinhada): determinísticas
const jitter = (i, k) => (Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1;

/** Posição e tamanho de cada registro para `n` jogadores participantes. */
export function sheetCells(n) {
  const { cols, rows } = gridFor(n);
  const cw = CW / cols;
  const ch = CH / rows;
  const s = Math.min(cw * 0.28, ch * 0.55); // lado do retrato
  const box = s * 0.4; // lado da caixa de voto
  const gap = s * 0.06;
  const font = box * 0.62;
  const textW = font * 4.6; // largura aproximada de "IMPOSTOR"
  const total = s + gap + box + gap * 1.2 + textW;
  const cells = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jx = jitter(i, 1) * cw * 0.025;
    const jy = jitter(i, 2) * ch * 0.03;
    const x0 = col * cw + (cw - total) / 2 + jx;
    const y0 = row * ch + (ch - s * 1.22) / 2 + jy;
    const boxX = x0 + s + gap;
    const boxY = y0 + s * 0.545 - box / 2;
    cells.push({
      index: i,
      portrait: { x: x0, y: y0, s },
      box: { x: boxX, y: boxY, s: box, cx: boxX + box / 2, cy: boxY + box / 2 },
      text: { x: boxX + box + gap * 1.2, y: boxY + box / 2 + font * 0.03, font },
      label: { x: x0 + s / 2, y: y0 + s + s * 0.13, font: s * 0.085 },
      // área clicável: o registro inteiro
      hit: { x: x0, y: y0, w: total, h: s * 1.22 },
    });
  }
  return cells;
}

/**
 * O X vermelho, em unidades da caixa (a caixa vai de -0.5 a 0.5 nos dois eixos; y para baixo).
 * Os dois traços são curvas (aspecto de marcador à mão) e as extremidades ficam FORA da caixa.
 */
export const X_MARK = [
  { p0: [-0.66, -0.6], c: [-0.1, -0.12], p1: [0.62, 0.66] },
  { p0: [0.68, -0.64], c: [0.12, 0.06], p1: [-0.6, 0.62] },
];
/** Meia largura do quadro de textura do X, em unidades da caixa (o plano do X tem 2*X_EXTENT de lado). */
export const X_EXTENT = 1;
export const X_STROKE = 0.17; // espessura do traço (fração do lado da caixa)

/** Verdadeiro se o ponto (em unidades da caixa) está fora do quadrado da caixa. */
export const outsideBox = ([x, y]) => Math.max(Math.abs(x), Math.abs(y)) > 0.5;
