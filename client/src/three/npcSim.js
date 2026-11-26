// Simulação leve dos NPCs do bar (puramente cosmética, sem relação com o servidor).
// Cada NPC é um objeto mutável; `stepNpc` atualiza a pose a cada quadro.
// Convenção: yaw = atan2(dx, dz); a frente do boneco é (sin yaw, cos yaw).
//
// Tipos: bartender (atrás do balcão), waiter (garçom com bandeja), guest (cliente que anda,
// conversa, bebe e sai/entra pela porta) e seated (cliente sentado numa mesinha lateral).

import { DOOR_A, doorPoints, sideTables } from './layout.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Roupas: cada combinação é usada por um único NPC.
export const OUTFITS = [
  { shirt: '#c0504d', pants: '#2f3b52', shoes: '#2a2320', hair: '#3b2a20', hairStyle: 'short', acc: 'glasses', jacket: null },
  { shirt: '#4f81bd', pants: '#5a4a3a', shoes: '#f1f1f1', hair: '#d9b25f', hairStyle: 'long', acc: 'none', jacket: null },
  { shirt: '#e0a526', pants: '#27313a', shoes: '#7a3b1d', hair: '#1c1c1c', hairStyle: 'cap', acc: 'none', jacket: null },
  { shirt: '#7a4fa0', pants: '#1f1f24', shoes: '#c0392b', hair: '#8a4b2a', hairStyle: 'bun', acc: 'scarf', jacket: null },
  { shirt: '#3d9970', pants: '#c9b79a', shoes: '#3a2a1a', hair: '#2a2a2a', hairStyle: 'beanie', acc: 'none', jacket: '#2e5e4e' },
  { shirt: '#d9733b', pants: '#34495e', shoes: '#1f1f1f', hair: '#a8442a', hairStyle: 'short', acc: 'glasses', jacket: '#3a2a1a' },
  { shirt: '#e8e2d0', pants: '#6b2f3a', shoes: '#2a2320', hair: '#6d6d6d', hairStyle: 'hat', acc: 'none', jacket: null },
  { shirt: '#2f6f8f', pants: '#d7cfc0', shoes: '#9a6b3a', hair: '#111111', hairStyle: 'long', acc: 'scarf', jacket: null },
  { shirt: '#b8365a', pants: '#2a2a35', shoes: '#e9e0cf', hair: '#e5c07b', hairStyle: 'short', acc: 'none', jacket: '#1f1f24' },
  { shirt: '#6c8e3b', pants: '#4a3f35', shoes: '#2a2320', hair: '#5a3a24', hairStyle: 'cap', acc: 'glasses', jacket: null },
  { shirt: '#f0c14b', pants: '#2c3e50', shoes: '#c0392b', hair: '#222222', hairStyle: 'bun', acc: 'none', jacket: '#7a1f2b' },
  { shirt: '#8e9aa8', pants: '#3b2f4a', shoes: '#f1f1f1', hair: '#4a2c17', hairStyle: 'beanie', acc: 'scarf', jacket: null },
  { shirt: '#c96f4a', pants: '#1f3a5a', shoes: '#3a2a1a', hair: '#cfcfcf', hairStyle: 'short', acc: 'glasses', jacket: '#d9cdb4' },
  { shirt: '#4aa3a0', pants: '#5a2f2f', shoes: '#1f1f1f', hair: '#7a5a3a', hairStyle: 'long', acc: 'none', jacket: null },
  { shirt: '#a23b72', pants: '#2b3a42', shoes: '#f1f1f1', hair: '#1a1a1a', hairStyle: 'bun', acc: 'glasses', jacket: null },
  { shirt: '#5b7db1', pants: '#8a7a5a', shoes: '#3a2a1a', hair: '#c27a3a', hairStyle: 'short', acc: 'none', jacket: '#2a3a52' },
  { shirt: '#e6b422', pants: '#4a2f4f', shoes: '#1f1f1f', hair: '#8c8c8c', hairStyle: 'hat', acc: 'glasses', jacket: null },
  { shirt: '#2e8b57', pants: '#e0d6c0', shoes: '#c0392b', hair: '#3a2416', hairStyle: 'long', acc: 'scarf', jacket: null },
  { shirt: '#c4553a', pants: '#2a3342', shoes: '#e9e0cf', hair: '#101010', hairStyle: 'beanie', acc: 'none', jacket: '#d9a441' },
  { shirt: '#6a6f8a', pants: '#3f2e2a', shoes: '#2a2320', hair: '#d9b25f', hairStyle: 'cap', acc: 'none', jacket: null },
];
const BARTENDER = { shirt: '#f4f1ea', pants: '#1f1f24', shoes: '#111111', hair: '#2a1c14', hairStyle: 'hat', acc: 'vest', jacket: '#2b2b2f' };
const WAITERS = [
  { shirt: '#ffffff', pants: '#16161a', shoes: '#111111', hair: '#3b2a20', hairStyle: 'short', acc: 'bowtie', jacket: '#16161a' },
  { shirt: '#ffffff', pants: '#16161a', shoes: '#111111', hair: '#b8864b', hairStyle: 'bun', acc: 'bowtie', jacket: '#7a1f2b' },
];

