import * as THREE from 'three';

// Texturas procedurais desenhadas em <canvas>: nada de arquivos externos.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

// pseudo-aleatório determinístico: a textura é igual em todo cliente
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Tábuas de madeira clara com veios e juntas. */
export function makeWoodTexture({ base = [196, 150, 100], planks = 8, seed = 7, repeat = [4, 4] } = {}) {
  const [c, ctx] = canvas(512, 512);
  const rand = rng(seed);
  const ph = 512 / planks;
  for (let i = 0; i < planks; i++) {
    const k = 0.88 + rand() * 0.22;
    ctx.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
    ctx.fillRect(0, i * ph, 512, ph);
    for (let g = 0; g < 14; g++) {
      ctx.strokeStyle = `rgba(90,55,25,${0.05 + rand() * 0.09})`;
      ctx.lineWidth = 1 + rand() * 1.5;
      const y = i * ph + rand() * ph;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(170, y + (rand() - 0.5) * 8, 340, y + (rand() - 0.5) * 8, 512, y + (rand() - 0.5) * 4);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(60,35,15,.35)';
    ctx.fillRect(0, i * ph, 512, 2);
    const joint = rand() * 512;
    ctx.fillRect(joint, i * ph, 2, ph);
  }
  return finish(c, repeat[0], repeat[1]);
}

/** Feltro verde com grão. */
export function makeFeltTexture({ color = [47, 158, 99], seed = 3, repeat = [3, 3] } = {}) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = `rgb(${color.join(',')})`;
  ctx.fillRect(0, 0, 256, 256);
  const rand = rng(seed);
  for (let i = 0; i < 5000; i++) {
    const v = rand();
    ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,30,10,.08)';
    ctx.fillRect(rand() * 256, rand() * 256, 1.5, 1.5);
  }
  return finish(c, repeat[0], repeat[1]);
}

/** Reboco claro com pequenas manchas e faixa de papel de parede. */
export function makeWallTexture({ color = [240, 230, 212], seed = 11, repeat = [8, 1] } = {}) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = `rgb(${color.join(',')})`;
  ctx.fillRect(0, 0, 256, 256);
  const rand = rng(seed);
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(120,90,50,.06)';
    ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  ctx.fillStyle = 'rgba(160,125,80,.10)';
  for (let x = 0; x < 256; x += 32) ctx.fillRect(x, 0, 6, 256);
  return finish(c, repeat[0], repeat[1]);
}

/** Tapete redondo com bordas listradas. */
export function makeRugTexture() {
  const [c, ctx] = canvas(512, 512);
  const g = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
  g.addColorStop(0, '#b9573f');
  g.addColorStop(0.78, '#a34a35');
  g.addColorStop(0.8, '#e9d9b8');
  g.addColorStop(0.86, '#e9d9b8');
  g.addColorStop(0.88, '#7d3827');
  g.addColorStop(1, '#7d3827');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const rand = rng(5);
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
    ctx.fillRect(rand() * 512, rand() * 512, 2, 2);
  }
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Tijolinhos escuros de bar. */
export function makeBrickTexture({ repeat = [10, 1.5] } = {}) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#2b1a14';
  ctx.fillRect(0, 0, 256, 256);
  const rand = rng(23);
  const bh = 32;
  const bw = 64;
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 5; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0);
      const k = 0.75 + rand() * 0.5;
      ctx.fillStyle = `rgb(${130 * k | 0},${58 * k | 0},${42 * k | 0})`;
      ctx.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
    }
  }
  return finish(c, repeat[0], repeat[1]);
}

/** Piso de ladrilhos xadrez. */
export function makeCheckerTexture({ repeat = [8, 8] } = {}) {
  const [c, ctx] = canvas(256, 256);
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#d9cdb4' : '#2a2320';
      ctx.fillRect(x * 128, y * 128, 128, 128);
    }
  const rand = rng(9);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)';
    ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  return finish(c, repeat[0], repeat[1]);
}

