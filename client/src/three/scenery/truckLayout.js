// Dados puros (sem three/React) do cenário da caminhonete: a caçamba, a rodovia e a faixa de cidade que "passa".
// Ficam separados do componente para serem fáceis de ajustar e testáveis em Node.
//
// UNIDADES: a rodovia/cidade é descrita em METROS (pista de 3,5 m etc.) e o componente a escala por `roadScale`
// para ficar proporcional à mesa (que é grande em relação ao boneco). A caçamba é descrita em unidades do jogo.

export const LANE = 3.5; // largura de uma pista (m)
export const ROAD_HALF = LANE * 1.5; // 3 pistas: a caminhonete vai na do meio
export const SIDEWALK = { from: ROAD_HALF, width: 2.4, h: 0.16 };
export const PERIOD = 30; // comprimento (m) do trecho que se repete; a rodovia "infinita" é ele deslizando em ciclo
export const COPIES = [-1, 0, 1]; // cópias do trecho: cobrem de +PERIOD a -2·PERIOD (m) antes do deslocamento
export const SPEED = 15; // m/s com que a paisagem passa (≈54 km/h)
export const ROAD_Y = -1.1; // altura da pista em relação ao piso da caçamba (y = 0)

export const PALETTE = {
  asphalt: '#4b4b52',
  line: '#f3eee0',
  sidewalk: '#cdbfae',
  ground: '#8f9a6a',
  truck: '#c0392b',
  truckDark: '#8c2a20',
  bedFloor: '#4a3a32',
  bedInside: '#6b2a22',
  glass: '#26323c',
  tire: '#232323',
  building: ['#c4623f', '#d9b48a', '#b9573c', '#e0c7a0', '#a9795a', '#d18a62'],
  crown: ['#8fae4a', '#7fa14a', '#a3b95a'],
};

/** Medidas da caçamba a partir do raio dos assentos: as cadeiras sempre cabem folgadas dentro dela. */
export function truckDims(seatR) {
  const hw = seatR + 0.85; // meia largura da caçamba (face interna das laterais)
  const half = seatR + 0.85; // meio comprimento
  const lane = LANE;
  // escala da rodovia: no mínimo 2,6 e sempre grande o bastante para a caçamba caber numa pista (com folga)
  const roadScale = Math.max(2.6, (2 * hw + 1.4) / lane);
  return { hw, half, wallH: 0.8, wallT: 0.2, gateH: 0.55, roadScale };
}

/** Deslocamento (m, em [0, PERIOD)) do trecho no instante t (s): o trecho é periódico, então o ciclo é imperceptível. */
export function stripOffset(t, speed = SPEED, period = PERIOD) {
  const v = (t * speed) % period;
  return v < 0 ? v + period : v;
}

/**
 * Um trecho de PERIOD metros, repetido nas cópias COPIES. Tudo determinístico (igual em todo cliente) e
 * PERIÓDICO: o conteúdo em z e em z - PERIOD é idêntico, por isso o ciclo não "pula".
 * Cada item usa coordenadas em metros; z negativo = à frente da caminhonete.
 */
export function buildStrip() {
  const buildings = [];
  const trees = [];
  const lamps = [];
  const dashes = [];
  const sideTone = { '-1': 0, 1: 3 };
  const heights = [[16, 22], [12, 18]]; // por lado, 2 prédios por trecho
  const bx = SIDEWALK.from + SIDEWALK.width + 0.3;

  for (const c of COPIES) {
    const z0 = -c * PERIOD - PERIOD; // início (mais à frente) da cópia c; ela ocupa [z0, z0 + PERIOD]
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const d = 11;
        const h = heights[side === -1 ? 0 : 1][i];
        buildings.push({
          x: side * (bx + d / 2),
          y: h / 2, // relativo à pista (y = 0)
          z: z0 + i * 15 + 7.5,
          w: d,
          h,
          d: 13.6,
          color: PALETTE.building[(i * 2 + sideTone[side]) % PALETTE.building.length],
        });
      }
      for (let i = 0; i < 2; i++) {
        trees.push({ x: side * (SIDEWALK.from + 0.9), z: z0 + 6 + i * 15, trunkH: 2.2 + i * 0.25, crownR: 1.55 + i * 0.12, tint: (i + (side > 0 ? 1 : 0)) % PALETTE.crown.length });
      }
      lamps.push({ x: side * (SIDEWALK.from + SIDEWALK.width - 0.35), z: z0 + 13.5, side });
      lamps.push({ x: side * (SIDEWALK.from + SIDEWALK.width - 0.35), z: z0 + 28.5, side });
    }
    for (const x of [-LANE / 2, LANE / 2]) {
      for (let i = 0; i < 3; i++) dashes.push({ x, z: z0 + i * 10 + 1.5 });
    }
  }
  return { buildings, trees, lamps, dashes };
}

/** Nuvens baixas e achatadas, fixas no céu (poucos blobs em 1 chamada de desenho). Posições em unidades do jogo. */
export function buildClouds() {
  const base = [
    [-30, 24, -42, 5],
    [-6, 30, -50, 6.5],
    [24, 22, -44, 4.6],
    [38, 28, -20, 5.2],
    [-38, 27, -14, 5.5],
    [8, 34, 6, 5],
  ];
  const out = [];
  for (const [x, y, z, r] of base) {
    out.push({ x, y, z, sx: r * 1.6, sy: r * 0.55, sz: r });
    out.push({ x: x + r * 1.1, y: y - 0.6, z: z + 0.6, sx: r * 1.1, sy: r * 0.45, sz: r * 0.75 });
    out.push({ x: x - r * 1.0, y: y - 0.8, z: z - 0.4, sx: r * 1.0, sy: r * 0.4, sz: r * 0.7 });
  }
  return out;
}

/** Carros à frente, nas pistas vizinhas (m). Andam na mesma velocidade, então ficam parados em relação à caminhonete. */
export const TRAFFIC = [
  { x: LANE, z: -14, color: '#c0392b' },
  { x: -LANE, z: -21, color: '#3f6fb5' },
  { x: 0, z: -34, color: '#e8e2d2' },
];