export function createNpcs({ seatR, roomR, barFrom, barTo }) {
  const br = roomR - 2.2;
  const ring = { rIn: seatR + 1.3, rOut: br - 1.4 };
  const mid = (barFrom + barTo) / 2;
  const bartenderR = roomR - 1.1;
  const tables = sideTables(roomR);
  const door = doorPoints(roomR);

  const list = [];
  list.push({
    id: 0, kind: 'bartender', outfit: BARTENDER, state: 'work', until: rnd(2, 4), a: mid, ta: mid, bartenderR,
    x: Math.sin(mid) * bartenderR, z: Math.cos(mid) * bartenderR, yaw: mid + Math.PI, visible: true,
  });
  WAITERS.forEach((outfit, i) => {
    const a = barFrom + 0.4 + i * 0.6;
    const r = ring.rOut - 0.1;
    list.push({ id: list.length, kind: 'waiter', outfit, state: 'idle', until: rnd(0.5, 2) + i, carrying: false, x: Math.sin(a) * r, z: Math.cos(a) * r, yaw: a + Math.PI, visible: true, path: [], stateSince: 0 });
  });
  let o = 0;
  for (let i = 0; i < 5; i++) {
    const a = rnd(0, Math.PI * 2);
    const r = rnd(ring.rIn, ring.rOut);
    list.push({ id: list.length, kind: 'guest', outfit: OUTFITS[o++], state: 'idle', until: rnd(0.5, 3), partner: null, x: Math.sin(a) * r, z: Math.cos(a) * r, yaw: rnd(0, 6.28), visible: true, path: [], stateSince: 0 });
  }
  tables.forEach((t, ti) => {
    const ids = [];
    t.seats.forEach((s) => {
      const id = list.length;
      ids.push(id);
      list.push({ id, kind: 'seated', outfit: OUTFITS[o++], x: s.x, z: s.z, yaw: s.yaw, visible: true, table: ti, partner: null, phase: rnd(0, 20) });
    });
    list[ids[0]].partner = ids[1];
    list[ids[1]].partner = ids[0];
  });
  list.ring = ring;
  list.barFrom = barFrom;
  list.barTo = barTo;
  list.roomR = roomR;
  list.br = br;
  list.tables = tables;
  list.door = door;
  list.doorUntil = 0;
  return list;
}

/** Raio máximo permitido ao andar: o corredor dos clientes é mais estreito que o dos garçons. */
function limits(all, n, angle) {
  const rIn = all.ring.rIn;
  if (n.kind === 'waiter') {
    const inBar = Math.abs(angDiff(angle, (all.barFrom + all.barTo) / 2)) < (all.barTo - all.barFrom) / 2 + 0.08;
    return [rIn, inBar ? all.ring.rOut : all.roomR - 2.9];
  }
  return [rIn, all.ring.rOut];
}

function clampWalk(n, all) {
  const r = Math.hypot(n.x, n.z) || 1;
  const [lo, hi] = limits(all, n, Math.atan2(n.x, n.z));
  const target = Math.min(hi, Math.max(lo, r));
  if (target !== r) {
    // correção suave (no máximo 3 cm por quadro): não dá "pulo" ao cruzar o limite do balcão
    const c = r + Math.max(-0.03, Math.min(0.03, target - r));
    n.x *= c / r;
    n.z *= c / r;
  }
}