/** Letreiro de neon (texto desenhado em canvas). */
export function makeNeonTexture(text = 'BAR') {
  const [c, ctx] = canvas(512, 256);
  ctx.clearRect(0, 0, 512, 256);
  ctx.font = '900 150px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ff3d8b';
  ctx.shadowBlur = 40;
  ctx.fillStyle = '#ff8ac0';
  for (let i = 0; i < 3; i++) ctx.fillText(text, 256, 130);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff0f7';
  ctx.fillText(text, 256, 130);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const POSTERS = [
  { bg: '#1f3b57', fg: '#ffd166', title: 'LIVE MUSIC', sub: 'SEXTA 21H', shape: 'sun' },
  { bg: '#7a1f2b', fg: '#f6e7c8', title: 'COLD BEER', sub: 'SEMPRE GELADA', shape: 'stripes' },
  { bg: '#27483a', fg: '#f1d58a', title: 'JAZZ NIGHT', sub: 'ENTRADA FRANCA', shape: 'moon' },
  { bg: '#3b2a52', fg: '#ff9ec7', title: 'HAPPY HOUR', sub: '18H – 20H', shape: 'sun' },
];

/** Pôsteres de bar desenhados em canvas (4 variações). */
export function makePosterTexture(i = 0) {
  const p = POSTERS[i % POSTERS.length];
  const [c, ctx] = canvas(256, 340);
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, 256, 340);
  ctx.strokeStyle = p.fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, 232, 316);
  ctx.fillStyle = p.fg;
  if (p.shape === 'sun') {
    ctx.beginPath();
    ctx.arc(128, 130, 54, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.fillRect(128 + Math.cos(a) * 66 - 4, 130 + Math.sin(a) * 66 - 4, 8, 8);
    }
  } else if (p.shape === 'stripes') {
    for (let k = 0; k < 5; k++) ctx.fillRect(40, 60 + k * 22, 176, 10);
  } else {
    ctx.beginPath();
    ctx.arc(128, 130, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.bg;
    ctx.beginPath();
    ctx.arc(150, 118, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.fg;
  }
  ctx.textAlign = 'center';
  ctx.font = '900 34px system-ui, sans-serif';
  ctx.fillText(p.title, 128, 248);
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.fillText(p.sub, 128, 284);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Relógio de parede e alvo de dardos. */
export function makeDiscTexture(kind) {
  const [c, ctx] = canvas(256, 256);
  const cx = 128;
  if (kind === 'clock') {
    ctx.fillStyle = '#3a2217';
    ctx.beginPath(); ctx.arc(cx, cx, 126, 0, 7); ctx.fill();
    ctx.fillStyle = '#f6efe0';
    ctx.beginPath(); ctx.arc(cx, cx, 112, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2a2320'; ctx.lineCap = 'round';
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.lineWidth = k % 3 === 0 ? 7 : 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.sin(a) * 92, cx - Math.cos(a) * 92);
      ctx.lineTo(cx + Math.sin(a) * 104, cx - Math.cos(a) * 104);
      ctx.stroke();
    }
    ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(cx, cx); ctx.lineTo(cx + Math.sin(-2.1) * 50, cx - Math.cos(-2.1) * 50); ctx.stroke();
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx, cx); ctx.lineTo(cx + Math.sin(2.1) * 80, cx - Math.cos(2.1) * 80); ctx.stroke();
  } else {
    const rings = ['#1b1b1b', '#e9dcb8', '#1b1b1b', '#c0392b', '#1b1b1b', '#2e7d4f'];
    for (let k = 0; k < rings.length; k++) {
      ctx.fillStyle = k % 2 ? '#e9dcb8' : '#1b1b1b';
      if (k === 3) ctx.fillStyle = '#c0392b';
      if (k === 5) ctx.fillStyle = '#2e7d4f';
      ctx.beginPath(); ctx.arc(cx, cx, 126 - k * 20, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(cx, cx, 8, 0, 7); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Letreiro de neon genérico (cor e texto). */
export function makeNeonTextTexture(text, glow = '#3de0ff', core = '#e8fcff') {
  const [c, ctx] = canvas(512, 192);
  ctx.font = '900 120px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = glow;
  ctx.shadowBlur = 36;
  ctx.fillStyle = glow;
  for (let i = 0; i < 3; i++) ctx.fillText(text, 256, 100);
  ctx.shadowBlur = 0;
  ctx.fillStyle = core;
  ctx.fillText(text, 256, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
