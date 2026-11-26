// Geometria da mesa. Os assentos crescem com o número de jogadores.
// Assento i fica no ângulo 2π·i/n. O jogador do assento seguinte (i+1) está
// sempre à DIREITA de quem está sentado, então "passar para a direita" = seat + 1.

export const EYE_HEIGHT = 1.42;
export const TABLE_TOP = 0.8; // altura da superfície da mesa

export function tableLayout(n) {
  const seatR = Math.max(2.3, 0.33 * n + 0.4);
  return { seatR, tableR: seatR - 0.45, roomR: seatR + 7, wallH: 4.6 };
}

export const seatAngle = (seat, n) => (seat / n) * Math.PI * 2;

export function seatPosition(seat, n, seatR) {
  const a = seatAngle(seat, n);
  return [Math.sin(a) * seatR, 0, Math.cos(a) * seatR];
}

// Trecho da parede (em radianos) ocupado pelo balcão do bar
export const BAR_FROM = 0.9;
export const BAR_TO = 2.5;

// Porta de entrada/saída dos NPCs (ângulo na parede)
export const DOOR_A = 2.78;
export function doorPoints(roomR) {
  const p = (r) => [Math.sin(DOOR_A) * r, Math.cos(DOOR_A) * r];
  return { inside: p(roomR - 1.3), gate: p(roomR - 0.5), ring: (r) => p(r) };
}

// Mesinhas laterais com NPCs sentados (perto da parede, longe da mesa do jogo e do balcão)
export const SIDE_TABLE_ANGLES = [0.58, 3.45, 4.2, 4.95, 5.55];
export function sideTables(roomR) {
  const R = roomR - 2.1;
  return SIDE_TABLE_ANGLES.map((a) => {
    const cx = Math.sin(a) * R;
    const cz = Math.cos(a) * R;
    const tx = Math.cos(a);
    const tz = -Math.sin(a); // tangente
    const seats = [-1, 1].map((s) => {
      const x = cx + tx * 0.78 * s;
      const z = cz + tz * 0.78 * s;
      return { x, z, yaw: Math.atan2(cx - x, cz - z) };
    });
    return { cx, cz, a, seats };
  });
}