/** Anda em direção ao próximo ponto do caminho. Retorna true quando o caminho acabou. */
function follow(n, all, dt, speed, pose) {
  const w = n.path[0];
  if (!w) return true;
  const dx = w.x - n.x;
  const dz = w.z - n.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= (w.tol ?? 0.15)) {
    n.path.shift();
    return n.path.length === 0;
  }
  const v = Math.min(dist, speed * dt);
  let hx = dx / dist;
  let hz = dz / dist;
  // desvio: quem vem na frente é contornado pela DIREITA (todos desviam para o mesmo lado,
  // então dois que se encontram de frente se cruzam em vez de travar um no outro)
  const rx = hz;
  const rz = -hx;
  let steer = 0;
  for (const o of all) {
    if (o === n || !o.visible || (o.kind !== 'guest' && o.kind !== 'waiter')) continue;
    if (o.id === n.partner || o.id === n.target) continue;
    const ox = o.x - n.x;
    const oz = o.z - n.z;
    const d = Math.hypot(ox, oz);
    if (d > 1.5 || d < 0.001 || (ox * hx + oz * hz) / d < 0.2) continue;
    steer = Math.max(steer, (1.5 - d) / 1.5);
  }
  // vigia de travamento: se quer andar mas quase não sai do lugar, dá um passo largo para o lado
  const now = all.now ?? 0;
  const wd = n.wd || (n.wd = { x: n.x, z: n.z, t: now, bad: 0, until: 0 });
  if (now - wd.t > 0.7) {
    if (Math.hypot(n.x - wd.x, n.z - wd.z) < 0.15) {
      wd.bad += 1;
      wd.until = now + 0.7;
      if (wd.bad >= 5) {
        wd.bad = 0;
        n.path = []; // desiste deste destino; o estado seguinte escolhe outro
      }
    } else wd.bad = 0;
    wd.x = n.x;
    wd.z = n.z;
    wd.t = now;
  }
  if (now < wd.until) steer = Math.max(steer, 1.2);
  if (steer > 0) {
    // perto da borda do corredor, desvia para o lado livre (senão o limite do anel o empurra de volta e ele trava)
    const rr = Math.hypot(n.x, n.z) || 1;
    const radial = (rx * n.x + rz * n.z) / rr;
    const lo = all.ring.rIn + 0.35;
    const hi = all.ring.rOut - 0.35;
    const sign = (radial < 0 && rr < lo) || (radial > 0 && rr > hi) ? -1 : 1;
    hx += rx * sign * steer * 1.6;
    hz += rz * sign * steer * 1.6;
    const l = Math.hypot(hx, hz) || 1;
    hx /= l;
    hz /= l;
  }
  n.x += hx * v;
  n.z += hz * v;
  n.faceYaw = Math.atan2(hx, hz);
  pose.moving = true;
  if (!w.free) clampWalk(n, all);
  return false;
}

const ringPoint = (all, angle, f = 0.5) => {
  const r = all.ring.rIn + (all.ring.rOut - all.ring.rIn) * f;
  return { x: Math.sin(angle) * r, z: Math.cos(angle) * r };
};

// Estados em que o NPC está andando. Quem está parado (conversando, bebendo, servindo) NÃO é empurrado por quem
// passa: o que anda é quem abre caminho. Dois andando se afastam meio a meio.
const WALKING = new Set(['walk', 'walkTo', 'leaving', 'entering', 'toBar', 'toTable', 'toGuest']);
const SPACE = 0.85; // distância mínima entre dois NPCs que não são parceiros de conversa
const PARTNER_SPACE = 0.7;

function separate(n, all) {
  const nMoves = WALKING.has(n.state);
  for (const o of all) {
    if (o === n || !o.visible || (o.kind !== 'guest' && o.kind !== 'waiter')) continue;
    const dx = n.x - o.x;
    const dz = n.z - o.z;
    const d = Math.hypot(dx, dz);
    const paired = n.partner === o.id || n.target === o.id || o.target === n.id;
    const min = paired ? PARTNER_SPACE : SPACE;
    if (d > 0.001 && d < min) {
      const oMoves = WALKING.has(o.state);
      const share = nMoves === oMoves ? 0.5 : nMoves ? 1 : 0;
      n.x += (dx / d) * (min - d) * share;
      n.z += (dz / d) * (min - d) * share;
    }
  }
}

function holdDoor(n, all, now) {
  const [gx, gz] = all.door.gate;
  if (Math.hypot(n.x - gx, n.z - gz) < 2.6) all.doorUntil = now + 0.7;
}

export function stepNpc(n, all, dt, now) {
  all.now = now;
  const pose = { moving: false, armR: 0, armL: 0, headY: 0, headX: 0, carrying: false, seated: false };
  n.faceYaw = null;
  const setState = (s, extra = {}) => {
    n.state = s;
    n.stateSince = now;
    Object.assign(n, extra);
  };

  if (n.kind === 'bartender') {
    const speed = 0.6 / n.bartenderR;
    if (n.state === 'walk') {
      const d = angDiff(n.ta, n.a);
      n.a += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
      pose.moving = true;
      if (Math.abs(d) < 0.02) {
        n.state = 'work';
        n.until = now + rnd(3, 6);
      }
    } else {
      pose.armR = -0.95 + Math.sin(now * 6) * 0.22; // limpa um copo
      pose.armL = -0.8;
      pose.headX = 0.25;
      if (now > n.until) {
        n.state = 'walk';
        n.ta = all.barFrom + 0.3 + Math.random() * (all.barTo - all.barFrom - 0.6);
      }
    }
    n.x = Math.sin(n.a) * n.bartenderR;
    n.z = Math.cos(n.a) * n.bartenderR;
    n.yaw += angDiff(n.a + Math.PI, n.yaw) * Math.min(1, dt * 5);
  } else if (n.kind === 'seated') {
    pose.seated = true;
    const p = all[n.partner];
    const t = now + n.phase;
    const speaking = Math.floor(t / 3.2 + (n.id % 2)) % 2 === 0;
    pose.armR = speaking ? -0.55 + Math.sin(t * 5) * 0.3 : -0.2;
    pose.headX = speaking ? Math.sin(t * 3) * 0.04 : Math.sin(t * 2.4) * 0.12;
    pose.headY = speaking ? 0 : Math.sin(t * 0.6) * 0.1;
    const s = (t + n.id) % 9; // um gole
    if (s < 1.4 && !speaking) pose.armR = -1.8 * Math.sin((s / 1.4) * Math.PI);
    const ph = (now + Math.min(n.id, p?.id ?? n.id) * 1.9) % 7; // brinde sincronizado com o parceiro
    if (ph > 5.6 && ph < 6.6) {
      const c = Math.sin((ph - 5.6) * Math.PI);
      pose.armR = pose.armR * (1 - c) - 1.6 * c;
    }
  } else if (n.kind === 'waiter') {
    pose.carrying = n.carrying;
    if (n.carrying) {
      pose.armR = -1.25;
      pose.armL = -1.25;
    }
    if (n.state === 'idle') {
      if (now > n.until) {
        const a = all.barFrom + 0.3 + Math.random() * (all.barTo - all.barFrom - 0.6);
        n.path = [{ ...ringPoint(all, a, 0.92), tol: 0.2 }];
        setState('toBar');
      }
    } else if (n.state === 'toBar') {
      if (follow(n, all, dt, 1.0, pose) || now - n.stateSince > 25) {
        setState('pickup', { until: now + 1.6 });
      }
    } else if (n.state === 'pickup') {
      pose.armR = -1.1 + Math.sin(now * 4) * 0.1;
      pose.armL = -1.1;
      n.faceYaw = Math.atan2(n.x, n.z); // olha para fora, na direção do balcão
      if (now > n.until) {
        n.carrying = true;
        // destino: uma mesinha (60%) ou um cliente em pé
        const guests = all.filter((g) => g.kind === 'guest' && g.visible && g.state !== 'away');
        if (guests.length && Math.random() < 0.4) {
          n.target = pick(guests).id;
          n.path = [];
          setState('toGuest');
        } else {
          const t = pick(all.tables);
          const R = Math.hypot(t.cx, t.cz) - 1.15;
          n.path = [{ x: Math.sin(t.a) * R, z: Math.cos(t.a) * R, tol: 0.2 }];
          n.serveTable = t;
          setState('toTable');
        }
      }
    } else if (n.state === 'toGuest') {
      const g = all[n.target];
      if (!g || !g.visible) {
        n.carrying = false;
        setState('idle', { until: now + 1 });
      } else {
        n.path = [{ x: g.x, z: g.z, tol: 1.0 }];
        if (follow(n, all, dt, 1.0, pose) || now - n.stateSince > 25) {
          setState('serve', { until: now + 2, serveFace: Math.atan2(g.x - n.x, g.z - n.z) });
        }
      }
    } else if (n.state === 'toTable') {
      if (follow(n, all, dt, 1.0, pose) || now - n.stateSince > 30) {
        const t = n.serveTable;
        setState('serve', { until: now + 2, serveFace: Math.atan2(t.cx - n.x, t.cz - n.z) });
      }
    } else if (n.state === 'serve') {
      n.faceYaw = n.serveFace;
      const k = Math.min(1, (now - n.stateSince) / 0.8);
      pose.armR = -1.25 + k * 0.9; // baixa a bandeja
      pose.armL = -1.25 + k * 0.9;
      if (now > n.until) {
        n.carrying = false;
        setState('idle', { until: now + rnd(1, 3) });
      }
    }
    pose.carrying = n.carrying;
    separate(n, all);
    clampWalk(n, all);
  } else {
    // ---- cliente (guest)
    holdDoor(n, all, now);
    const p = n.partner != null ? all[n.partner] : null;

    if (n.state === 'idle') {
      const s = (now + n.id * 3) % 7;
      if (s < 1.3) pose.armR = -1.8 * Math.sin((s / 1.3) * Math.PI);
      pose.headY = Math.sin(now * 0.5 + n.id) * 0.4;
      if (now > n.until) {
        const away = all.filter((g) => g.kind === 'guest' && (g.state === 'away' || g.state === 'leaving')).length;
        const others = all.filter((o) => o.kind === 'guest' && o.id !== n.id && o.visible && o.state !== 'talk' && o.state !== 'away' && o.state !== 'leaving');
        const r = Math.random();
        if (r < 0.14 && away < 2) {
          n.path = [{ ...ringPoint(all, DOOR_A, 0.5), tol: 0.3 }, { x: all.door.inside[0], z: all.door.inside[1], free: true }, { x: all.door.gate[0], z: all.door.gate[1], free: true, tol: 0.1 }];
          setState('leaving');
        } else if (others.length && r < 0.7) {
          n.partner = pick(others).id;
          setState('walkTo');
        } else {
          n.path = [{ ...ringPoint(all, rnd(0, Math.PI * 2), Math.random()), tol: 0.15 }];
          setState('walk');
        }
      }
    } else if (n.state === 'walk' || n.state === 'leaving' || n.state === 'entering') {
      let finished = follow(n, all, dt, 0.9, pose);
      if (n.state === 'leaving' && Math.hypot(n.x - all.door.gate[0], n.z - all.door.gate[1]) < 0.6) finished = true; // chegou à porta
      if (finished || (n.state === 'walk' && now - n.stateSince > 25)) {
        if (n.state === 'leaving') {
          n.visible = false;
          setState('away', { until: now + rnd(10, 25) });
        } else {
          setState('idle', { until: now + rnd(2, 4) });
        }
      }
    } else if (n.state === 'away') {
      if (now > n.until) {
        n.visible = true;
        n.x = all.door.gate[0];
        n.z = all.door.gate[1];
        n.path = [{ x: all.door.inside[0], z: all.door.inside[1], free: true }, { ...ringPoint(all, DOOR_A + rnd(-0.4, 0.4), 0.5), tol: 0.3, free: true }];
        setState('entering');
      }
    } else if (n.state === 'walkTo') {
      if (!p || p.state === 'talk' || !p.visible || p.state === 'away' || p.state === 'leaving') {
        n.partner = null;
        setState('idle', { until: now + 1 });
      } else {
        n.path = [{ x: p.x, z: p.z, tol: 1.0 }];
        if (follow(n, all, dt, 0.9, pose)) {
          const until = now + rnd(6, 11);
          n.partner = p.id;
          setState('talk', { until });
          p.partner = n.id;
          p.state = 'talk';
          p.stateSince = now;
          p.until = until;
        } else if (now - n.stateSince > 25) {
          n.partner = null;
          setState('idle', { until: now + 1 });
        }
      }
    }

    if (n.state === 'talk') {
      if (!p || now > n.until) {
        setState('idle', { until: now + rnd(1.5, 3), partner: null });
      } else {
        n.faceYaw = Math.atan2(p.x - n.x, p.z - n.z);
        const speaking = (Math.floor(now / 3) + n.id) % 2 === 0;
        pose.armR = speaking ? -0.5 + Math.sin(now * 5) * 0.35 : -0.15;
        pose.headX = speaking ? 0 : Math.sin(now * 2.4) * 0.12;
        const ph = (now + Math.min(n.id, p.id) * 1.7) % 5.5;
        if (ph > 4.2 && ph < 5.2) {
          const c = Math.sin((ph - 4.2) * Math.PI);
          pose.armR = pose.armR * (1 - c) - 1.6 * c;
        }
      }
    }
    if (n.visible) {
      separate(n, all);
      const free = n.path[0]?.free;
      if (!free && n.state !== 'away') clampWalk(n, all);
    }
  }

  if (n.faceYaw !== null && n.faceYaw !== undefined) n.yaw += angDiff(n.faceYaw, n.yaw) * Math.min(1, dt * 6);
  if (pose.moving) n.phase = (n.phase ?? 0) + dt * 6;
  n.pose = pose;
}
